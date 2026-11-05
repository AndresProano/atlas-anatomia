// Completa el cuerpo femenino con piezas de BodyParts3D (hombre) ya deformadas para encajar en ella.
// Requiere: scripts/female_fit.py -> <fit-dir>/<sistema>.warped.bin (mismo orden que readParts del GLB masculino)
// Opcional: <du-dir> = salida de scripts/du_import.py (cadera y piernas reales de la Visible Human Female,
//           Universidad de Denver, CC BY 4.0). Si se da, sustituye a las piezas equivalentes de HuBMAP y del hombre.
// Uso: node scripts/build-female-complete.mjs <fit-dir> [<du-dir>]
// Reescribe web/models/f-<sistema>.glb (conserva las piezas HuBMAP "F0000") y actualiza web/data/female*.json.
import fs from 'node:fs';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { ROOT, io, readParts } from './lib-glb.mjs';

const FIT = process.argv[2];
const DU = process.argv[3];
await MeshoptSimplifier.ready;
const web = (f) => path.join(ROOT, 'web', f);
const maleCat = JSON.parse(fs.readFileSync(web('data/parts.json'), 'utf8'));
const femCat = JSON.parse(fs.readFileSync(web('data/female.json'), 'utf8'));
const femModels = JSON.parse(fs.readFileSync(web('data/female-models.json'), 'utf8'));
const mById = new Map(maleCat.parts.map((p) => [p.id, p]));
const isHubmap = (id) => /^F\d{4}$/.test(id);
const femById = new Map(femCat.parts.map((p) => [p.id, p]));

// --- cadera y piernas reales (Denver) -----------------------------------------------------------
const KIND_SYS = { Bone: 'esqueletico', Muscle: 'muscular', Cartilage: 'articular', Ligament: 'articular' };
const duItems = { esqueletico: [], muscular: [], articular: [] };
// lo que Denver sustituye: en HuBMAP (huesos y rodilla) y en el hombre ajustado (cadera, muslo, pierna, pie)
const DU_REPLACES_HUBMAP = /^(femur|tibia|fibula|patella|ilium|sacrum|coccyx|rectus femoris)|cruciate|collateral ligament|articular cartilage of knee|condyle|enthesis|perichond|trochlear groove|intercondylar fossa|distal most point/i;
const DU_REPLACES_MALE = /\b(left|right) (calcaneus|talus|cuboid bone|(medial|intermediate|lateral) cuneiform bone)|navicular bone of|metatarsal|phalanx of .*(toe|hallux)|sesamoid bone of|adductor (brevis|longus|magnus|minimus)|biceps femoris|extensor digitorum longus|extensor hallucis longus|flexor digitorum longus|flexor hallucis longus|gastrocnemius|gluteus|gracilis|iliacus|gemellus|obturator|pectineus|fibularis longus|piriformis|plantaris|popliteus|psoas major|quadratus femoris|sartorius|semimembranosus|semitendinosus|soleus|tensor fasciae latae|tibialis (anterior|posterior)|vastus|iliotibial tract|interosseous membrane of (left|right) leg|calcaneal tendon/i;
function simplifyPart(pos, idx, ratio = 0.05, minTris = 300) {
  const target = Math.max(minTris * 3, Math.floor((idx.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(target, idx.length), 0.002, ['LockBorder']);
  const remap = new Int32Array(pos.length / 3).fill(-1); let n = 0;
  for (const i of out) if (remap[i] < 0) remap[i] = n++;
  const p2 = new Float32Array(n * 3);
  for (let i = 0; i < remap.length; i++) if (remap[i] >= 0) p2.set(pos.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  return { pos: p2, index: Uint32Array.from(out, (i) => remap[i]) };
}
if (DU) {
  const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/du_names.json'), 'utf8'));
  const maleByEn = new Map(maleCat.parts.map((p) => [p.en.toLowerCase(), p]));
  const idx = JSON.parse(fs.readFileSync(path.join(DU, 'du.json'), 'utf8'));
  const V = new Float32Array(fs.readFileSync(path.join(DU, 'du.bin')).buffer.slice(0));
  const T = new Uint32Array(fs.readFileSync(path.join(DU, 'du.tri.bin')).buffer.slice(0));
  let triOff = 0, tIn = 0, tOut = 0;
  for (const e of idx) {
    const pos = V.slice(e.off * 3, (e.off + e.n) * 3);
    const tri = T.slice(triOff * 3, (triOff + e.ntri) * 3).map((i) => i - e.off); triOff += e.ntri;
    const spec = names[e.kind]?.[e.name];
    if (!spec) { console.warn('sin nombre:', e.kind, e.name); continue; }
    const side = e.side.toLowerCase(), Side = e.side;
    if (spec.single && e.side === 'Right') continue; // sacro y cóccix vienen repetidos en ambas carpetas
    const fill = (s) => s?.replaceAll('{side}', side).replaceAll('{Side}', Side);
    const m = spec.match ? maleByEn.get(fill(spec.match).toLowerCase()) : null;
    const sfx = spec.single ? '' : ` (${side === 'left' ? 'izq.' : 'der.'})`;
    const id = `DU-${spec.single ? '' : side[0].toUpperCase() + '-'}${e.kind[0]}-${e.name}`;
    const simp = simplifyPart(pos, tri);
    tIn += tri.length / 3; tOut += simp.index.length / 3;
    const system = KIND_SYS[e.kind];
    duItems[system].push({ name: id, pos: simp.pos, index: simp.index });
    duItems[system].meta ??= [];
    duItems[system].meta.push({
      id, system, from: 'Visible Human Female (Univ. de Denver)',
      en: m ? m.en : fill(spec.en), es: m ? m.es : (spec.es ? spec.es + sfx : null), la: m ? m.la : spec.la ?? null,
      ...(m?.wiki ? { wiki: m.wiki } : {}),
    });
  }
  console.log(`Denver: ${(tIn / 1e6).toFixed(2)}M -> ${(tOut / 1e3).toFixed(0)}k triángulos`);
}

// lo que ella ya tiene (HuBMAP) no se duplica
const SKIP = {
  esqueletico: /vertebra|^Atlas$|^Axis$|^Sacrum$|^Body of sternum$|^Manubrium$|hip bone$|femur$|tibia$|fibula$|patella$/,
  muscular: /\b(superior|inferior|lateral|medial) rectus$|\b(superior|inferior) oblique$|levator palpebrae|rectus femoris/i,
  articular: /Intervertebral disk|Check ligament|lens$|Trochlea of|arytenoid|corniculate|cuneiform cartilage|Cricoid|Thyroid cartilage|thyrohyoid|cricothyroid|vocal ligament|epiglottic|conus elasticus/i,
};

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
const boxVol = (pos) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], pos[i + a]); b[a + 3] = Math.max(b[a + 3], pos[i + a]); }
  return (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
};

const newParts = femCat.parts.filter((p) => isHubmap(p.id) && !(DU && DU_REPLACES_HUBMAP.test(p.en)));
for (const system of Object.keys(SKIP)) {
  // 1) piezas de ella (sin las añadidas en corridas anteriores)
  const femFile = `models/f-${system}.glb`;
  const items = fs.existsSync(web(femFile)) ? (await readParts(femFile)).filter((p) => isHubmap(p.name)
    && !(DU && DU_REPLACES_HUBMAP.test(femById.get(p.name.replace(/_\d+$/, ''))?.en || ''))) : [];
  items.push(...duItems[system]);
  // 2) piezas de él, deformadas
  const male = await readParts(`models/${system}.glb`);
  const warped = new Float32Array(fs.readFileSync(path.join(FIT, `${system}.warped.bin`)).buffer.slice(0));
  let off = 0, added = 0;
  const seen = new Set();
  for (const p of male) {
    const n = p.pos.length;
    const pos = warped.slice(off, off + n); off += n;
    const id = p.name.replace(/_\d+$/, '');
    const cat = mById.get(id);
    if (!cat || SKIP[system].test(cat.en) || (DU && DU_REPLACES_MALE.test(cat.en))) continue;
    items.push({ name: seen.has(id) ? `${id}_${seen.size}` : id, pos, index: p.index });
    if (!seen.has(id)) {
      seen.add(id);
      const scale = boxVol(pos) / Math.max(boxVol(p.pos), 1e-12);
      newParts.push({ id, en: cat.en, es: cat.es ?? null, la: cat.la ?? null, system, vol: cat.vol != null ? Math.round(cat.vol * scale * 100) / 100 : null, from: 'BodyParts3D' });
      added++;
    }
  }
  for (const m of duItems[system].meta ?? []) newParts.push(m);
  if (off !== warped.length) throw new Error(`${system}: el volcado deformado no coincide (${off} vs ${warped.length})`);
  // 3) escribir
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
  await io.write(web(femFile), doc);
  const bytes = fs.statSync(web(femFile)).size;
  femModels[system] = { file: femFile, parts: new Set(items.map((i) => i.name.replace(/_\d+$/, ''))).size, tris, bytes };
  console.log(`${system.padEnd(12)} +${added} piezas de BodyParts3D  total ${items.length} mallas  ${(bytes / 1e6).toFixed(2)} MB`);
}
femCat.parts = newParts;
fs.writeFileSync(web('data/female.json'), JSON.stringify(femCat));
fs.writeFileSync(web('data/female-models.json'), JSON.stringify(femModels, null, 1));
console.log('catálogo femenino:', newParts.length, 'piezas');
