// atlas-sync: cuentas y progreso del Atlas Anatómico (Cloudflare Workers + KV).
//
// Cuentas (correo + contraseña):
//   POST /v1/auth/register  { email, password, name }        -> { token, name, email, recovery }
//   POST /v1/auth/login     { email, password }              -> { token, name, email }
//   POST /v1/auth/logout    (Authorization: Bearer <token>)
//   POST /v1/auth/reset     { email, recovery, password }    -> { token, name, email, recovery }
//   GET  /v1/me/progress    (Bearer)                         -> { name, progress, updated }
//   PUT  /v1/me/progress    (Bearer) { progress }            -> combinado
// Código de sincronización (versión anterior, se mantiene):
//   GET/PUT /v1/p/<CODIGO>
//
// En KV:  u:<correo>  usuario (contraseña con PBKDF2 + sal, código de recuperación hasheado)
//         s:<token>   sesión (vence en 180 días)        pu:<id>  progreso de la cuenta
//         rl:<correo> intentos fallidos (bloqueo temporal)

const ALLOWED = ['https://andresproano.github.io', 'http://127.0.0.1', 'http://localhost'];
const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const MAX_BYTES = 256 * 1024;
const MAX_ITEMS = 6000;
const PBKDF2_ITER = 50000;
const SESSION_TTL = 180 * 24 * 3600; // segundos
const MAX_FAILS = 8, LOCK_SECONDS = 15 * 60;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function allowedOrigin(origin) {
  return !!origin && ALLOWED.some((a) => origin === a || origin.startsWith(`${a}:`));
}
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// --- utilidades criptográficas -------------------------------------------------------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
function randomHex(bytes) { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }
function recoveryCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
async function hashPassword(password, salt, iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return hex(bits);
}
function safeEqual(a, b) { // comparación en tiempo constante
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const normEmail = (e) => String(e || '').trim().toLowerCase();
const keyFor = async (code) => `p:${await sha256(`atlas-sync:${code}`)}`;

// --- progreso ------------------------------------------------------------------------------
function clean(body) {
  if (!body || typeof body !== 'object' || typeof body.progress !== 'object' || Array.isArray(body.progress)) return null;
  const entries = Object.entries(body.progress);
  if (entries.length > MAX_ITEMS) return null;
  const progress = {};
  for (const [k, r] of entries) {
    if (typeof k !== 'string' || k.length > 160 || !r || typeof r !== 'object') continue;
    const n = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : 0);
    progress[k] = { a: n(r.a, 1e6), c: n(r.c, 1e6), box: n(r.box, 4), t: n(r.t, 1e14) };
  }
  const name = typeof body.name === 'string' ? body.name.slice(0, 40) : undefined;
  return { name, progress };
}
function merge(stored, incoming) {
  const out = { name: incoming.name || stored?.name || 'Sin nombre', progress: { ...(stored?.progress || {}) } };
  for (const [k, r] of Object.entries(incoming.progress)) {
    const s = out.progress[k];
    if (!s || (r.t || 0) >= (s.t || 0)) out.progress[k] = r;
  }
  out.updated = Date.now();
  return out;
}
async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return { error: 'demasiado grande', status: 413 };
  try { return { data: JSON.parse(text) }; } catch { return { error: 'datos inválidos', status: 400 }; }
}

// --- cuentas ---------------------------------------------------------------------------------
async function tooManyFails(env, email) {
  const r = await env.ATLAS.get(`rl:${email}`, 'json');
  return r && r.n >= MAX_FAILS;
}
async function addFail(env, email) {
  const r = (await env.ATLAS.get(`rl:${email}`, 'json')) || { n: 0 };
  await env.ATLAS.put(`rl:${email}`, JSON.stringify({ n: r.n + 1 }), { expirationTtl: LOCK_SECONDS });
}
async function newSession(env, user) {
  const token = randomHex(32);
  await env.ATLAS.put(`s:${await sha256(token)}`, JSON.stringify({ id: user.id, email: user.email, created: Date.now() }), { expirationTtl: SESSION_TTL });
  return token;
}
async function sessionFrom(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  return env.ATLAS.get(`s:${await sha256(m[1])}`, 'json');
}

async function auth(action, req, env, headers) {
  if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405, headers);
  if (action === 'logout') {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.ATLAS.delete(`s:${await sha256(m[1])}`);
    return json({ ok: true }, 200, headers);
  }
  const { data, error, status } = await readBody(req);
  if (error) return json({ error }, status, headers);
  const email = normEmail(data.email);
  const password = typeof data.password === 'string' ? data.password : '';
  if (!EMAIL_RE.test(email)) return json({ error: 'Escribe un correo válido' }, 400, headers);
  if (await tooManyFails(env, email)) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429, headers);
  const userKey = `u:${email}`;

  if (action === 'register') {
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400, headers);
    if (await env.ATLAS.get(userKey)) return json({ error: 'Ya existe una cuenta con ese correo' }, 409, headers);
    const name = String(data.name || '').trim().slice(0, 40) || email.split('@')[0];
    const salt = randomHex(16), recovery = recoveryCode();
    const user = {
      id: randomHex(12), email, name, salt, iter: PBKDF2_ITER,
      hash: await hashPassword(password, salt), rec: await sha256(`rec:${salt}:${recovery}`), created: Date.now(),
    };
    await env.ATLAS.put(userKey, JSON.stringify(user));
    return json({ token: await newSession(env, user), name, email, recovery }, 201, headers);
  }

  const user = await env.ATLAS.get(userKey, 'json');
  if (action === 'login') {
    const ok = user && safeEqual(await hashPassword(password, user.salt, user.iter), user.hash);
    if (!ok) { await addFail(env, email); return json({ error: 'Correo o contraseña incorrectos' }, 401, headers); }
    await env.ATLAS.delete(`rl:${email}`);
    return json({ token: await newSession(env, user), name: user.name, email }, 200, headers);
  }
  if (action === 'reset') {
    const recovery = String(data.recovery || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4}).*/, '$1-$2-$3');
    const ok = user && safeEqual(await sha256(`rec:${user.salt}:${recovery}`), user.rec);
    if (!ok) { await addFail(env, email); return json({ error: 'Correo o código de recuperación incorrectos' }, 401, headers); }
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400, headers);
    // nueva contraseña y nuevo código de recuperación (el usado deja de servir)
    const salt = randomHex(16), next = recoveryCode();
    Object.assign(user, { salt, iter: PBKDF2_ITER, hash: await hashPassword(password, salt), rec: await sha256(`rec:${salt}:${next}`) });
    await env.ATLAS.put(userKey, JSON.stringify(user));
    await env.ATLAS.delete(`rl:${email}`);
    return json({ token: await newSession(env, user), name: user.name, email, recovery: next }, 200, headers);
  }
  return json({ error: 'ruta no encontrada' }, 404, headers);
}

async function storeProgress(req, env, key, headers, extra = {}) {
  if (req.method === 'GET') {
    const d = await env.ATLAS.get(key, 'json');
    return d ? json({ ...d, ...extra }, 200, headers) : json({ error: 'no existe', ...extra }, 404, headers);
  }
  if (req.method === 'PUT') {
    const { data, error, status } = await readBody(req);
    if (error) return json({ error }, status, headers);
    const body = clean(data);
    if (!body) return json({ error: 'datos inválidos' }, 400, headers);
    const merged = merge(await env.ATLAS.get(key, 'json'), { ...body, name: body.name || extra.name });
    await env.ATLAS.put(key, JSON.stringify(merged));
    return json({ ...merged, ...extra }, 200, headers);
  }
  return json({ error: 'método no permitido' }, 405, headers);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const headers = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/' || url.pathname === '/v1') return json({ ok: true, service: 'atlas-sync' }, 200, headers);
    if (origin && !allowedOrigin(origin)) return json({ error: 'origen no permitido' }, 403, headers);

    const a = url.pathname.match(/^\/v1\/auth\/(register|login|logout|reset)$/);
    if (a) return auth(a[1], req, env, headers);

    if (url.pathname === '/v1/me/progress') {
      const s = await sessionFrom(req, env);
      if (!s) return json({ error: 'sesión vencida, vuelve a iniciar sesión' }, 401, headers);
      const user = await env.ATLAS.get(`u:${s.email}`, 'json');
      if (!user) return json({ error: 'la cuenta no existe' }, 401, headers);
      return storeProgress(req, env, `pu:${user.id}`, headers, { name: user.name, email: user.email });
    }

    const m = url.pathname.match(/^\/v1\/p\/([^/]+)$/);
    if (m) {
      if (!CODE_RE.test(m[1])) return json({ error: 'código inválido' }, 400, headers);
      return storeProgress(req, env, await keyFor(m[1]), headers);
    }
    return json({ error: 'ruta no encontrada' }, 404, headers);
  },
};
