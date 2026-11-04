// atlas-sync: guarda el progreso del Atlas Anatómico por "código de sincronización".
//   GET  /v1/p/<CODIGO>   -> progreso guardado (404 si no existe)
//   PUT  /v1/p/<CODIGO>   -> combina el progreso enviado con el guardado y lo devuelve
// El código actúa como contraseña: en KV solo se guarda su hash (SHA-256).
// Cloudflare Workers + KV (plan gratis: 1.000 escrituras/día; el cliente agrupa los envíos).

const ALLOWED = ['https://andresproano.github.io', 'http://127.0.0.1', 'http://localhost'];
const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const MAX_BYTES = 256 * 1024;
const MAX_ITEMS = 6000;

function allowedOrigin(origin) {
  return !!origin && ALLOWED.some((a) => origin === a || origin.startsWith(`${a}:`));
}
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function keyFor(code) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`atlas-sync:${code}`));
  return `p:${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// valida y limpia lo que llega del navegador
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
  const name = typeof body.name === 'string' ? body.name.slice(0, 40) : 'Sin nombre';
  return { name, progress };
}
// gana el registro más reciente de cada estructura
function merge(stored, incoming) {
  const out = { name: incoming.name || stored?.name || 'Sin nombre', progress: { ...(stored?.progress || {}) } };
  for (const [k, r] of Object.entries(incoming.progress)) {
    const s = out.progress[k];
    if (!s || (r.t || 0) >= (s.t || 0)) out.progress[k] = r;
  }
  out.updated = Date.now();
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const headers = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/' || url.pathname === '/v1') return json({ ok: true, service: 'atlas-sync' }, 200, headers);

    const m = url.pathname.match(/^\/v1\/p\/([^/]+)$/);
    if (!m) return json({ error: 'ruta no encontrada' }, 404, headers);
    if (origin && !allowedOrigin(origin)) return json({ error: 'origen no permitido' }, 403, headers);
    const code = m[1];
    if (!CODE_RE.test(code)) return json({ error: 'código inválido' }, 400, headers);
    const key = await keyFor(code);

    if (req.method === 'GET') {
      const data = await env.ATLAS.get(key, 'json');
      return data ? json(data, 200, headers) : json({ error: 'no existe' }, 404, headers);
    }
    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: 'demasiado grande' }, 413, headers);
      let body;
      try { body = clean(JSON.parse(text)); } catch { body = null; }
      if (!body) return json({ error: 'datos inválidos' }, 400, headers);
      const stored = await env.ATLAS.get(key, 'json');
      const merged = merge(stored, body);
      await env.ATLAS.put(key, JSON.stringify(merged));
      return json(merged, 200, headers);
    }
    return json({ error: 'método no permitido' }, 405, headers);
  },
};
