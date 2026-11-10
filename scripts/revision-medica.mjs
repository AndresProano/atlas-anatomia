// Junta todos los textos médicos del módulo Fisiología en una página imprimible, para que un médico o
// estudiante de medicina los revise antes de promocionar el atlas.
// Uso: node scripts/revision-medica.mjs <salida.html>
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { PROCESSES } = await import(pathToFileURL(join(root, 'web/js/physio-data.js')));
const out = process.argv[2] || join(root, 'revision-medica.html');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let n = 0;
const item = (label, text) => `<li><span class="n">${++n}</span><div><small>${esc(label)}</small><p>${esc(text)}</p>
  <div class="check"><label><input type="checkbox"> Correcto</label><label><input type="checkbox"> Corregir:</label><span class="line"></span></div></div></li>`;

const sections = PROCESSES.map((p) => {
  const rows = [];
  if (p.intro) rows.push(item('Introducción', p.intro));
  for (const s of p.steps) {
    rows.push(item(`Paso · ${s.t}`, s.text));
    if (s.dato) rows.push(item(`Dato · ${s.t}`, s.dato));
    for (const [l] of s.tour || []) rows.push(item(`Mapa del cerebro · ${s.t}`, l));
  }
  for (const d of p.diseases || []) {
    rows.push(item(`Enfermedad · ${d.label} · Qué pasa`, d.que));
    rows.push(item(`Enfermedad · ${d.label} · Qué siente`, d.siente));
    rows.push(item(`Enfermedad · ${d.label} · Fíjate`, d.fijate));
  }
  for (const c of p.cases || []) {
    rows.push(item(`Caso · ${c.who} · Historia`, `${c.story} — ${c.q}`));
    rows.push(item(`Caso · ${c.who} · Opciones`, c.options.map(([l], i) => (i === c.answer ? `✔ ${l}` : l)).join(' · ')));
    rows.push(item(`Caso · ${c.who} · Explicación`, c.why));
  }
  return `<section><h2>${esc(p.title)}</h2><ol>${rows.join('')}</ol></section>`;
}).join('');

writeFileSync(out, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión médica del Atlas</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #1f2937; background: #fff; max-width: 820px; margin: 0 auto; padding: 32px 20px; }
  h1 { margin: 0 0 4px; } .intro { color: #4b5563; margin: 0 0 24px; }
  h2 { margin: 32px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #0d9488; color: #0f766e; page-break-after: avoid; }
  ol { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid; }
  .n { flex: 0 0 34px; height: 34px; border-radius: 50%; background: #f0fdfa; color: #0f766e; font-weight: 700; display: grid; place-items: center; font-size: 13px; }
  small { color: #6b7280; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .03em; }
  p { margin: 2px 0 6px; }
  .check { display: flex; gap: 16px; align-items: center; font-size: 13px; color: #374151; }
  .line { flex: 1; border-bottom: 1px dotted #9ca3af; height: 14px; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>Revisión médica — Atlas Anatómico 3D</h1>
<p class="intro">Textos del módulo «Fisiología en movimiento» (procesos, enfermedades y casos clínicos), ${n} en total.
Marca «Correcto» o escribe la corrección. El público son estudiantes de medicina de primeros años: se busca que sea correcto y simple, no exhaustivo.
Sitio: https://andresproano.github.io/atlas-anatomia/</p>
${sections}
</body></html>`);
console.log(`${n} textos → ${out}`);
