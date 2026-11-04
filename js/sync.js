// Sincronización en la nube (Cloudflare Worker "atlas-sync", ver worker/).
// Cada perfil puede tener un código (p. ej. VALE-7K2P-QX9M) que funciona como contraseña:
// con ese código se recupera el progreso en cualquier dispositivo.
const DEFAULT_URL = 'https://atlas-sync.freelance-sites.workers.dev';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para no confundir
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
export const normCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  .replace(/(.{4})(.{4})(.{4}).*/, '$1-$2-$3');

function mergeInto(local, remote) {
  let changed = false;
  for (const [k, r] of Object.entries(remote || {})) {
    const l = local[k];
    if (!l || (r.t || 0) > (l.t || 0)) { local[k] = r; changed = true; }
  }
  return changed;
}

export function createSync(profiles, { onStatus } = {}) {
  const base = syncUrl().replace(/\/+$/, '');
  const configured = !base.includes('REEMPLAZAR');
  let timer = null, busy = false, again = false;
  const status = (s) => onStatus?.(s);
  const code = () => profiles.current?.sync || null;

  async function request(method, c, body, keepalive = false) {
    const r = await fetch(`${base}/v1/p/${c}`, {
      method, keepalive,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
    return r.json();
  }

  // subir lo local y quedarse con la versión combinada del servidor
  async function push(keepalive = false) {
    const c = code();
    if (!c || !configured) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      status({ state: 'saving' });
      const local = profiles.loadProgress();
      const merged = await request('PUT', c, { name: profiles.current.name, progress: local }, keepalive);
      if (merged && mergeInto(local, merged.progress)) profiles.saveProgress(local);
      profiles.setSyncTime(Date.now());
      status({ state: 'ok', at: Date.now() });
    } catch (e) {
      status({ state: 'error', message: navigator.onLine === false ? 'sin conexión, se guardará después' : e.message });
    } finally {
      busy = false;
      if (again) { again = false; schedule(2000); }
    }
  }
  // traer lo del servidor (otro dispositivo pudo avanzar)
  async function pull() {
    const c = code();
    if (!c || !configured) return false;
    try {
      const remote = await request('GET', c);
      if (!remote) return false;
      const local = profiles.loadProgress();
      const changed = mergeInto(local, remote.progress);
      if (changed) profiles.saveProgress(local);
      status({ state: 'ok', at: Date.now() });
      return changed;
    } catch (e) {
      status({ state: 'error', message: e.message });
      return false;
    }
  }
  function schedule(ms = 20000) {
    if (!code() || !configured) return;
    clearTimeout(timer);
    timer = setTimeout(() => push(), ms); // agrupa respuestas para no gastar escrituras
    status({ state: 'pending' });
  }
  // al cerrar o cambiar de app, subir lo pendiente
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; push(true); }
  });
  window.addEventListener('online', () => { if (code()) push(); });

  return {
    configured,
    get code() { return code(); },
    pull, push, schedule,
    // activar en el perfil actual: crea un código y sube todo
    async enable() {
      const c = newCode();
      profiles.setSync(c);
      await push();
      return c;
    },
    // entrar con un código existente (otro dispositivo)
    async join(input) {
      const c = normCode(input);
      if (!CODE_RE.test(c)) throw new Error('El código tiene el formato XXXX-XXXX-XXXX');
      const remote = await request('GET', c);
      if (!remote) throw new Error('No hay progreso guardado con ese código');
      const res = await profiles.restore({ app: 'atlas-anatomia', name: remote.name, progress: remote.progress });
      profiles.setSync(c);
      await push();
      return res;
    },
    disable() { profiles.setSync(null); status({ state: 'off' }); },
  };
}
