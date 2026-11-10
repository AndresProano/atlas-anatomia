// Muestra las opiniones que llegaron por el botón «Danos tu opinión» (de la más nueva a la más vieja).
// Uso: node scripts/opiniones.mjs [cantidad]        (necesita haber iniciado sesión: npx wrangler login)
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const n = Number(process.argv[2]) || 20;
const run = (cmd) => execSync(`npx --no-install wrangler ${cmd}`, { cwd: worker, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const keys = JSON.parse(run('kv key list --binding ATLAS --remote --prefix f:')).map((k) => k.name).sort().reverse().slice(0, n);
if (!keys.length) { console.log('Todavía no hay opiniones.'); process.exit(0); }
const KIND = { error: 'Algo falla', contenido: 'Dato médico incorrecto', idea: 'Idea', otro: 'Otro' };
for (const k of keys) {
  const f = JSON.parse(run(`kv key get --binding ATLAS --remote "${k}"`));
  const when = new Date(f.t).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
  console.log(`\n— ${when} · ${KIND[f.kind] || f.kind}${f.where ? ` · ${f.where}` : ''}${f.contact ? ` · contacto: ${f.contact}` : ''}`);
  console.log(`  ${f.text.replace(/\n/g, '\n  ')}`);
}
console.log(`\n${keys.length} opiniones.`);
