// Vuelca vértices (submuestreados) por pieza a un .bin + índice JSON para análisis/depuración en Python.
// Uso: node scripts/female-dump.mjs <salida-dir> <glb> [<glb>...]
import fs from 'node:fs';
import path from 'node:path';
import { readParts } from './lib-glb.mjs';
const [outDir, ...files] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const parts = await readParts(f);
  const idx = []; const chunks = []; const tris = []; let off = 0;
  for (const p of parts) {
    chunks.push(Buffer.from(p.pos.buffer, p.pos.byteOffset, p.pos.byteLength));
    const t = Uint32Array.from(p.index, (i) => i + off); tris.push(Buffer.from(t.buffer));
    idx.push({ name: p.name.replace(/_\d+$/, ''), off, n: p.pos.length / 3 });
    off += p.pos.length / 3;
  }
  const base = path.join(outDir, path.basename(f, '.glb'));
  fs.writeFileSync(base + '.bin', Buffer.concat(chunks));
  fs.writeFileSync(base + '.json', JSON.stringify(idx));
  fs.writeFileSync(base + '.tri.bin', Buffer.concat(tris));
  console.log(base, parts.length, off);
}
