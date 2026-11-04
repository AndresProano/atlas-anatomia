// Perfiles de estudio: cada persona tiene su propio progreso en este navegador,
// más copias de seguridad (archivo o código para pegar) para no perderlo.
const PKEY = 'atlas-profiles-v1';
const OLD_PROGRESS = 'atlas-progress-v1'; // progreso de antes de los perfiles
const COLORS = ['#0d9488', '#db2777', '#7c3aed', '#ea580c', '#2563eb', '#16a34a', '#ca8a04'];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const progressKey = (id) => `atlas-progress-v1:${id}`;

function load() {
  let data = null;
  try { data = JSON.parse(ls.get(PKEY)); } catch { /* vacío */ }
  if (!data || !Array.isArray(data.list)) data = { list: [], current: null };
  // migrar el progreso viejo (sin perfiles) a un primer perfil
  const old = ls.get(OLD_PROGRESS);
  if (old && !data.list.length) {
    const id = uid();
    data.list.push({ id, name: 'Yo', color: COLORS[0], created: Date.now(), named: false });
    data.current = id;
    ls.set(progressKey(id), old);
    ls.del(OLD_PROGRESS);
    save(data);
  }
  return data;
}
function save(data) { ls.set(PKEY, JSON.stringify(data)); }

export function createProfiles() {
  let data = load();
  // pedir al navegador que no borre estos datos por falta de espacio
  try { navigator.storage?.persist?.(); } catch { /* no disponible */ }

  const api = {
    get list() { return data.list; },
    get current() { return data.list.find((p) => p.id === data.current) || null; },
    needsName() { const c = api.current; return !c || c.named === false; },
    add(name) {
      const id = uid();
      data.list.push({ id, name: name.trim() || 'Sin nombre', color: COLORS[data.list.length % COLORS.length], created: Date.now(), named: true });
      data.current = id;
      save(data);
      return api.current;
    },
    rename(name) {
      const c = api.current;
      if (!c) return api.add(name);
      c.name = name.trim() || c.name; c.named = true;
      save(data);
      return c;
    },
    use(id) { if (data.list.some((p) => p.id === id)) { data.current = id; save(data); } },
    remove(id) {
      data.list = data.list.filter((p) => p.id !== id);
      ls.del(progressKey(id));
      if (data.current === id) data.current = data.list[0]?.id || null;
      save(data);
    },
    loadProgress() {
      const c = api.current;
      if (!c) return {};
      try { return JSON.parse(ls.get(progressKey(c.id))) || {}; } catch { return {}; }
    },
    saveProgress(progress) {
      const c = api.current;
      if (!c) return;
      ls.set(progressKey(c.id), JSON.stringify(progress));
    },
    // --- copias de seguridad ---------------------------------------------------------
    backupPayload() {
      const c = api.current;
      return { app: 'atlas-anatomia', v: 1, name: c?.name || 'Sin nombre', date: new Date().toISOString(), progress: api.loadProgress() };
    },
    markBackup() { const c = api.current; if (c) { c.lastBackup = Date.now(); save(data); } },
    backupDue() {
      const c = api.current;
      const n = Object.keys(api.loadProgress()).length;
      return n >= 10 && (!c?.lastBackup || Date.now() - c.lastBackup > 7 * 864e5);
    },
    downloadBackup() {
      const p = api.backupPayload();
      const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `atlas-progreso-${p.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${p.date.slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      api.markBackup();
    },
    async backupCode() {
      const json = JSON.stringify(api.backupPayload());
      let bytes = new TextEncoder().encode(json);
      if (window.CompressionStream) {
        const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(cs).arrayBuffer());
        return 'ATLAS1Z:' + toB64(bytes);
      }
      return 'ATLAS1:' + toB64(bytes);
    },
    // restaura en un perfil (nuevo si el nombre no existe); combina con lo que ya haya
    async restore(input) {
      let obj = null;
      if (typeof input === 'string') {
        const t = input.trim();
        if (t.startsWith('ATLAS1Z:')) {
          const ds = new Blob([fromB64(t.slice(8))]).stream().pipeThrough(new DecompressionStream('gzip'));
          obj = JSON.parse(await new Response(ds).text());
        } else if (t.startsWith('ATLAS1:')) {
          obj = JSON.parse(new TextDecoder().decode(fromB64(t.slice(7))));
        } else obj = JSON.parse(t);
      } else obj = input;
      if (!obj || obj.app !== 'atlas-anatomia' || typeof obj.progress !== 'object') throw new Error('No es una copia válida del atlas');
      let prof = data.list.find((p) => p.name.toLowerCase() === String(obj.name).toLowerCase());
      if (!prof) prof = api.add(obj.name);
      data.current = prof.id; save(data);
      const mine = api.loadProgress();
      for (const [k, r] of Object.entries(obj.progress)) {
        const m = mine[k];
        if (!m || (r.t || 0) > (m.t || 0)) mine[k] = r; // gana lo más reciente
      }
      api.saveProgress(mine);
      return { name: prof.name, items: Object.keys(obj.progress).length };
    },
  };
  return api;
}

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
