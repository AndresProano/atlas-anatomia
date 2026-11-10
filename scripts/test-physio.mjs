// Comprueba que todo nombre usado por el módulo Fisiología exista en los catálogos (hombre y mujer).
// Uso: node scripts/test-physio.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ROUTES, PROCESSES, SPINE, NERVE_TUBES } = await import(pathToFileURL(join(root, 'web/js/physio-data.js')));
// nombres que usa physio.js directamente (infarto, ACV, cálculo)
const CODE = ['Trunk of anterior interventricular branch of left coronary artery', 'Diagonal branch of anterior descending branch of left coronary artery',
  'Septal branch of anterior interventricular artery', 'Trunk of left coronary artery', 'Wall of ventricle', 'Right internal capsule', 'Left ureter', 'Left kidney'];
// faltas esperadas: la mujer no tiene uretra en el catálogo
const OPTIONAL = new Set(['Urethra']);

let bad = 0;
for (const f of ['parts.json', 'female.json']) {
  const names = new Set(JSON.parse(readFileSync(join(root, 'web/data', f), 'utf8')).parts.map((p) => p.en));
  const miss = new Set();
  const chk = (n, w) => { if (!names.has(n) && !OPTIONAL.has(n)) miss.add(`${n}  (${w})`); };
  const item = (it, w) => { if (typeof it === 'string') chk(it, w); else if (it.cord) it.cord.forEach((n) => chk(n, w)); else chk(it.n || it.pt, w); };
  for (const [k, r] of Object.entries(ROUTES)) r.forEach((it) => item(it, k));
  NERVE_TUBES.forEach((r) => r.forEach((it) => item(it, 'nervio')));
  SPINE.forEach((n) => chk(n, 'columna'));
  CODE.forEach((n) => chk(n, 'physio.js'));
  for (const p of PROCESSES) {
    for (const s of p.streams) if (!ROUTES[s.route]) miss.add('ruta inexistente ' + s.route);
    for (const L of Object.values(p.layers)) (L.names || []).forEach((n) => chk(n, p.id + ' capa'));
    for (const st of p.steps) {
      if (Array.isArray(st.focus)) st.focus.forEach((n) => chk(n, p.id + ' foco'));
      (st.tour || []).forEach(([, ns]) => ns.forEach((n) => chk(n, p.id + ' mapa')));
      (st.streams || []).forEach((s) => { if (!p.streams.some((x) => x.id === s)) miss.add(`flujo ${s} en ${p.id}`); });
    }
    for (const d of p.diseases || []) if (d.step !== undefined && !p.steps[d.step]) miss.add(`paso ${d.step} de ${d.id}`);
    for (const c of p.cases || []) {
      c.options.forEach(([, ns]) => ns.forEach((n) => chk(n, 'caso ' + c.who)));
      if (Array.isArray(c.focus)) c.focus.forEach((n) => chk(n, 'foco caso ' + c.who));
      if (c.answer < 0 || c.answer >= c.options.length) miss.add('respuesta fuera de rango: ' + c.who);
      const sp = c.see && PROCESSES.find((q) => q.id === c.see.proc);
      if (c.see && !sp) miss.add('proceso inexistente ' + c.see.proc);
      if (c.see?.dz && !sp?.diseases?.some((d) => d.id === c.see.dz)) miss.add('enfermedad inexistente ' + c.see.dz);
    }
  }
  console.log(`${f}: ${miss.size ? 'FALTAN\n  ' + [...miss].join('\n  ') : 'OK'}`);
  bad += miss.size;
}
process.exit(bad ? 1 : 0);
