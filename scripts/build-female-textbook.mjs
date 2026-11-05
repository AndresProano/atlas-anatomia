// Construye la mujer «de atlas» (salida de scripts/textbook_female.py) como web/models/f-<sistema>.glb
// y su catálogo web/data/female.json + female-models.json.
// Uso: node scripts/build-female-textbook.mjs data-raw/textbook
import fs from 'node:fs';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { ROOT, io, readParts } from './lib-glb.mjs';

const DIR = process.argv[2];
await MeshoptSimplifier.ready;
const web = (f) => path.join(ROOT, 'web', f);
const maleCat = JSON.parse(fs.readFileSync(web('data/parts.json'), 'utf8'));
const mById = new Map(maleCat.parts.map((p) => [p.id, p]));
const extras = JSON.parse(fs.readFileSync(path.join(DIR, 'extras.json'), 'utf8'));
const REMOVE = new RegExp(extras.remove, 'i');
const XV = new Float32Array(fs.readFileSync(path.join(DIR, 'extras.bin')).buffer.slice(0));
const XT = new Uint32Array(fs.readFileSync(path.join(DIR, 'extras.tri.bin')).buffer.slice(0));
const SYSTEMS = ['piel', 'esqueletico', 'muscular', 'articular', 'cardiovascular', 'nervioso', 'respiratorio',
  'digestivo', 'urogenital', 'endocrino', 'ojo_oido', 'otros', 'reproductor'];

function smoothNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
function simplifyPart(pos, idx, ratio = 0.05, minTris = 300) {
  const target = Math.max(minTris * 3, Math.floor((idx.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(target, idx.length), 0.002, ['LockBorder']);
  const remap = new Int32Array(pos.length / 3).fill(-1); let n = 0;
  for (const i of out) if (remap[i] < 0) remap[i] = n++;
  const p2 = new Float32Array(n * 3);
  for (let i = 0; i < remap.length; i++) if (remap[i] >= 0) p2.set(pos.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  return { pos: p2, index: Uint32Array.from(out, (i) => remap[i]) };
}
const boxVol = (pos) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], pos[i + a]); b[a + 3] = Math.max(b[a + 3], pos[i + a]); }
  return (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
};

const parts = [], summary = {};
let triOff = 0;
const extraBySys = {};
for (const e of extras.extras) {
  const pos = XV.slice(e.off * 3, (e.off + e.n) * 3);
  const tri = XT.slice(triOff * 3, (triOff + e.ntri) * 3); triOff += e.ntri;
  const g = e.simplify ? simplifyPart(pos, tri) : { pos, index: tri };
  (extraBySys[e.system] ??= []).push({ name: e.id, ...g });
  parts.push({ id: e.id, en: e.en, es: e.es, la: e.la, system: e.system, from: e.src });
}

for (const system of SYSTEMS) {
  const items = [];
  if (fs.existsSync(path.join(DIR, `${system}.warped.bin`))) {
    const male = await readParts(`models/${system}.glb`);
    const W = new Float32Array(fs.readFileSync(path.join(DIR, `${system}.warped.bin`)).buffer.slice(0));
    let off = 0; const seen = new Set();
    for (const p of male) {
      const n = p.pos.length, pos = W.slice(off, off + n); off += n;
      const id = p.name.replace(/_\d+$/, ''), cat = mById.get(id);
      if (!cat || REMOVE.test(cat.en)) continue;
      items.push({ name: p.name, pos, index: p.index });
      if (!seen.has(id)) {
        seen.add(id);
        const scale = boxVol(pos) / Math.max(boxVol(p.pos), 1e-12);
        parts.push({ id, en: cat.en, es: cat.es ?? null, la: cat.la ?? null, system, vol: cat.vol != null ? Math.round(cat.vol * scale * 100) / 100 : null });
      }
    }
    if (off !== W.length) throw new Error(`${system}: el volcado no coincide (${off} vs ${W.length})`);
  }
  items.push(...(extraBySys[system] ?? []));
  if (!items.length) continue;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(system);
  const material = doc.createMaterial(system);
  let tris = 0;
  for (const it of items) {
    tris += it.index.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(it.pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(smoothNormals(it.pos, it.index)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(it.index).setBuffer(buffer))
      .setMaterial(material);
    scene.addChild(doc.createNode(it.name).setMesh(doc.createMesh(it.name).addPrimitive(prim)));
  }
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = `models/f-${system}.glb`;
  await io.write(web(file), doc);
  const bytes = fs.statSync(web(file)).size;
  summary[system] = { file, parts: new Set(items.map((i) => i.name.replace(/_\d+$/, ''))).size, tris, bytes };
  console.log(`${system.padEnd(14)} ${String(summary[system].parts).padStart(4)} piezas  ${(bytes / 1e6).toFixed(2)} MB`);
}
const systems = { ...maleCat.systems, reproductor: 'Aparato reproductor' };
fs.writeFileSync(web('data/female.json'), JSON.stringify({ female: true, systems, parts }));
fs.writeFileSync(web('data/female-models.json'), JSON.stringify(summary, null, 1));
console.log('catálogo femenino:', parts.length, 'piezas; total', (Object.values(summary).reduce((a, s) => a + s.bytes, 0) / 1e6).toFixed(1), 'MB');
