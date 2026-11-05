// Utilidades compartidas: leer los GLB publicados (meshopt + cuantizados) como vértices en espacio mundo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
export const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function mulMat4(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

// Devuelve [{ name, pos: Float32Array (mundo), index: Uint32Array }] de un GLB.
export async function readParts(file) {
  const doc = await io.read(path.join(ROOT, 'web', file));
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION');
      const n = a.getCount(), pos = new Float32Array(n * 3), el = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        a.getElement(i, el);
        const w = mulMat4(M, el[0], el[1], el[2]);
        pos[i * 3] = w[0]; pos[i * 3 + 1] = w[1]; pos[i * 3 + 2] = w[2];
      }
      const idx = prim.getIndices();
      const index = idx ? Uint32Array.from(idx.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      out.push({ name: node.getName() || mesh.getName(), pos, index });
    }
  }
  return out;
}

export function bbox(pos) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  return { mn, mx };
}
export function centroid(pos) {
  const c = [0, 0, 0]; const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) { c[0] += pos[i]; c[1] += pos[i + 1]; c[2] += pos[i + 2]; }
  return c.map((v) => v / n);
}
export const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'web', f), 'utf8'));
