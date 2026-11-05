// Sincronización en la nube (Cloudflare Worker "atlas-sync", ver worker/).
// Forma principal: cuenta con correo y contraseña. Cada perfil local puede estar ligado a una cuenta;
// el progreso se sube solo y se recupera al iniciar sesión en otro dispositivo.
// Se mantiene el "código de sincronización" de la versión anterior para quien ya lo activó.
const DEFAULT_URL = 'https://atlas-sync.freelance-sites.workers.dev';
// ID de cliente OAuth de Google (público). Vacío = el botón de Google no aparece.
export const GOOGLE_CLIENT_ID = '882446948533-b980vni0p4fdhs25gdb5ruqq0i0jtgni.apps.googleusercontent.com';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function syncUrl() {
  // para pruebas locales: ?sync=http://127.0.0.1:8787
  const q = new URLSearchParams(location.search).get('sync');
  if (q) { try { localStorage.setItem('atlas-sync-url', q); } catch { /* nada */ } return q; }
  try { return localStorage.getItem('atlas-sync-url') || DEFAULT_URL; } catch { return DEFAULT_URL; }
}
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export const normCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4}).*/, '$1-$2-$3');

function mergeInto(local, remote) {
  let changed = false;
  for (const [k, r] of Object.entries(remote || {})) {
    const l = local[k];
    if (!l || (r.t || 0) > (l.t || 0)) { local[k] = r; changed = true; }
  }
  return changed;
}

// carga el script oficial de "Continuar con Google" (una sola vez)
let gisPromise = null;
export function loadGoogle() {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('Google no configurado'));
  gisPromise ??= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.async = true;
    sc.onload = () => resolve(window.google);
    sc.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google')); };
    document.head.append(sc);
  });
  return gisPromise;
}
// dibuja el botón oficial dentro de `el`; onCredential recibe el ID token
export async function renderGoogleButton(el, onCredential) {
  const google = await loadGoogle();
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
  google.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', locale: 'es', width: Math.min(el.clientWidth || 300, 400) });
}

export function createSync(profiles, { onStatus } = {}) {
  const base = syncUrl().replace(/\/+$/, '');
  const configured = !base.includes('REEMPLAZAR');
  let timer = null, busy = false, again = false;
  const status = (s) => onStatus?.(s);
  const account = () => profiles.current?.account || null;
  const legacy = () => (!account() && profiles.current?.sync) || null;
  const active = () => !!(account() || legacy());

  async function call(method, path, body, token, keepalive = false) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${base}${path}`, { method, keepalive, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 404 && path.includes('progress')) return null;
    if (r.status === 404 && path.startsWith('/v1/p/')) return null;
    if (!r.ok) { const e = new Error(data.error || `el servidor respondió ${r.status}`); e.status = r.status; throw e; }
    return data;
  }
  // GET/PUT del progreso según la forma activa
  function progressCall(method, body, keepalive) {
    const acc = account();
    if (acc) return call(method, '/v1/me/progress', body, acc.token, keepalive);
    return call(method, `/v1/p/${legacy()}`, body, null, keepalive);
  }
  function handleError(e) {
    if (e.status === 401 && account()) {
      profiles.setAccount({ ...account(), expired: true });
      status({ state: 'expired', message: 'Tu sesión venció: vuelve a iniciar sesión' });
    } else {
      status({ state: 'error', message: navigator.onLine === false ? 'sin conexión, se guardará después' : e.message });
    }
  }

  async function push(keepalive = false) {
    if (!configured || !active() || account()?.expired) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      status({ state: 'saving' });
      const local = profiles.loadProgress();
      const merged = await progressCall('PUT', { name: profiles.current.name, progress: local }, keepalive);
      if (merged && mergeInto(local, merged.progress)) profiles.saveProgress(local);
      profiles.setSyncTime(Date.now());
      status({ state: 'ok', at: Date.now() });
    } catch (e) { handleError(e); } finally {
      busy = false;
      if (again) { again = false; schedule(2000); }
    }
  }
  async function pull() {
    if (!configured || !active() || account()?.expired) return false;
    try {
      const remote = await progressCall('GET');
      if (!remote) return false;
      const local = profiles.loadProgress();
      const changed = mergeInto(local, remote.progress);
      if (changed) profiles.saveProgress(local);
      status({ state: 'ok', at: Date.now() });
      return changed;
    } catch (e) { handleError(e); return false; }
  }
  function schedule(ms = 20000) {
    if (!configured || !active()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; push(); }, ms); // agrupa respuestas para no gastar escrituras
    status({ state: 'pending' });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; push(true); }
  });
  window.addEventListener('online', () => { if (active()) push(); });

  // ligar la cuenta a un perfil local: el de ese correo si existe; si no, el actual (si está libre) o uno nuevo
  function bind(res) {
    const acc = { email: res.email, token: res.token };
    const existing = profiles.list.find((p) => p.account?.email === res.email);
    if (existing) profiles.use(existing.id);
    else {
      const cur = profiles.current;
      const free = cur && !cur.account && (cur.name.toLowerCase() === res.name.toLowerCase() || !Object.keys(profiles.loadProgress()).length || cur.named === false);
      if (!free) profiles.add(res.name);
      else profiles.rename(res.name);
    }
    profiles.setAccount(acc);
    if (profiles.current.sync) profiles.setSync(null); // la cuenta reemplaza al código
  }

  return {
    configured,
    get account() { return account(); },
    get code() { return legacy(); },
    get active() { return active(); },
    pull, push, schedule,
    async register(email, password, name) {
      const res = await call('POST', '/v1/auth/register', { email, password, name });
      bind(res);
      await push();
      return res; // incluye res.recovery: mostrarlo una vez
    },
    async login(email, password) {
      const res = await call('POST', '/v1/auth/login', { email, password });
      bind(res);
      await pull();
      await push();
      return res;
    },
    google: !!GOOGLE_CLIENT_ID,
    async loginGoogle(credential) {
      const res = await call('POST', '/v1/auth/google', { credential });
      bind(res);
      await pull();
      await push();
      return res;
    },
    async reset(email, recovery, password) {
      const res = await call('POST', '/v1/auth/reset', { email, recovery, password });
      bind(res);
      await pull();
      await push();
      return res;
    },
    async logout() {
      const acc = account();
      if (timer) { clearTimeout(timer); timer = null; await push(); }
      if (acc) { try { await call('POST', '/v1/auth/logout', {}, acc.token); } catch { /* ya vencida */ } }
      profiles.setAccount(null);
      status({ state: 'off' });
    },
    // código de sincronización (versión anterior)
    async join(input) {
      const c = normCode(input);
      if (!CODE_RE.test(c)) throw new Error('El código tiene el formato XXXX-XXXX-XXXX');
      const remote = await call('GET', `/v1/p/${c}`);
      if (!remote) throw new Error('No hay progreso guardado con ese código');
      const res = await profiles.restore({ app: 'atlas-anatomia', name: remote.name, progress: remote.progress });
      profiles.setSync(c);
      await push();
      return res;
    },
    disableCode() { profiles.setSync(null); status({ state: 'off' }); },
  };
}
