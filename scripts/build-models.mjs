// Convierte los OBJ de BodyParts3D en un GLB comprimido por sistema corporal.
// Uso: node scripts/build-models.mjs [ratio-simplificación=0.5]
// Entrada: web/data/parts.json (de classify.py) + data-raw/bp3d/obj_isa/...
// Salida:  web/models/<sistema>.glb  y  web/data/models.json (tamaños)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBJ_DIR = path.join(ROOT, 'data-raw/bp3d/obj_isa/isa_BP3D_4.0_obj_99');
const RATIO = Number(process.argv[2] ?? 0.5);

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/parts.json'), 'utf8'));

// Centro del cuerpo: X y Y (frontal) al medio, pies en 0. BodyParts3D está en mm con Z arriba.
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of catalog.parts) {
  if (!p.bounds) continue;
  for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.bounds[i]); max[i] = Math.max(max[i], p.bounds[i + 3]); }
}
const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, z0 = min[2];

// OBJ (solo v y f) -> metros, Y arriba, frente hacia +Z (rotación pura, sin espejo)
function readObj(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const pos = [], idx = [];
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      pos.push((x - cx) / 1000, (z - z0) / 1000, -(y - cy) / 1000);
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let i = 1; i + 1 < f.length; i++) idx.push(f[0], f[i], f[i + 1]);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const bySystem = {};
for (const p of catalog.parts) (bySystem[p.system] ??= []).push(p);

fs.mkdirSync(path.join(ROOT, 'web/models'), { recursive: true });
const summary = {};
for (const [system, parts] of Object.entries(bySystem)) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(system);
  const material = doc.createMaterial(system);
  let tris = 0;
  for (const p of parts) {
    const file = path.join(OBJ_DIR, `${p.id}.obj`);
    if (!fs.existsSync(file)) continue;
    const { pos, idx } = readObj(file);
    if (!idx.length) continue;
    tris += idx.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer))
      .setMaterial(material);
    scene.addChild(doc.createNode(p.id).setMesh(doc.createMesh(p.id).addPrimitive(prim)));
  }
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.0004, lockBorder: true }),
    prune({ keepLeaves: true }),
    quantize({ quantizePosition: 14 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = path.join(ROOT, 'web/models', `${system}.glb`);
  await io.write(out, doc);
  const bytes = fs.statSync(out).size;
  summary[system] = { file: `models/${system}.glb`, parts: parts.length, trisOriginal: tris, bytes };
  console.log(`${system.padEnd(15)} ${String(parts.length).padStart(5)} piezas  ${(tris / 1e6).toFixed(2)}M tris -> ${(bytes / 1e6).toFixed(1)} MB`);
}
fs.writeFileSync(path.join(ROOT, 'web/data/models.json'), JSON.stringify(summary, null, 1));
