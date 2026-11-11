// Fisiología en movimiento: animaciones sobre el cuerpo 3D (sangre, latido, respiración, impulsos nerviosos,
// digestión y orina). Las rutas se calculan a partir de la geometría real de cada pieza (línea central).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { PROCESSES, ROUTES, SPINE, NERVE_TUBES } from './physio-data.js?v=531bae72';
import { donateHtml } from './launch.js?v=531bae72';

const V3 = THREE.Vector3;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const smooth = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
const bump = (x, a, b) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
const DIRS = {
  front: new V3(0, 0.12, 1), back: new V3(0, 0.12, -1), left: new V3(1, 0.1, 0.25), right: new V3(-1, 0.1, 0.25),
  top: new V3(0, 1, 0.35), bottom: new V3(0, -1, 0.3), oblique: new V3(0.6, 0.2, 1),
};

// ---------------------------------------------------------------- geometría ------------------
function meshPoints(m, max = 3500) {
  const pos = m.geometry.attributes.position, n = pos.count, step = Math.max(1, Math.floor(n / max));
  const out = [];
  for (let i = 0; i < n; i += step) out.push(new V3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  return out;
}
const centroid = (P) => P.reduce((a, p) => a.add(p), new V3()).divideScalar(Math.max(P.length, 1));

// desviaciones típicas a lo largo de los 3 ejes principales (PCA por iteración de potencias)
function spreads(P) {
  const c = centroid(P), C = [0, 0, 0, 0, 0, 0];
  for (const p of P) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z;
  }
  const n = P.length;
  const mul = (M, v) => new V3(M[0] * v.x + M[1] * v.y + M[2] * v.z, M[1] * v.x + M[3] * v.y + M[4] * v.z, M[2] * v.x + M[4] * v.y + M[5] * v.z);
  const power = (M) => { let v = new V3(0.31, 0.93, 0.17).normalize(); for (let k = 0; k < 30; k++) v = mul(M, v).normalize(); return v; };
  const a1 = power(C), l1 = a1.dot(mul(C, a1));
  const D = [C[0] - l1 * a1.x * a1.x, C[1] - l1 * a1.x * a1.y, C[2] - l1 * a1.x * a1.z, C[3] - l1 * a1.y * a1.y, C[4] - l1 * a1.y * a1.z, C[5] - l1 * a1.z * a1.z];
  const a2 = power(D), l2 = Math.max(a2.dot(mul(C, a2)), 0);
  const a3 = new V3().crossVectors(a1, a2).normalize(), l3 = Math.max(a3.dot(mul(C, a3)), 0);
  let lo = Infinity, hi = -Infinity;
  for (const p of P) { const t = p.dot(a1); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return { c, s: [Math.sqrt(l1 / n), Math.sqrt(l2 / n), Math.sqrt(l3 / n)], len: hi - lo };
}

// Línea central de un tubo (vaso, bronquio, intestino): vóxeles del tamaño del diámetro → grafo de vecinos →
// camino más largo dentro del grafo (diámetro del árbol). Funciona con tubos curvos y ramificados.
function centerline(P) {
  if (P.length < 12) return [centroid(P)];
  const { s, len } = spreads(P);
  const r = Math.max(Math.min(s[1], s[2]) * 1.414, 1e-5);
  const vox = Math.max(2 * r, len / 70);
  const cells = new Map();
  for (const p of P) {
    const k = `${Math.floor(p.x / vox)},${Math.floor(p.y / vox)},${Math.floor(p.z / vox)}`;
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { s: new V3(), n: 0 }));
    c.s.add(p); c.n++;
  }
  const nodes = [...cells.entries()].map(([k, c]) => ({ k: k.split(',').map(Number), p: c.s.divideScalar(c.n) }));
  if (nodes.length < 3) return nodes.map((n) => n.p);
  const index = new Map(nodes.map((n, i) => [n.k.join(','), i]));
  const adj = nodes.map(() => []);
  nodes.forEach((n, i) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const j = index.get(`${n.k[0] + dx},${n.k[1] + dy},${n.k[2] + dz}`);
      if (j !== undefined && j > i) { const w = n.p.distanceTo(nodes[j].p); adj[i].push([j, w]); adj[j].push([i, w]); }
    }
  });
  // componente más grande
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = 0, bestSize = 0;
  for (let i = 0, c = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    let size = 0; const st = [i]; comp[i] = c;
    while (st.length) { const u = st.pop(); size++; for (const [v] of adj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
    if (size > bestSize) { bestSize = size; best = i; }
    c++;
  }
  const dijkstra = (src) => {
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
    dist[src] = 0;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of adj[u]) if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; }
    }
    let far = src;
    for (let i = 0; i < nodes.length; i++) if (dist[i] < Infinity && dist[i] > dist[far]) far = i;
    return { far, prev };
  };
  const a = dijkstra(best).far, { far: b, prev } = dijkstra(a);
  const path = [];
  for (let u = b; u >= 0; u = prev[u]) path.push(nodes[u].p.clone());
  // suavizar (el centro de cada vóxel no cae exactamente en el eje)
  for (let pass = 0; pass < 2; pass++) {
    const q = path.map((p) => p.clone());
    for (let i = 1; i < path.length - 1; i++) path[i] = q[i - 1].clone().add(q[i]).add(q[i + 1]).divideScalar(3);
  }
  return path;
}

// Centro del canal vertebral: en la vista desde arriba es el hueco más grande rodeado de hueso.
function canalCenter(m) {
  const P = meshPoints(m, 5000);
  const c = centroid(P);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const G = 40, cw = (x1 - x0) / G, cd = (z1 - z0) / G;
  const occ = new Uint8Array(G * G), pts = [];
  for (const p of P) {
    const i = Math.min(G - 1, Math.floor((p.x - x0) / cw)), j = Math.min(G - 1, Math.floor((p.z - z0) / cd));
    if (!occ[j * G + i]) { occ[j * G + i] = 1; pts.push([i, j]); }
  }
  let best = null, bestD = 0;
  for (let j = 1; j < G - 1; j++) for (let i = Math.floor(G * 0.3); i < Math.ceil(G * 0.7); i++) {
    if (occ[j * G + i]) continue;
    // rodeado: hay hueso a la izquierda, derecha, delante y detrás
    let l = 0, r = 0, f = 0, b = 0;
    for (let k = 0; k < i; k++) l ||= occ[j * G + k];
    for (let k = i + 1; k < G; k++) r ||= occ[j * G + k];
    for (let k = 0; k < j; k++) b ||= occ[k * G + i];
    for (let k = j + 1; k < G; k++) f ||= occ[k * G + i];
    if (!(l && r && f && b)) continue;
    let d = Infinity;
    for (const [pi, pj] of pts) d = Math.min(d, Math.hypot((pi - i) * cw, (pj - j) * cd));
    if (d > bestD) { bestD = d; best = [i, j]; }
  }
  return best ? new V3(x0 + (best[0] + 0.5) * cw, c.y, z0 + (best[1] + 0.5) * cd) : c;
}

// ---------------------------------------------------------------- rutas ---------------------
function createGeo(body) {
  const byName = new Map();
  for (const m of body.meshes.values()) {
    const n = m.userData.part.en;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(m);
  }
  const lines = new Map(), centers = new Map();
  const line = (m) => { if (!lines.has(m)) lines.set(m, centerline(meshPoints(m))); return lines.get(m); };
  const center = (m) => { if (!centers.has(m)) centers.set(m, centroid(meshPoints(m, 2000))); return centers.get(m); };
  let spine = null;
  const spinePts = () => {
    if (spine) return spine;
    spine = SPINE.map((n) => byName.get(n)?.[0]).filter(Boolean).map((m) => ({ name: m.userData.part.en, p: canalCenter(m) }));
    // la médula va por la línea media: x = mediana; profundidad suavizada (quita saltos de una vértebra mal estimada)
    const xs = spine.map((s) => s.p.x).sort((a, b) => a - b), mx = xs[Math.floor(xs.length / 2)];
    const zs = spine.map((s) => s.p.z);
    spine.forEach((s, i) => {
      const w = zs.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b);
      s.p.x = mx; s.p.z = w[Math.floor(w.length / 2)];
    });
    return spine;
  };
  const H = body.bodyBox.max.y - body.bodyBox.min.y;
  // piezas del corazón: por nombre y, además, cerca de las cavidades (evita vasos del cerebro con «ventricle» en el nombre)
  const HEART_RE = /atri|ventric|valve|cusp|leaflet|papillary|chordae|septum|coronary|interventricular|cardiac vein|coronary sinus|conus/i;
  let heartC = null;
  const isHeart = (m) => {
    const p = m.userData.part;
    if (p.system !== 'cardiovascular' || !HEART_RE.test(p.en)) return false;
    if (!heartC) {
      const cav = ['Cavity of left ventricle', 'Cavity of right ventricle', 'Cavity of left atrium', 'Cavity of right atrium'].flatMap((n) => byName.get(n) || []);
      heartC = cav.length ? centroid(cav.map(center)) : new V3(0, 1e9, 0);
    }
    return center(m).distanceTo(heartC) < H * 0.08;
  };

  function cordPoints(a, b) {
    const S = spinePts(), i = S.findIndex((s) => s.name === a), j = S.findIndex((s) => s.name === b);
    if (i < 0 || j < 0) return [];
    const seg = i <= j ? S.slice(i, j + 1) : S.slice(j, i + 1).reverse();
    return seg.map((s) => s.p.clone());
  }

  // un tramo de la ruta → lista de piezas (cada una con sus puntos y su malla)
  function resolve(it, near) {
    if (typeof it === 'string') it = { n: it };
    if (it.cord) { const pts = cordPoints(...it.cord); return pts.length ? [{ pts, meshes: [] }] : []; }
    let ms = byName.get(it.n || it.pt) || [];
    if (!ms.length) return [];
    if (it.pick === 'largest') ms = [ms.reduce((a, m) => (m.geometry.attributes.position.count > a.geometry.attributes.position.count ? m : a))];
    if (it.pick === 'nearest' && near) ms = [ms.reduce((a, m) => (center(m).distanceTo(near) < center(a).distanceTo(near) ? m : a))];
    if (it.pt) return [{ pts: [ms.reduce((a, m) => a.add(center(m)), new V3()).divideScalar(ms.length)], meshes: ms }];
    return ms.map((m) => ({ pts: line(m), meshes: [m] }));
  }
  const nearestIdx = (pts, q) => { let k = 0, d = Infinity; pts.forEach((p, i) => { const e = p.distanceToSquared(q); if (e < d) { d = e; k = i; } }); return k; };
  const nearestToSet = (pts, set) => {
    let k = 0, d = Infinity;
    pts.forEach((p, i) => { for (const q of set) { const e = p.distanceToSquared(q); if (e < d) { d = e; k = i; } } });
    return k;
  };

  function build(spec) {
    const out = [], marks = [];
    for (let k = 0; k < spec.length; k++) {
      const prevEnd = out.length ? out[out.length - 1] : null;
      let pieces = resolve(spec[k], prevEnd);
      if (!pieces.length) continue;
      const nextPieces = spec[k + 1] ? resolve(spec[k + 1], null) : [];
      const nextSet = nextPieces.flatMap((p) => p.pts);
      const nextHint = nextSet.length ? centroid(nextSet) : null;
      // varias piezas con el mismo nombre (asas del intestino): encadenar por cercanía
      if (pieces.length > 1) {
        const rest = pieces.slice(), ordered = [];
        let cur = prevEnd || nextHint || rest[0].pts[0];
        while (rest.length) {
          let bi = 0, bd = Infinity;
          rest.forEach((p, i) => { const d = Math.min(p.pts[0].distanceTo(cur), p.pts[p.pts.length - 1].distanceTo(cur)); if (d < bd) { bd = d; bi = i; } });
          const p = rest.splice(bi, 1)[0];
          const pts = p.pts[0].distanceTo(cur) <= p.pts[p.pts.length - 1].distanceTo(cur) ? p.pts : p.pts.slice().reverse();
          ordered.push({ pts, meshes: p.meshes });
          cur = pts[pts.length - 1];
        }
        pieces = ordered;
      } else if (pieces[0].pts.length > 1) {
        let pts = pieces[0].pts;
        const sc = (a, b) => (prevEnd ? a.distanceTo(prevEnd) : 0) + (nextHint ? b.distanceTo(nextHint) : 0);
        if (sc(pts[pts.length - 1], pts[0]) < sc(pts[0], pts[pts.length - 1])) pts = pts.slice().reverse();
        // empalmes en T: empezar donde se une con el tramo anterior y terminar donde sale el siguiente
        const i0 = prevEnd ? nearestIdx(pts, prevEnd) : 0;
        let i1 = nextSet.length ? nearestToSet(pts, nextSet) : pts.length - 1;
        if (i1 <= i0) i1 = pts.length - 1;
        pieces = [{ pts: pts.slice(i0, i1 + 1), meshes: pieces[0].meshes }];
      }
      for (const p of pieces) {
        const a = out.length;
        out.push(...p.pts.map((q) => q.clone()));
        marks.push({ a, b: out.length - 1, meshes: p.meshes });
      }
    }
    // quitar puntos repetidos
    const eps = H * 0.003, pts = [], map = [];
    out.forEach((p, i) => { if (!pts.length || p.distanceTo(pts[pts.length - 1]) > eps) pts.push(p); map[i] = pts.length - 1; });
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const N = Math.max(60, Math.min(800, Math.round((len / H) * 500)));
    const table = curve.getSpacedPoints(N);
    // fracción del recorrido de cada pieza (para iluminar lo que atraviesa el impulso)
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const tot = cum[cum.length - 1] || 1;
    const pieces = marks.filter((m) => m.meshes.length).map((m) => ({ u0: cum[map[m.a]] / tot, u1: cum[map[m.b]] / tot, meshes: m.meshes }));
    return { curve, len, table, pieces };
  }
  return { byName, H, build, center, spinePts, cordPoints, isHeart };
}

function sample(route, u, out) {
  const t = route.table, f = (((u % 1) + 1) % 1) * (t.length - 1), i = Math.floor(f);
  return out.copy(t[i]).lerp(t[Math.min(i + 1, t.length - 1)], f - i);
}

// ---------------------------------------------------------------- módulo --------------------
export function createPhysio(viewer, panel, chipsEl, { toast } = {}) {
  const root = new THREE.Group();
  root.name = 'physio';
  root.visible = false;
  viewer.scene.add(root);

  const MAXP = 4000;
  const pGeo = new THREE.IcosahedronGeometry(1, 1);
  const pMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const particles = new THREE.InstancedMesh(pGeo, pMat, MAXP);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.setColorAt(0, new THREE.Color());
  particles.frustumCulled = false;
  particles.count = 0;
  particles.raycast = () => {};
  root.add(particles);

  const geos = new WeakMap(); // cuerpo → geometría (rutas cacheadas)
  let body = null, geo = null, proc = null, procIdx = 0, stepIdx = 0, stepT = 0, playing = true, speed = 1;
  let streams = [], snapshot = null, disposeTick = null, extras = [], movers = [], flashes = [];
  let heart = null, lungs = null, diaphragm = null, rate = 72, phase = 0, breath = 0, graphBuf = [], tourT = 0, tourI = -1;
  let visibleStreams = null;
  // enfermedad activa, objetos que dibuja y casos clínicos
  let dz = null, dzMarks = [], dzObjs = [], beatObjs = [], beatK = 1, tNow = 0;
  let audio = null, soundOn = false, caseIdx = 0, caseAns = null, score = [0, 0];
  const fx = () => dz?.fx;

  // marca fija sobre una pieza (lesión, órgano afectado); se borra al cambiar de enfermedad o de caso
  function mark(m, color, opacity = 0.75, depthTest = false, beats = false) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false, toneMapped: false });
    const o = new THREE.Mesh(m.geometry, mat);
    o.matrixAutoUpdate = false; o.matrix.copy(m.matrixWorld); o.renderOrder = 997; o.raycast = () => {};
    root.add(o);
    dzMarks.push(o);
    if (beats) beatObjs.push({ o, base: m.matrixWorld.clone() });
    return o;
  }
  function ball(p, r, color) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    o.position.copy(p); o.raycast = () => {}; o.renderOrder = 999;
    root.add(o);
    dzObjs.push(o);
    return o;
  }
  function clearDisease() {
    for (const o of dzMarks) { root.remove(o); o.material.dispose(); }
    for (const o of dzObjs) { root.remove(o); o.geometry.dispose(); o.material.dispose(); }
    dzMarks = []; dzObjs = []; beatObjs = [];
    for (const st of streams) st.blockU = null;
    for (const mv of movers.filter((mv) => mv.dz)) mv.reset();
    movers = movers.filter((mv) => !mv.dz);
    dz = null; beatK = 1;
  }
  // corta un flujo a mitad de una pieza (lesión, piedra); devuelve el punto del corte
  function block(id, name, frac) {
    const st = streams.find((s) => s.id === id);
    const pc = st?.route.pieces.find((p) => p.meshes.some((m) => m.userData.part.en === name));
    if (!pc) return null;
    st.blockU = pc.u0 + (pc.u1 - pc.u0) * frac;
    return sample(st.route, st.blockU, new V3());
  }
  function setupInfarct() {
    const LAD = ['Trunk of anterior interventricular branch of left coronary artery', 'Diagonal branch of anterior descending branch of left coronary artery',
      'First right anterior branch of anterior interventricular branch of left coronary artery', 'Second right anterior branch of anterior interventricular branch of left coronary artery',
      'Third right anterior branch of anterior interventricular branch of left coronary artery', 'Septal branch of anterior interventricular artery'];
    const lad = LAD.flatMap((n) => geo.byName.get(n) || []);
    lad.forEach((m) => mark(m, '#241414', 0.9, false, true));
    // coágulo al inicio de la descendente anterior
    const trunk = geo.byName.get('Trunk of anterior interventricular branch of left coronary artery')?.[0];
    const lct = geo.byName.get('Trunk of left coronary artery')?.[0];
    let clotY = Infinity;
    if (trunk) {
      const line = centerline(meshPoints(trunk));
      const ref = lct ? geo.center(lct) : line[0];
      const s = line[0].distanceTo(ref) <= line[line.length - 1].distanceTo(ref) ? line[0] : line[line.length - 1];
      ball(s, geo.H * 0.0045, '#111111');
      clotY = s.y;
    }
    // zona sin oxígeno: los triángulos de la pared ventricular cerca de la arteria tapada
    const wall = geo.byName.get('Wall of ventricle')?.[0];
    // territorio del ventrículo izquierdo: tronco, diagonal y septal (no las ramas que van al ventrículo derecho)
    const P = lad.filter((m) => !/right anterior branch/i.test(m.userData.part.en))
      .flatMap((m) => meshPoints(m, 80)).filter((p) => p.y < clotY - geo.H * 0.008);
    if (!wall || !P.length) return;
    const pos = wall.geometry.attributes.position, idx = wall.geometry.index, R2 = (geo.H * 0.011) ** 2;
    const out = [], a = new V3(), b = new V3(), c = new V3(), g = new V3();
    const nTri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nTri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(wall.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(wall.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(wall.matrixWorld);
      g.copy(a).add(b).add(c).divideScalar(3);
      if (P.some((p) => p.distanceToSquared(g) < R2)) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    if (!out.length) return;
    const zg = new THREE.BufferGeometry();
    zg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const zone = new THREE.Mesh(zg, new THREE.MeshBasicMaterial({ color: '#6e6478', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    zone.matrixAutoUpdate = false; zone.renderOrder = 996; zone.raycast = () => {};
    root.add(zone);
    dzObjs.push(zone);
    beatObjs.push({ o: zone, base: new THREE.Matrix4() });
  }
  function setDisease(id) {
    clearDisease();
    dz = (proc.diseases || []).find((d) => d.id === id) || null;
    if (dz) {
      if (fx() === 'infarto') setupInfarct();
      if (fx() === 'asma') {
        for (const m of body.meshes.values()) {
          if (m.visible && m.userData.part.system === 'respiratorio' && /bronch/i.test(m.userData.part.en)) mark(m, '#ff7a2f', 0.5, true);
        }
      }
      if (fx() === 'acv') {
        block('n-motor', 'Right internal capsule', 0.5);
        (geo.byName.get('Right internal capsule') || []).forEach((m) => mark(m, '#9b1028', 0.9));
      }
      if (fx() === 'calculo') {
        const p = block('k-orina-i', 'Left ureter', 0.4);
        if (p) ball(p, geo.H * 0.0042, '#d8c79a');
        const k = geo.byName.get('Left kidney')?.[0];
        if (k) { const mv = mover(k); mv.dz = true; scaleAbout(mv, geo.center(k), 1.12, 1.08, 1.12); }
      }
    }
    renderPanel();
    if (dz && dz.step !== undefined) goStep(dz.step);
  }

  // --- sonido de los ruidos cardiacos (S1 «lub», S2 «dub») ---------------------------------------
  function thump(f, d, gain) {
    if (!audio) return;
    const t = audio.currentTime, o = audio.createOscillator(), o2 = audio.createOscillator(), gn = audio.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + d);
    o2.type = 'triangle'; o2.frequency.value = f * 2.2;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(gain, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn); o2.connect(gn); gn.connect(audio.destination);
    o.start(t); o2.start(t); o.stop(t + d + 0.03); o2.stop(t + d + 0.03);
  }

  // --- capas ---------------------------------------------------------------------------------
  function applyLayers(layers) {
    snapshot = body.snapshot();
    const ids = new Set();
    for (const s of body.order) body.state.sysVisible[s] = !!layers[s];
    for (const [id, m] of body.meshes) {
      const p = m.userData.part, L = layers[p.system];
      if (!L) continue;
      if (L.skip && new RegExp(L.skip, 'i').test(p.en)) continue;
      if (typeof L === 'object' && (L.names || L.heart)) {
        const ok = (L.names && L.names.includes(p.en)) || (L.heart && geo.isHeart(m));
        if (!ok) continue;
      }
      ids.add(id);
    }
    body.state.hidden = new Set();
    body.state.isolated = ids;
    for (const s of body.order) body.setSystemOpacity(s, layers[s] ? (typeof layers[s] === 'object' ? layers[s].op : layers[s]) : 1);
  }

  // --- piezas que se mueven (latido, diafragma) -----------------------------------------------
  function mover(m) {
    const base = m.matrixWorld.clone(), b = m.userData.batch, i = m.userData.inst;
    const mv = { m, base, set: (M) => b.setMatrixAt(i, M), reset: () => b.setMatrixAt(i, base) };
    movers.push(mv);
    return mv;
  }
  const _M = new THREE.Matrix4(), _S = new THREE.Matrix4(), _T = new THREE.Matrix4(), _Ti = new THREE.Matrix4();
  function scaleAbout(mv, c, sx, sy, sz) {
    _T.makeTranslation(c.x, c.y, c.z); _Ti.makeTranslation(-c.x, -c.y, -c.z); _S.makeScale(sx, sy, sz);
    mv.set(_M.copy(_T).multiply(_S).multiply(_Ti).multiply(mv.base));
  }

  // --- destellos: copia de la pieza dibujada encima de todo, que se desvanece ----------------------
  const FLASH = new THREE.Color('#3ff0ff');
  function flash(m, color = FLASH, dur = 0.7, peak = 0.8) {
    if (flashes.some((f) => f.m === m && f.t < dur * 0.4)) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: peak, depthTest: false, depthWrite: false, toneMapped: false });
    const o = new THREE.Mesh(m.geometry, mat);
    o.matrixAutoUpdate = false; o.matrix.copy(m.matrixWorld); o.renderOrder = 998; o.raycast = () => {};
    root.add(o);
    flashes.push({ m, o, t: 0, dur, peak });
  }
  function clearFlashes() { for (const f of flashes) { root.remove(f.o); f.o.material.dispose(); } flashes = []; }

  // --- extras: pulmones, médula, nervios ------------------------------------------------------
  function addExtras() {
    const H = geo.H;
    if (proc.lungs) {
      const trach = geo.byName.get('Trachea')?.[0];
      const cx = trach ? geo.center(trach).x : 0;
      const sides = { L: [], R: [] };
      for (const m of body.meshes.values()) {
        const p = m.userData.part;
        if (p.system !== 'respiratorio' || !/bronch/i.test(p.en) || !m.visible) continue;
        const P = meshPoints(m, 400);
        for (const q of P) (q.x > cx ? sides.L : sides.R).push(q);
      }
      lungs = [];
      for (const pts of Object.values(sides)) {
        if (pts.length < 20) continue;
        const c = centroid(pts);
        const top = pts.reduce((a, p) => (p.y > a.y ? p : a), pts[0]);
        const g = new ConvexGeometry(pts.map((p) => p.clone().sub(c).multiplyScalar(1.16).add(c)));
        g.translate(-c.x, -top.y, -c.z);
        g.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: '#f0a3ad', roughness: 0.7, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, mat);
        mesh.position.set(c.x, top.y, c.z);
        mesh.raycast = () => {};
        mesh.renderOrder = 3;
        root.add(mesh);
        extras.push(mesh);
        lungs.push(mesh);
      }
      const d = geo.byName.get('Diaphragm')?.[0];
      diaphragm = d ? mover(d) : null;
    }
    if (proc.cord) {
      const S = geo.spinePts().map((s) => s.p);
      if (S.length > 3) {
        // la médula termina hacia L1-L2; arriba sigue al bulbo
        const med = geo.byName.get('Medulla oblongata');
        if (med?.length) S.unshift(med.reduce((a, m) => a.add(geo.center(m)), new V3()).divideScalar(med.length));
        addTube(S, H * 0.0055, '#f2c14e', 0.95);
      }
    }
    if (proc.nerves) {
      for (const spec of NERVE_TUBES) {
        const r = geo.build(spec);
        if (r) addTube(r.table, H * 0.0022, '#f2c14e', 0.9, true);
      }
    }
  }
  function addTube(pts, radius, color, opacity, already) {
    const curve = new THREE.CatmullRomCurve3(already ? pts : pts.map((p) => p.clone()), false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.max(40, pts.length * 3), radius, 10, false);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: opacity < 1, opacity, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.raycast = () => {};
    root.add(mesh);
    extras.push(mesh);
  }

  // --- corazón ---------------------------------------------------------------------------------
  function setupHeart() {
    const list = [...body.meshes.values()].filter(geo.isHeart);
    if (!list.length) return null;
    const box = new THREE.Box3();
    list.forEach((m) => box.expandByObject(m));
    return {
      box, center: box.getCenter(new V3()),
      atria: list.filter((m) => /atri|auricle/i.test(m.userData.part.en)).map(mover),
      vent: list.filter((m) => !/atri|auricle/i.test(m.userData.part.en)).map(mover),
    };
  }
  // fases del ciclo (0-1 por latido, la duración de la diástole se acorta al subir la frecuencia)
  const sysDur = () => Math.min(0.42, 0.3 * (rate / 72) ** 0.5);
  const atrialK = (φ) => (fx() === 'fa' ? 0.12 * (0.5 + 0.5 * Math.sin(tNow * 47)) : bump(φ, 0.02, 0.2));
  const ventK = (φ) => bump(φ, 0.18, 0.18 + sysDur());
  function ecg(φ) {
    const g = (c, w, a) => a * Math.exp(-(((φ - c) / w) ** 2));
    const qt = 0.18 + sysDur();
    let v = g(0.165, 0.008, -0.12) + g(0.18, 0.009, 1) + g(0.197, 0.01, -0.28) + g(qt - 0.06, 0.045, 0.3);
    if (fx() === 'fa') v += 0.045 * Math.sin(tNow * 41) + 0.03 * Math.sin(tNow * 27 + 1.3); // sin onda P, línea temblorosa
    else v += g(0.08, 0.03, 0.13);
    if (fx() === 'infarto') v += 0.3 * smooth((φ - 0.2) / 0.025) * smooth((qt - 0.03 - φ) / 0.06); // ST elevado
    return v;
  }
  // respiración: en el asma la espiración es lenta y el pulmón no se vacía (aire atrapado)
  const inspF = () => (fx() === 'asma' ? 0.28 : 0.4);
  function breathVol(β) {
    const i = inspF(), x = β < i ? smooth(β / i) : 1 - smooth((β - i) / (1 - i));
    return fx() === 'asma' ? 0.45 + 0.55 * x : x;
  }

  // --- diagrama de Wiggers: un ciclo cardiaco completo (presiones en mmHg y volumen del VI en ml) ---
  function wiggers() {
    const s = 0.19, o = 0.235, e = 0.17 + sysDur(), r = e + 0.06;
    const inf = fx() === 'infarto', fa = fx() === 'fa';
    const kick = (φ) => (fa ? 0 : bump(φ, 0.03, 0.16));
    const PK = inf ? 100 : 122, EDV = fa ? 110 : 120, ESV = inf ? 76 : 50;
    const shape = (p) => Math.pow(Math.sin(Math.PI * p), 0.7) * (1 - 0.3 * p) + 0.33 * p;
    const lv = (φ) => {
      if (φ < s) return 5 + 5 * kick(φ);
      if (φ < o) return 9 + 71 * smooth((φ - s) / (o - s));
      if (φ < e) return 80 + (PK - 80) * shape((φ - o) / (e - o));
      const pe = 80 + (PK - 80) * shape(1);
      if (φ < r) return 6 + (pe - 6) * (1 - smooth((φ - e) / (r - e)));
      return 5 + 1.5 * ((φ - r) / (1 - r));
    };
    const pe = lv(e - 1e-4);
    const ao = (φ) => {
      if (φ >= o && φ < e) return lv(φ) - 1.5;
      const d = φ >= e ? φ - e : φ + 1 - e, D = 1 - e + o;
      return pe - (pe - 80) * (d / D) - 6 * bump(d, 0, 0.035) + 3 * bump(d, 0.025, 0.08); // incisura dicrota
    };
    const la = (φ) => {
      const v = φ < o ? 0 : φ < r ? 6 * smooth((φ - o) / (r - o)) : 6 * (1 - smooth((φ - r) / 0.12));
      return 5 + 5 * kick(φ) + 2 * bump(φ, s, o) + v;
    };
    const fill = (φ) => ESV + (EDV - 10 - ESV) * (1 - Math.exp(-(φ - r) / 0.07)) / (1 - Math.exp(-(1 - r) / 0.07));
    const vol = (φ) => {
      if (φ < s) return fa ? EDV : EDV - 10 + 10 * smooth((φ - 0.03) / 0.13);
      if (φ < o) return EDV;
      if (φ < e) return EDV - (EDV - ESV) * (1 - (1 - (φ - o) / (e - o)) ** 2);
      if (φ < r) return ESV;
      return fa ? ESV + (EDV - ESV) * (1 - Math.exp(-(φ - r) / 0.07)) / (1 - Math.exp(-(1 - r) / 0.07)) : fill(φ);
    };
    return { s, e, lv, ao, la, vol, EDV, ESV };
  }

  // --- flujos de partículas --------------------------------------------------------------------
  function buildStreams() {
    streams = [];
    const H = geo.H;
    for (const s of proc.streams) {
      const route = geo.build(ROUTES[s.route]);
      if (!route) continue;
      const st = { ...s, route, col: new THREE.Color(s.color), col2: s.color2 ? new THREE.Color(s.color2) : null, size: H * 0.0032 * (s.size || 1), parts: [] };
      if (s.burst) {
        st.timer = -(s.delay || 0);
        st.bursts = [];
      } else {
        const n = Math.max(4, Math.round((route.len / H) * (s.density || 50)));
        for (let i = 0; i < n; i++) st.parts.push({ u: i / n + Math.random() * (0.6 / n), j: (Math.random() - 0.5) });
      }
      streams.push(st);
    }
  }

  const _p = new V3(), _q = new THREE.Quaternion(), _sc = new V3(), _mx = new THREE.Matrix4(), _c = new THREE.Color();
  function tick(dt) {
    if (!proc) return;
    const real = dt;
    dt = playing ? dt * speed : 0;
    tNow += dt;
    // ritmo (en la fibrilación auricular cada latido dura distinto)
    if (proc.rate?.kind === 'hr') {
      const prev = phase;
      phase += dt * rate / 60 * beatK;
      if (phase >= 1) { phase -= 1; beatK = fx() === 'fa' ? 0.6 + Math.random() * 0.95 : 1; }
      // ruidos cardiacos: S1 al empezar la contracción ventricular, S2 al terminar
      if (soundOn && playing && proc.sound) {
        const s2 = 0.17 + sysDur();
        const crossed = (x) => (prev < x && phase >= x) || (phase < prev && (prev < x || phase >= x));
        if (crossed(0.19)) thump(62, 0.16, 0.9);
        if (crossed(s2)) thump(88, 0.11, 0.65);
      }
    }
    if (proc.rate?.kind === 'rr') breath = (breath + dt * rate / 60) % 1;
    const vk = ventK(phase) * (fx() === 'infarto' ? 0.55 : 1), ak = atrialK(phase);
    // latido
    if (heart && proc.beat) {
      for (const mv of heart.vent) scaleAbout(mv, heart.center, 1 - 0.07 * vk, 1 - 0.05 * vk, 1 - 0.07 * vk);
      for (const mv of heart.atria) scaleAbout(mv, heart.center, 1 - 0.05 * ak, 1 - 0.04 * ak, 1 - 0.05 * ak);
      const c = heart.center;
      _T.makeTranslation(c.x, c.y, c.z); _Ti.makeTranslation(-c.x, -c.y, -c.z); _S.makeScale(1 - 0.07 * vk, 1 - 0.05 * vk, 1 - 0.07 * vk);
      for (const b of beatObjs) b.o.matrix.copy(_T).multiply(_S).multiply(_Ti).multiply(b.base);
    }
    // respiración
    const vol = breathVol(breath), flow = breath < inspF() ? 1 : (fx() === 'asma' ? -0.3 : -0.67);
    if (lungs) for (const l of lungs) l.scale.set(1 + 0.05 * vol, 1 + 0.09 * vol, 1 + 0.06 * vol);
    if (diaphragm) {
      _M.makeTranslation(0, -geo.H * 0.014 * vol, 0).multiply(diaphragm.base);
      diaphragm.set(_M);
    }
    // partículas: más pequeñas al acercarse (en primer plano no tapan los vasos)
    const camD = viewer.camera.position.distanceTo(viewer.controls.target);
    const zoomK = Math.min(1, Math.max(0.28, camD / (geo.H * 2.4)));
    let n = 0;
    const gateOf = (st) => {
      if (st.gate === 'heart') return 0.25 + 2.1 * vk;
      if (st.gate === 'fill') return 0.15 + 1.8 * (1 - vk) * (phase > 0.5 ? 1 : 0.4) + 1.2 * ak;
      if (st.gate === 'breath') { const i = inspF(); return flow * (0.4 + 1.2 * Math.sin(Math.PI * (breath < i ? breath / i : (breath - i) / (1 - i)))); }
      return 1;
    };
    for (const st of streams) {
      if (visibleStreams && !visibleStreams.has(st.id)) continue;
      const du = (dt * st.speed * geo.H * gateOf(st)) / st.route.len;
      const color = st.col2 && st.gate === 'breath' && flow < 0 ? st.col2 : st.col;
      if (st.burst) {
        st.timer += dt;
        if (st.timer >= st.burst) { st.timer = 0; st.bursts.push({ u: 0, prev: 0 }); }
        for (const b of st.bursts) {
          b.prev = b.u; b.u += du;
          // lesión: el impulso se apaga ahí
          if (st.blockU != null && b.u >= st.blockU) { b.dead = true; continue; }
          if (st.flash) for (const pc of st.route.pieces) if (b.prev < pc.u1 && b.u >= pc.u0) pc.meshes.forEach((m) => flash(m, st.col));
          for (let k = 0; k < 7 && n < MAXP; k++) {
            const u = b.u - k * 0.006;
            if (u < 0 || u > 1) continue;
            sample(st.route, u, _p);
            const s = st.size * zoomK * (1.9 - k * 0.22);
            particles.setMatrixAt(n, _mx.compose(_p, _q, _sc.set(s, s, s)));
            particles.setColorAt(n, _c.copy(color).multiplyScalar(1.4 - k * 0.12));
            n++;
          }
        }
        st.bursts = st.bursts.filter((b) => !b.dead && b.u - 0.04 < 1);
        continue;
      }
      for (const p of st.parts) {
        const prev = p.u;
        p.u += du;
        // obstrucción (piedra): las partículas se amontonan antes
        if (st.blockU != null && prev < st.blockU && p.u >= st.blockU) p.u = st.blockU - 0.012 - Math.random() * 0.1;
        if (p.u > 1) p.u -= 1;
        if (p.u < 0) p.u += 1;
        if (st.flash && du > 0) for (const pc of st.route.pieces) if (prev < pc.u0 && p.u >= pc.u0) pc.meshes.forEach((m) => flash(m, new THREE.Color(st.flashColor || st.color), 1.4, 0.45));
        if (n >= MAXP) break;
        sample(st.route, p.u, _p);
        // pequeño desvío lateral para que no vayan en fila perfecta
        _p.x += p.j * st.size * 1.4; _p.z += Math.sin(p.j * 9) * st.size * 1.2;
        const fade = Math.min(1, p.u * 25, (1 - p.u) * 25);
        const s = st.size * zoomK * (0.4 + 0.6 * fade);
        particles.setMatrixAt(n, _mx.compose(_p, _q, _sc.set(s, s, s)));
        particles.setColorAt(n, color);
        n++;
      }
    }
    particles.count = n;
    particles.instanceMatrix.needsUpdate = true;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    // destellos
    for (const f of flashes) { f.t += real; f.o.material.opacity = f.peak * Math.max(0, 1 - f.t / f.dur); }
    flashes = flashes.filter((f) => { if (f.t < f.dur) return true; root.remove(f.o); f.o.material.dispose(); return false; });
    // recorrido por zonas (mapa del cerebro)
    const step = proc.steps[stepIdx];
    if (!step) return; // casos clínicos: sin pasos
    if (step.tour && playing) {
      tourT += real;
      const i = Math.floor(tourT / 2.2) % step.tour.length;
      if (i !== tourI) {
        tourI = i;
        const [label, names] = step.tour[i];
        names.forEach((nm) => (geo.byName.get(nm) || []).forEach((m) => flash(m, FLASH, 2.1, 0.75)));
        const el = panel.querySelector('#px-tour');
        if (el) el.innerHTML = `<b>${esc(label.split(':')[0])}</b>${label.includes(':') ? ':' + esc(label.split(':').slice(1).join(':')) : ''}`;
        panel.querySelectorAll('.px-tour-list li').forEach((li, k) => li.classList.toggle('on', k === i));
      }
    }
    // gráfico (ECG o volumen pulmonar)
    if (proc.graph === 'wiggers') drawWiggers();
    else if (proc.graph) drawGraph(real, proc.graph === 'ecg' ? ecg(phase) : vol);
    // avance automático de los pasos (con una enfermedad activa se queda en su paso)
    if (playing && !dz) {
      stepT += real;
      const dur = stepDuration(step);
      const bar = panel.querySelector('.px-progress span');
      if (bar) bar.style.width = `${Math.min(100, (stepT / dur) * 100)}%`;
      if (stepT >= dur && stepIdx < proc.steps.length - 1) goStep(stepIdx + 1);
    }
  }
  const stepDuration = (s) => (s.tour ? s.tour.length * 2.2 + 2 : Math.max(9, (s.text.length + (s.dato?.length || 0)) / 16));

  // --- gráfico ----------------------------------------------------------------------------------
  function drawGraph(dt, v) {
    const cv = panel.querySelector('#px-graph');
    if (!cv) return;
    graphBuf.push([dt, v]);
    let tot = 0;
    for (let i = graphBuf.length - 1; i >= 0; i--) { tot += graphBuf[i][0]; if (tot > 4) { graphBuf = graphBuf.slice(i); break; } }
    const ctx = cv.getContext('2d'), w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = cv.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    ctx.strokeStyle = css.getPropertyValue('--border') || '#ccc';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += w / 16) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    ctx.strokeStyle = proc.graph === 'ecg' ? '#e11d48' : '#0ea5e9';
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.beginPath();
    let x = w;
    const lo = proc.graph === 'ecg' ? -0.35 : -0.1, hi = proc.graph === 'ecg' ? 1.1 : 1.1;
    for (let i = graphBuf.length - 1; i >= 0; i--) {
      const y = h - ((graphBuf[i][1] - lo) / (hi - lo)) * h;
      if (i === graphBuf.length - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      x -= (graphBuf[i][0] / 4) * w;
      if (x < 0) break;
    }
    ctx.stroke();
  }

  // un ciclo fijo de izquierda a derecha y una línea que marca el momento actual
  function drawWiggers() {
    const cv = panel.querySelector('#px-graph');
    if (!cv) return;
    const dpr = devicePixelRatio, ctx = cv.getContext('2d');
    const w = cv.width = cv.clientWidth * dpr, h = cv.height = cv.clientHeight * dpr;
    const W = wiggers(), css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted') || '#888', grid = css.getPropertyValue('--border') || '#ccc';
    const X = (φ) => 34 * dpr + φ * (w - 40 * dpr);
    const band = (y0, y1, lo, hi) => (v) => h * y1 - ((v - lo) / (hi - lo)) * h * (y1 - y0);
    const yE = band(0.03, 0.2, -0.35, 1.2), yP = band(0.27, 0.72, 0, 135), yV = band(0.79, 0.97, 40, 130);
    ctx.clearRect(0, 0, w, h);
    // sístole sombreada
    ctx.fillStyle = 'rgba(225, 29, 72, 0.08)';
    ctx.fillRect(X(W.s), 0, X(W.e) - X(W.s), h);
    ctx.font = `${10 * dpr}px Inter, sans-serif`;
    ctx.fillStyle = muted;
    ctx.fillText('Sístole', X(W.s) + 4 * dpr, h * 0.25);
    ctx.fillText('Diástole', X(Math.min(W.e + 0.1, 0.85)), h * 0.25);
    // S1 y S2
    ctx.strokeStyle = grid; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = dpr;
    for (const [x, l] of [[W.s, 'S1'], [W.e, 'S2']]) {
      ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke();
      ctx.fillText(l, X(x) + 3 * dpr, h * 0.77);
    }
    ctx.setLineDash([]);
    // etiquetas de bandas
    ctx.fillText('ECG', 2 * dpr, h * 0.13);
    ctx.fillText('mmHg', 2 * dpr, h * 0.5);
    ctx.fillText('ml', 2 * dpr, h * 0.9);
    const line = (f, y, color, width = 2) => {
      ctx.strokeStyle = color; ctx.lineWidth = width * dpr; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const φ = i / 200, py = y(f(φ)); if (i) ctx.lineTo(X(φ), py); else ctx.moveTo(X(φ), py); }
      ctx.stroke();
    };
    line((φ) => ecg(φ), yE, '#e11d48', 1.5);
    line(W.la, yP, '#6366f1');
    line(W.ao, yP, '#ef4444');
    line(W.lv, yP, '#14b8a6', 2.5);
    line(W.vol, yV, '#a855f7');
    // momento actual
    ctx.strokeStyle = css.getPropertyValue('--text') || '#000'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(X(phase), 0); ctx.lineTo(X(phase), h); ctx.stroke();
    for (const [f, y, c] of [[W.lv, yP, '#14b8a6'], [W.ao, yP, '#ef4444'], [W.vol, yV, '#a855f7']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(phase), y(f(phase)), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    const ef = panel.querySelector('#px-ef');
    if (ef) {
      const sv = W.EDV - W.ESV, txt = `Volumen sistólico (VS): <b>${sv} ml</b> · Fracción de eyección (FE): <b>${Math.round((sv / W.EDV) * 100)} %</b>${fx() === 'infarto' ? ' (disminuida)' : ''}`;
      if (ef.innerHTML !== txt) ef.innerHTML = txt;
    }
  }

  // --- cámara ----------------------------------------------------------------------------------
  function frameStep(step, instant = false) {
    const box = new THREE.Box3();
    if (step.focus === 'body' || !step.focus) box.copy(body.bodyBox);
    else if (step.focus === 'heart') box.copy(heart?.box || setupHeartBox());
    else if (step.focus === 'head') {
      for (const n of ['White matter of left cerebral hemisphere', 'White matter of right cerebral hemisphere', 'Cerebellum', 'Medulla oblongata'])
        (geo.byName.get(n) || []).forEach((m) => box.expandByObject(m));
    } else for (const n of step.focus) (geo.byName.get(n) || []).forEach((m) => box.expandByObject(m));
    if (box.isEmpty()) box.copy(body.bodyBox);
    viewer.fitTo(box, (DIRS[step.view] || DIRS.front).clone().normalize(), { margin: step.margin || 1.2, instant });
  }
  function setupHeartBox() {
    const box = new THREE.Box3();
    for (const n of ['Cavity of left ventricle', 'Cavity of right ventricle', 'Cavity of left atrium', 'Cavity of right atrium'])
      (geo.byName.get(n) || []).forEach((m) => box.expandByObject(m));
    return box.isEmpty() ? body.bodyBox : box;
  }

  // --- panel ------------------------------------------------------------------------------------
  function renderChips() {
    chipsEl.innerHTML = PROCESSES.map((p, i) =>
      `<button class="chip ${proc === p ? 'on' : ''}" data-proc="${i}"><span class="dot" style="background:${p.color}"></span>${esc(p.label)}</button>`).join('');
  }
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-proc]');
    if (b && body) open(Number(b.dataset.proc));
  });

  const procChips = (p) => `<div class="chips px-procs">${PROCESSES.map((q, i) => `<button class="chip ${q === p ? 'on' : ''}" data-proc="${i}"><span class="dot" style="background:${q.color}"></span>${esc(q.label)}</button>`).join('')}</div>`;
  const SOUND_ICO = '<svg class="ico" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>';

  function renderCases() {
    const c = proc.cases[caseIdx], ok = caseAns === c.answer;
    panel.innerHTML = `
      ${procChips(proc)}
      <p class="kicker"><i style="background:${proc.color}"></i>Practica</p>
      <h2>${esc(proc.title)}</h2>
      <p class="px-intro">${esc(proc.intro)}</p>
      <div class="px-case-head"><span>Caso ${caseIdx + 1} de ${proc.cases.length}</span><span>Aciertos: <b>${score[0]}</b> de ${score[1]}</span></div>
      <div class="px-case"><p class="who">${esc(c.who)}</p><p>${esc(c.story)}</p></div>
      <p class="px-q">${esc(c.q)}</p>
      <div class="px-opts">${c.options.map(([l], i) => `<button data-opt="${i}" class="${caseAns === null ? '' : i === c.answer ? 'ok' : i === caseAns ? 'bad' : 'dim'}" ${caseAns === null ? '' : 'disabled'}>${esc(l)}</button>`).join('')}</div>
      ${caseAns === null ? `<p class="px-hint">Elige una opción: se iluminará en el modelo.${c.view === 'front' || !c.view ? ' Vista de frente: la derecha del paciente está a tu izquierda.' : ''}</p>` : `
        <div class="px-fb ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓ ¡Correcto!' : `✗ No. Es: ${esc(c.options[c.answer][0])}`}</b><p>${esc(c.why)}</p></div>
        <div class="px-case-btns">
          ${c.see ? '<button class="btn ghost" data-see>▶ Ver la animación</button>' : ''}
          <button class="btn" data-next-case>${caseIdx < proc.cases.length - 1 ? 'Siguiente caso →' : 'Empezar de nuevo'}</button>
        </div>
        ${caseIdx === proc.cases.length - 1 ? `<p class="px-final">Terminaste: <b>${score[0]} de ${score[1]}</b> correctos.</p>${donateHtml('¿Te sirvieron estos casos? Ayúdame a agregar más.')}` : ''}`}`;
  }
  function goCase(i) {
    clearDisease();
    caseIdx = i; caseAns = null;
    if (i === 0) score = [0, 0];
    const c = proc.cases[i];
    frameStep({ focus: c.focus, view: c.view, margin: c.margin });
    renderCases();
    panel.scrollTo({ top: 0 });
  }
  function answerCase(i) {
    const c = proc.cases[caseIdx];
    if (caseAns !== null) return;
    caseAns = i;
    score = [score[0] + (i === c.answer ? 1 : 0), score[1] + 1];
    const paint = (names, color) => names.forEach((n) => (geo.byName.get(n) || []).forEach((m) => { mark(m, color, 0.8); flash(m, new THREE.Color(color), 1.6, 0.9); }));
    if (i !== c.answer) paint(c.options[i][1], '#ef4444');
    paint(c.options[c.answer][1], '#22c55e');
    renderCases();
    const fb = panel.querySelector('.px-opts');
    if (fb) panel.scrollTo({ top: fb.offsetTop - 12, behavior: 'smooth' });
  }

  function renderPanel() {
    const p = proc;
    if (p.cases) return renderCases();
    const dzRow = p.diseases ? `
      <div class="px-dz-row" role="group" aria-label="Normal o patológico">
        <button data-dz="" class="${dz ? '' : 'active'}">Normal</button>
        ${p.diseases.map((d) => `<button data-dz="${d.id}" class="${dz?.id === d.id ? 'active bad' : ''}">${esc(d.label)}</button>`).join('')}
      </div>
      ${dz ? `<div class="px-dz-card"><h3>🩺 ${esc(dz.label)}</h3>
        <p><b>Fisiopatología:</b> ${esc(dz.que)}</p><p><b>Clínica:</b> ${esc(dz.siente)}</p><p><b>Hallazgos clave:</b> ${esc(dz.fijate)}</p></div>` : ''}` : '';
    const graph = p.graph === 'wiggers'
      ? `<div class="px-graph tall"><canvas id="px-graph"></canvas></div>
         <div class="px-wleg"><span><i style="background:#ef4444"></i>Presión aórtica</span><span><i style="background:#14b8a6"></i>Presión del VI</span><span><i style="background:#6366f1"></i>Presión de la AI</span><span><i style="background:#a855f7"></i>Volumen del VI</span></div>
         <p class="px-ef" id="px-ef"></p>`
      : p.graph ? `<div class="px-graph"><canvas id="px-graph"></canvas><span>${p.graph === 'ecg' ? 'Electrocardiograma (ECG)' : 'Volumen pulmonar (volumen corriente)'}</span></div>` : '';
    panel.innerHTML = `
      ${procChips(p)}
      <p class="kicker"><i style="background:${p.color}"></i>Fisiología en movimiento</p>
      <h2>${esc(p.title)}</h2>
      <p class="px-intro">${esc(p.intro)}</p>
      ${dzRow}
      <div class="px-ctrl">
        <button class="round px-play" data-px="play" aria-label="${playing ? 'Pausar' : 'Reproducir'}">${playing ? '<svg class="ico" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>' : '<svg class="ico" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>'}</button>
        <button class="round" data-px="prev" aria-label="Paso anterior"><svg class="ico" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
        <span class="px-count"></span>
        <button class="round" data-px="next" aria-label="Paso siguiente"><svg class="ico" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
        ${p.sound ? `<button class="round ${soundOn ? 'on' : ''}" data-px="sound" aria-label="${soundOn ? 'Silenciar' : 'Escuchar los ruidos del corazón'}" title="Escuchar los ruidos cardíacos (R1 y R2)">${SOUND_ICO}</button>` : ''}
        <div class="px-speed" role="group" aria-label="Velocidad">${[0.5, 1, 2].map((v) => `<button data-speed="${v}" class="${v === speed ? 'active' : ''}">${String(v).replace('.', ',')}×</button>`).join('')}</div>
      </div>
      <div class="px-progress"><span></span></div>
      ${p.rate ? `<label class="px-rate"><span>${esc(p.rate.label)}</span><input type="range" min="${p.rate.min}" max="${p.rate.max}" value="${rate}" step="1"><b>${rate} ${esc(p.rate.unit)}</b></label>` : ''}
      ${graph}
      <div class="px-step" id="px-step"></div>
      <div class="px-legend">${p.legend.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>
      <div class="section-title">Pasos</div>
      <ol class="px-steps">${p.steps.map((s, i) => `<li><button data-step="${i}">${esc(s.t)}</button></li>`).join('')}</ol>
      <p class="px-note">Animación esquemática y en cámara lenta sobre los modelos de BodyParts3D. La médula espinal, los nervios del miembro superior y la silueta pulmonar están dibujados aparte porque no hay mallas abiertas de ellos.</p>`;
    renderStep();
  }
  function renderStep() {
    const s = proc.steps[stepIdx];
    const el = panel.querySelector('#px-step');
    if (!el) return;
    el.innerHTML = `<h3>${esc(s.t)}</h3><p>${esc(s.text)}</p>
      ${s.tour ? `<p class="px-tour" id="px-tour">&nbsp;</p><ul class="px-tour-list">${s.tour.map(([l]) => `<li>${esc(l.split(':')[0])}</li>`).join('')}</ul>` : ''}
      ${s.dato ? `<p class="dato">${esc(s.dato)}</p>` : ''}`;
    panel.querySelector('.px-count').textContent = `Paso ${stepIdx + 1} de ${proc.steps.length}`;
    panel.querySelectorAll('[data-step]').forEach((b) => b.classList.toggle('active', Number(b.dataset.step) === stepIdx));
    const bar = panel.querySelector('.px-progress span');
    if (bar) bar.style.width = '0%';
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !proc) return;
    if (b.dataset.proc !== undefined) { open(Number(b.dataset.proc)); return; }
    if (b.dataset.dz !== undefined) { setDisease(b.dataset.dz); return; }
    if (b.dataset.opt !== undefined) { answerCase(Number(b.dataset.opt)); return; }
    if (b.hasAttribute('data-next-case')) { goCase((caseIdx + 1) % proc.cases.length); return; }
    if (b.hasAttribute('data-see')) {
      const see = proc.cases[caseIdx].see, i = PROCESSES.findIndex((q) => q.id === see.proc);
      open(i);
      if (see.dz) setDisease(see.dz); else if (see.step !== undefined) goStep(see.step);
      return;
    }
    if (b.dataset.px === 'sound') {
      soundOn = !soundOn;
      if (soundOn) { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }
      b.classList.toggle('on', soundOn);
      b.setAttribute('aria-label', soundOn ? 'Silenciar' : 'Escuchar los ruidos del corazón');
      toast?.(soundOn ? '🔊 R1 (S1): cierre de mitral y tricúspide · R2 (S2): cierre de aórtica y pulmonar' : 'Sonido apagado', 3500);
      return;
    }
    if (b.dataset.px === 'play') { playing = !playing; renderPanel(); }
    if (b.dataset.px === 'prev') goStep(Math.max(0, stepIdx - 1));
    if (b.dataset.px === 'next') goStep(Math.min(proc.steps.length - 1, stepIdx + 1));
    if (b.dataset.step !== undefined) goStep(Number(b.dataset.step));
    if (b.dataset.speed) { speed = Number(b.dataset.speed); panel.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('active', x === b)); }
  });
  panel.addEventListener('input', (e) => {
    if (e.target.type !== 'range' || !proc?.rate) return;
    rate = Number(e.target.value);
    e.target.nextElementSibling.textContent = `${rate} ${proc.rate.unit}`;
  });

  function goStep(i) {
    stepIdx = i; stepT = 0; tourT = 0; tourI = -1;
    const s = proc.steps[i];
    visibleStreams = s.streams ? new Set(s.streams) : null;
    renderStep();
    frameStep(s);
    const el = panel.querySelector(dz ? '.px-dz-row' : '#px-step');
    if (el && (el.offsetTop < panel.scrollTop || el.offsetTop > panel.scrollTop + panel.clientHeight - 80)) panel.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  }

  // --- abrir / cerrar ----------------------------------------------------------------------------
  function teardown() {
    for (const mv of movers) mv.reset();
    movers = [];
    clearDisease();
    for (const o of extras) { root.remove(o); o.geometry.dispose(); o.material.dispose(); }
    extras = [];
    clearFlashes();
    heart = lungs = diaphragm = null;
    streams = [];
    particles.count = 0;
    if (snapshot) { body.restore(snapshot); snapshot = null; }
    viewer.requestRender();
  }
  function open(i) {
    if (!body) return;
    teardown();
    procIdx = i;
    proc = PROCESSES[i];
    if (!geos.has(body)) geos.set(body, createGeo(body));
    geo = geos.get(body);
    applyLayers(proc.layers);
    rate = proc.rate?.value ?? 72;
    phase = 0; breath = 0; graphBuf = [];
    heart = setupHeart();
    if (!proc.beat) { for (const mv of [...(heart?.atria || []), ...(heart?.vent || [])]) mv.reset(); }
    addExtras();
    buildStreams();
    renderChips();
    stepIdx = 0;
    if (proc.cases) { goCase(0); return; }
    renderPanel();
    goStep(0);
  }

  return {
    root,
    get active() { return !!disposeTick; },
    start(b, i = procIdx) {
      body = b;
      root.visible = true;
      panel.hidden = false;
      if (!disposeTick) disposeTick = viewer.addTicker(tick);
      body.allLoaded.then(() => { if (disposeTick && body === b) open(i); });
      renderChips();
    },
    stop() {
      if (disposeTick) { disposeTick(); disposeTick = null; }
      if (body) teardown();
      proc = null;
      root.visible = false;
      panel.hidden = true;
    },
  };
}
