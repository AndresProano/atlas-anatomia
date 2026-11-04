// Cuerpo femenino: HuBMAP "united-female" (Visible Human Female, CC BY 4.0) -> GLB comprimidos por sistema.
// Uso: node scripts/build-female.mjs [ratio=0.2] [error=0.01]
// Entrada: data-raw/hubmap/united-female/3d-vh-f-united.glb + web/data/terms.json
// Salida:  web/models/f-<sistema>.glb, web/data/female.json (catálogo) y web/data/female-models.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data-raw/hubmap/united-female/3d-vh-f-united.glb');
const RATIO = Number(process.argv[2] ?? 0.2);
const ERROR = Number(process.argv[3] ?? 0.01);
const terms = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/terms.json'), 'utf8'));

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(SRC);
const top = src.getRoot().listScenes()[0].listChildren()[0]; // VH_F

// --- nombres (mismo criterio que web/js/organs.js) -------------------------------
function parseName(raw) {
  let s = (raw || '').replace(/^(VH|Allen|SBU|NIH|Yao)_?[FM]?_/i, '').replace(/^[FM]_/, '');
  s = s.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  let side = null;
  s = s.replace(/\b(L|R)\b(\s+[a-z]{1,2})?$/i, (_, lr) => { side = lr.toLowerCase(); return ''; }).trim();
  s = s.replace(/\s+[a-z]$/i, '').replace(/\s+\d+$/, '').trim();
  const m = s.match(/^(left|right)\s+(.*)$/i);
  if (m) { side = side || m[1].toLowerCase()[0]; s = m[2]; }
  const e = s.match(/^(.*)\s+(left|right)$/i); // "dura mater right"
  if (e) { side = side || e[2].toLowerCase()[0]; s = e[1]; }
  return { key: s.toLowerCase(), side };
}
function names(raw) {
  const { key, side } = parseName(raw);
  const num = (raw.replace(/^.*?_(\d+)(_[LR])?(\s\d+)?$/, '$1').match(/^\d+$/) || [null])[0];
  const t = terms[key] || terms[`${key} muscle`];
  const sfx = side ? ` (${side === 'l' ? 'izq.' : 'der.'})` : '';
  const en = key.charAt(0).toUpperCase() + key.slice(1);
  const n = num ? ` ${num}` : '';
  return { en: en + n + (side ? (side === 'l' ? ' (left)' : ' (right)') : ''), es: t ? t[0] + n + sfx : null, la: t?.[1] || null };
}

// --- sistema por la rama de la jerarquía -------------------------------------------
const SKIP = /placenta|adipose|umbilical cord/i;
function systemOf(chain, name) {
  const top = chain[0] || '';
  const all = chain.join(' ') + ' ' + name;
  if (SKIP.test(all)) return null;
  if (/integumentary/.test(top)) return /mammary/.test(all) ? 'reproductor' : 'piel';
  if (/nervous/.test(top)) return /eye/.test(all) ? 'ojo_oido' : 'nervioso';
  if (/muscular/.test(top)) return 'muscular';
  if (/reproductive/.test(top)) return 'reproductor';
  if (/digestive/.test(top)) return 'digestivo';
  if (/urinary/.test(top)) return 'urogenital';
  if (/circulatory/.test(top)) return 'cardiovascular';
  if (/respiratory/.test(top)) return 'respiratorio';
  if (/lymphatic/.test(top)) return 'otros';
  if (/skeletal/.test(top)) return /intervertebral|disk|disc|nucleus|annulus/.test(all) ? 'articular' : 'esqueletico';
  if (/lower_limb/.test(top)) return /ligament|menisc|cartilage|capsule|bursa|tendon/.test(all) ? 'articular' : 'esqueletico';
  return 'otros';
}

// --- recorrer y extraer mallas en coordenadas del cuerpo ------------------------------
const items = []; // { id, system, raw, pos: Float32Array, idx: Uint32Array }
let skin = null;
const mul = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
function visit(node, chain) {
  const name = node.getName();
  const mesh = node.getMesh();
  if (mesh) {
    const sys = systemOf(chain, name);
    if (sys) {
      const w = node.getWorldMatrix();
      mesh.listPrimitives().forEach((prim, k) => {
        const pa = prim.getAttribute('POSITION');
        if (!pa) return;
        const n = pa.getCount();
        const pos = new Float32Array(n * 3), v = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          pa.getElement(i, v);
          const p = mul(w, v[0], v[1], v[2]);
          pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
        }
        const ia = prim.getIndices();
        const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
        if (prim.getMode() !== 4) return; // solo triángulos
        items.push({ id: `F${String(items.length).padStart(4, '0')}`, system: sys, raw: name + (k ? ` ${k}` : ''), pos, idx });
      });
    }
  }
  node.listChildren().forEach((c) => visit(c, [...chain, name]));
}
top.listChildren().forEach((sysNode) => visit(sysNode, []));
// la raíz de cada sistema no es parte de la cadena: corregir usando el nombre del sistema
// (visit recibe chain=[] en el nodo del sistema, así que chain[0] es el nombre del sistema para sus hijos)

// centrar: x y z al medio del cuerpo, pies en y = 0 (igual que el cuerpo masculino)
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const it of items) {
  for (let i = 0; i < it.pos.length; i += 3) {
    for (let a = 0; a < 3; a++) { const val = it.pos[i + a]; if (val < min[a]) min[a] = val; if (val > max[a]) max[a] = val; }
  }
}
const off = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
for (const it of items) for (let i = 0; i < it.pos.length; i += 3) { it.pos[i] -= off[0]; it.pos[i + 1] -= off[1]; it.pos[i + 2] -= off[2]; }
console.log('piezas', items.length, 'altura', (max[1] - min[1]).toFixed(3), 'm');

// --- normales suaves -------------------------------------------------------------------
function addSmoothNormals(doc, prim, buffer) {
  const pos = prim.getAttribute('POSITION').getArray();
  const idx = prim.getIndices().getArray();
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(n).setBuffer(buffer));
}

// --- un GLB por sistema ---------------------------------------------------------------
const parts = [], summary = {};
const bySys = {};
for (const it of items) (bySys[it.system] ??= []).push(it);
for (const [system, list] of Object.entries(bySys)) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(system);
  const material = doc.createMaterial(system);
  let trisIn = 0;
  for (const it of list) {
    trisIn += it.idx.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(it.pos).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(it.idx).setBuffer(buffer))
      .setMaterial(material);
    scene.addChild(doc.createNode(it.id).setMesh(doc.createMesh(it.id).addPrimitive(prim)));
    // catálogo
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < it.pos.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], it.pos[i + a]); b[a + 3] = Math.max(b[a + 3], it.pos[i + a]); }
    const vol = ((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2])) * 1e6 * 0.5; // cm³ aproximado (caja / 2)
    parts.push({ id: it.id, ...names(it.raw), system, vol: Math.round(vol * 100) / 100 });
  }
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }), prune({ keepLeaves: true }));
  let trisOut = 0;
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) { trisOut += pr.getIndices().getCount() / 3; addSmoothNormals(doc, pr, buffer); }
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = `models/f-${system}.glb`;
  await io.write(path.join(ROOT, 'web', file), doc);
  const bytes = fs.statSync(path.join(ROOT, 'web', file)).size;
  summary[system] = { file, parts: list.length, trisOriginal: trisIn, tris: trisOut, bytes };
  console.log(`${system.padEnd(14)} ${String(list.length).padStart(4)} piezas  ${(trisIn / 1e6).toFixed(2)}M -> ${(trisOut / 1e6).toFixed(2)}M tris  ${(bytes / 1e6).toFixed(1)} MB`);
}
const sysLabels = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/parts.json'), 'utf8')).systems;
sysLabels.reproductor = 'Aparato reproductor';
fs.writeFileSync(path.join(ROOT, 'web/data/female.json'), JSON.stringify({ female: true, systems: sysLabels, parts }));
fs.writeFileSync(path.join(ROOT, 'web/data/female-models.json'), JSON.stringify(summary, null, 1));
const sinEs = parts.filter((p) => !p.es).map((p) => p.en);
console.log('sin español:', sinEs.length, [...new Set(sinEs)].slice(0, 30));
