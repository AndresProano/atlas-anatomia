// Cuerpo completo: BodyParts3D (DBCLS, CC BY-SA 2.1 JP), un GLB por sistema.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const SYSTEM_COLORS = {
  esqueletico: '#e6dcc6',
  muscular: '#93302a',
  articular: '#8fbfc4',
  cardiovascular: '#c43b33', // arterias; las venas usan VEIN_COLOR
  nervioso: '#e2bf45',
  respiratorio: '#e7a2a6',
  digestivo: '#d79a69',
  urogenital: '#c4875a',
  endocrino: '#8d6bb4',
  ojo_oido: '#c9d3d8',
  piel: '#e2b79d',
  otros: '#9f8dc0',
  reproductor: '#d9849f',
};
const VEIN_COLOR = '#3f63ad';
const HEART_COLOR = '#a83a3a';
const LOAD_ORDER = ['esqueletico', 'muscular', 'digestivo', 'respiratorio', 'cardiovascular', 'nervioso',
  'urogenital', 'reproductor', 'endocrino', 'articular', 'ojo_oido', 'otros', 'piel'];


// --- músculo realista ------------------------------------------------------------------------
// Textura procedural de fibras (relieve + albedo), tileable. Las fibras corren a lo largo de "u".
function fiberTextures() {
  const N = 256, h = new Float32Array(N * N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * Math.PI * 2, fy = (y / N) * Math.PI * 2;
      // haces de fibras (varían a lo ancho, "y") con leve ondulación a lo largo ("x")
      const w = fy + 0.04 * Math.sin(fx * 2 + ph[0]) + 0.02 * Math.sin(fx * 3 + ph[1]);
      let v = 0.55 * Math.sin(w * 18 + ph[2]) + 0.3 * Math.sin(w * 41 + ph[3]) + 0.15 * Math.sin(w * 7 + ph[4]);
      v = Math.sign(v) * Math.pow(Math.abs(v), 0.7);
      h[y * N + x] = v + 0.08 * Math.sin(fx * 9 + fy * 3 + ph[5]);
    }
  }
  const nrm = document.createElement('canvas'), alb = document.createElement('canvas');
  nrm.width = nrm.height = alb.width = alb.height = N;
  const ni = nrm.getContext('2d').createImageData(N, N), ai = alb.getContext('2d').createImageData(N, N);
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 1.2, dy = (H(x, y + 1) - H(x, y - 1)) * 1.2;
      const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      ni.data[i] = (-dx / l * 0.5 + 0.5) * 255; ni.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
      const a = 228 + 27 * (H(x, y) * 0.5 + 0.5);
      ai.data[i] = a; ai.data[i + 1] = a * 0.97; ai.data[i + 2] = a * 0.97; ai.data[i + 3] = 255;
    }
  }
  nrm.getContext('2d').putImageData(ni, 0, 0); alb.getContext('2d').putImageData(ai, 0, 0);
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { normal: mk(nrm, false), albedo: mk(alb, true) };
}
let _fibers = null;
function muscleMaterial(color) {
  _fibers ??= fiberTextures();
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.48, metalness: 0, side: THREE.DoubleSide,
    map: _fibers.albedo, normalMap: _fibers.normal, normalScale: new THREE.Vector2(0.3, 0.3),
    clearcoat: 0.35, clearcoatRoughness: 0.32, // película húmeda de la fascia
    sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9a8a'),
  });
  // tendones/aponeurosis: los extremos de cada músculo se aclaran hacia blanco nacarado
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tendon;\nvarying float vTendon;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTendon = tendon;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTendon;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.84, 0.76), vTendon);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, vTendon);');
  };
  m.customProgramCacheKey = () => 'muscle-v2';
  return m;
}
// UV a lo largo del eje principal (dirección de las fibras) + atributo "tendon" para los extremos.
const _pv = new THREE.Vector3();
function addMuscleAttributes(geo, matrixWorld) {
  const pos = geo.attributes.position, n = pos.count;
  const P = new Float32Array(n * 3);
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) { _pv.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld); P.set([_pv.x, _pv.y, _pv.z], i * 3); c.add(_pv); }
  c.divideScalar(Math.max(n, 1));
  // covarianza -> eje principal por iteración de potencias
  const C = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (let i = 0; i < n; i++) {
    const x = P[i * 3] - c.x, y = P[i * 3 + 1] - c.y, z = P[i * 3 + 2] - c.z;
    C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z;
  }
  const mul = (v) => new THREE.Vector3(C[0] * v.x + C[1] * v.y + C[2] * v.z, C[1] * v.x + C[3] * v.y + C[4] * v.z, C[2] * v.x + C[4] * v.y + C[5] * v.z);
  let a1 = new THREE.Vector3(0.3, 1, 0.2).normalize();
  for (let k = 0; k < 24; k++) a1 = mul(a1).normalize();
  const helper = Math.abs(a1.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const a2 = new THREE.Vector3().crossVectors(a1, helper).normalize();
  const a3 = new THREE.Vector3().crossVectors(a1, a2).normalize();
  let tMin = Infinity, tMax = -Infinity, wMax = 0;
  const T = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    _pv.set(P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z);
    const t = _pv.dot(a1), q2 = _pv.dot(a2), q3 = _pv.dot(a3);
    T[i] = t; V[i] = q2 + q3;
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); wMax = Math.max(wMax, Math.hypot(q2, q3));
  }
  const len = Math.max(tMax - tMin, 1e-6), elong = len / Math.max(wMax * 2, 1e-6);
  const uv = new Float32Array(n * 2), tendon = new Float32Array(n);
  const FIBER_LEN = 0.08, FIBER_TILE = 0.02; // metros por repetición de textura (a lo largo / a lo ancho)
  for (let i = 0; i < n; i++) {
    uv[i * 2] = T[i] / FIBER_LEN;
    uv[i * 2 + 1] = V[i] / FIBER_TILE;
    if (elong > 2.2) {
      const e = Math.min(T[i] - tMin, tMax - T[i]) / len; // 0 en los extremos
      const x = THREE.MathUtils.clamp(1 - e / 0.09, 0, 1);
      tendon[i] = x * x * (3 - 2 * x) * 0.85;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('tendon', new THREE.BufferAttribute(tendon, 1));
}

export const PRESETS = {
  todo: { show: LOAD_ORDER.filter((s) => s !== 'piel') },
  esqueleto: { show: ['esqueletico', 'articular'] },
  musculos: { show: ['esqueletico', 'articular', 'muscular'] },
  organos: { show: ['esqueletico', 'digestivo', 'respiratorio', 'urogenital', 'endocrino', 'otros', 'cardiovascular'], opacity: { esqueletico: 0.25 } },
  vasos: { show: ['esqueletico', 'cardiovascular'], opacity: { esqueletico: 0.25 } },
  nervios: { show: ['esqueletico', 'nervioso', 'ojo_oido'], opacity: { esqueletico: 0.25 } },
};

export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const displayName = (p) => p.es || p.en;

// dataset: cuerpo masculino (BodyParts3D) o femenino (HuBMAP united-female)
export async function createBody(viewer, { onProgress, onSystemLoaded, dataset = { parts: 'parts.json', models: 'models.json' } } = {}) {
  const [catalog, models] = await Promise.all([
    fetch(`data/${dataset.parts}?v=${window.ATLAS_V || ''}`).then((r) => r.json()),
    fetch(`data/${dataset.models}?v=${window.ATLAS_V || ''}`).then((r) => r.json()),
  ]);
  const female = !!catalog.female;
  const byId = new Map(catalog.parts.map((p) => [p.id, p]));
  const root = new THREE.Group();
  root.name = 'body';
  viewer.scene.add(root);

  const state = {
    // en el cuerpo femenino la piel se ve como silueta transparente (no hay músculos que la reemplacen)
    sysVisible: Object.fromEntries(LOAD_ORDER.map((s) => [s, female || s !== 'piel'])),
    sysOpacity: Object.fromEntries(LOAD_ORDER.map((s) => [s, s === 'piel' ? (female ? 0.22 : 0.35) : 1])),
    hidden: new Set(),
    isolated: null, // Set de ids o null
    selected: null,
    loaded: new Set(),
  };
  const meshes = new Map(); // id -> Mesh
  let outline = null; // contorno de la selección
  const materials = {}; // sistema -> [materiales]

  function makeMaterial(system, color) {
    const m = system === 'muscular' ? muscleMaterial(color)
      : new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
    viewer.registerMaterial(m);
    (materials[system] ??= []).push(m);
    return m;
  }
  const HIGHLIGHT = new THREE.Color('#ffb020');

  function applyOpacity(system) {
    const op = state.sysOpacity[system];
    for (const m of materials[system] || []) {
      m.opacity = op;
      m.transparent = op < 0.999;
      m.depthWrite = op >= 0.999;
      m.needsUpdate = true;
    }
  }

  // Cada pieza es un Mesh "lógico" (fuera de la escena) que sirve para seleccionar con BVH;
  // lo que se dibuja es un BatchedMesh por sistema: ~12 llamadas de dibujo en vez de ~2.200.
  function refresh() {
    for (const [id, mesh] of meshes) {
      const p = mesh.userData.part;
      const v = state.sysVisible[p.system] && !state.hidden.has(id) && (!state.isolated || state.isolated.has(id));
      mesh.visible = v;
      mesh.userData.batch.setVisibleAt(mesh.userData.inst, v);
    }
    if (outline) outline.visible = !!meshes.get(state.selected)?.visible;
    for (const b of batches) b.renderOrder = state.sysOpacity[b.userData.system] < 1 ? 1 : 0; // transparentes al final
    viewer.requestRender();
  }

  // geometría cuantizada (Int16/Int8 normalizados) -> Float32, para que todas encajen en el lote
  function toFloat(g) {
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const a = g.attributes[name];
      const arr = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i); }
      out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
    return out;
  }
  const batches = [];
  function buildBatch(system, material, list) {
    let verts = 0, idx = 0;
    const geos = list.map((m) => {
      const g = toFloat(m.geometry);
      if (system === 'muscular') addMuscleAttributes(g, m.matrixWorld);
      verts += g.attributes.position.count; idx += g.index.count; return g;
    });
    const batch = new THREE.BatchedMesh(list.length, verts, idx, material);
    batch.userData.system = system;
    list.forEach((m, i) => {
      const inst = batch.addInstance(batch.addGeometry(geos[i]));
      batch.setMatrixAt(inst, m.matrixWorld);
      batch.setColorAt(inst, m.userData.color);
      m.userData.batch = batch;
      m.userData.inst = inst;
    });
    batches.push(batch);
    root.add(batch);
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const pendingTrees = [];
  const total = LOAD_ORDER.reduce((a, s) => a + (models[s]?.bytes || 0), 0);
  const done = {};

  async function loadSystem(system) {
    const info = models[system];
    if (!info) return;
    const gltf = await loader.loadAsync(`${info.file}?v=${window.ATLAS_V || ''}`, (e) => {
      done[system] = e.loaded;
      onProgress?.(Object.values(done).reduce((a, b) => a + b, 0) / total, system);
    });
    done[system] = info.bytes;
    // un material por sistema (blanco: el color real va por instancia)
    const material = makeMaterial(system, '#ffffff');
    const group = gltf.scene;
    group.updateMatrixWorld(true);
    const list = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      const id = o.name.replace(/_\d+$/, '');
      const p = byId.get(id);
      if (!p) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.userData.part = p;
      let color = SYSTEM_COLORS[system];
      if (system === 'cardiovascular') {
        if (/vein|venous|vena\b|sinus|tributary/i.test(p.en)) color = VEIN_COLOR;
        else if (/atri|ventric|valve|cusp|leaflet|papillary|myocard|heart|chordae|septum/i.test(p.en)) color = HEART_COLOR;
      }
      o.userData.color = new THREE.Color(color);
      if (system === 'muscular') { // cada músculo con un tono ligeramente distinto: se distinguen mejor
        let hsh = 0; for (const ch of id) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
        const r1 = ((hsh >>> 0) % 1000) / 1000, r2 = ((hsh >>> 10) % 1000) / 1000;
        o.userData.color.offsetHSL((r1 - 0.5) * 0.025, (r2 - 0.5) * 0.12, (r1 - 0.5) * 0.06);
      }
      o.material = material; // solo para leer la opacidad al seleccionar
      meshes.set(id, o);
      list.push(o);
    });
    buildBatch(system, material, list);
    applyOpacity(system);
    state.loaded.add(system);
    refresh();
    onSystemLoaded?.(system, list.length);
    pendingTrees.push(...list);
  }

  // esqueleto primero, el resto en paralelo de a dos
  await loadSystem(LOAD_ORDER[0]);
  const bodyBox = new THREE.Box3();
  const fitBody = () => { bodyBox.makeEmpty(); for (const m of meshes.values()) bodyBox.expandByObject(m); };
  fitBody();
  const queue = LOAD_ORDER.slice(1);
  const workers = [0, 1].map(async () => { while (queue.length) await loadSystem(queue.shift()); });
  const allLoaded = Promise.all(workers).then(() => {
    fitBody();
    viewer.buildTreesIdle(pendingTrees); // BVH para hover/clic, en tandas cortas
  });

  // contorno de la pieza seleccionada: "casco invertido" inflado en espacio de mundo,
  // con grosor proporcional a la distancia de la cámara (se ve igual de fino con cualquier zoom)
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: 0.003 }, color: { value: new THREE.Color('#0d9488') } },
    vertexShader: `uniform float thickness;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 wn = normalize(mat3(modelMatrix) * normal);
        float d = length(cameraPosition - wp.xyz);
        wp.xyz += wn * thickness * d;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
    side: THREE.BackSide,
    // empujar el contorno hacia atrás para que no se cruce con la superficie de la pieza
    polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6,
  });
  function setOutline(m) {
    if (outline) { root.remove(outline); outline = null; }
    if (!m) return;
    outline = new THREE.Mesh(m.geometry, outlineMat);
    outline.matrixAutoUpdate = false;
    outline.matrix.copy(m.matrixWorld);
    outline.raycast = () => {};
    outline.renderOrder = 2;
    root.add(outline);
  }

  // --- API -----------------------------------------------------------------
  function select(id) {
    if (state.selected) {
      const prev = meshes.get(state.selected);
      if (prev) prev.userData.batch.setColorAt(prev.userData.inst, prev.userData.color);
    }
    state.selected = id && meshes.has(id) ? id : null;
    if (state.selected) {
      const m = meshes.get(state.selected);
      m.userData.batch.setColorAt(m.userData.inst, HIGHLIGHT);
    }
    setOutline(state.selected ? meshes.get(state.selected) : null);
    setOverlay(state.selected); // la selección se ve aunque otra estructura la tape
    viewer.requestRender();
    return state.selected ? byId.get(state.selected) : null;
  }
  function meshBox(id) {
    const m = meshes.get(id);
    return m ? new THREE.Box3().setFromObject(m) : new THREE.Box3();
  }
  // mirar la pieza desde el lado del cuerpo en el que está (frente, espalda, costado)
  function focus(id, margin = 2.2) {
    const box = meshBox(id);
    const c = box.getCenter(new THREE.Vector3());
    const axis = bodyBox.getCenter(new THREE.Vector3());
    const out = new THREE.Vector3(c.x - axis.x, 0, c.z - axis.z);
    let dir = null;
    if (out.length() > 0.04) {
      out.normalize();
      dir = new THREE.Vector3(out.x * 0.8, 0.25, out.z * 0.8 + (out.z >= -0.3 ? 0.35 : 0)).normalize();
    }
    viewer.fitTo(box, dir, { margin });
  }
  function reveal(id) {
    const p = byId.get(id);
    if (!p) return;
    state.sysVisible[p.system] = true;
    state.hidden.delete(id);
    if (state.isolated && !state.isolated.has(id)) state.isolated = null;
    refresh();
  }
  function hide(id) { state.hidden.add(id); if (state.selected === id) select(null); refresh(); }
  function isolate(id) { state.isolated = new Set([id]); refresh(); }
  function showAll() { state.hidden.clear(); state.isolated = null; refresh(); }
  function setSystemVisible(s, v) { state.sysVisible[s] = v; refresh(); }
  function setSystemOpacity(s, op) { state.sysOpacity[s] = op; applyOpacity(s); refresh(); }
  function applyPreset(name) {
    const pr = PRESETS[name];
    for (const s of LOAD_ORDER) {
      state.sysVisible[s] = pr.show.includes(s);
      state.sysOpacity[s] = pr.opacity?.[s] ?? (s === 'piel' ? 0.35 : 1);
      applyOpacity(s);
    }
    state.isolated = null;
    refresh();
  }

  // búsqueda por español, inglés, latín (sin tildes)
  const index = catalog.parts.map((p) => ({ p, text: norm([p.es, p.en, p.la].filter(Boolean).join(' | ')) }));
  function search(q, limit = 30) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const res = [];
    for (const it of index) {
      if (toks.every((t) => it.text.includes(t))) {
        const starts = norm(displayName(it.p)).startsWith(toks[0]) ? 0 : 1;
        res.push([starts, displayName(it.p).length, it.p]);
      }
    }
    res.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return res.slice(0, limit).map((r) => r[2]);
  }

  function visibleMeshes() { return [...meshes.values()].filter((m) => m.visible); }

  // pulso de color sobre la pieza seleccionada (para que se encuentre a simple vista)
  let pulseTimer = null;
  function pulse(id, ms = 1600) {
    clearInterval(pulseTimer);
    const m = meshes.get(id);
    if (!m) return;
    const a = HIGHLIGHT, b = new THREE.Color('#fff3c4'), tmp = new THREE.Color();
    const t0 = performance.now();
    pulseTimer = setInterval(() => {
      const t = performance.now() - t0;
      if (t > ms || state.selected !== id) {
        clearInterval(pulseTimer);
        if (state.selected === id) m.userData.batch.setColorAt(m.userData.inst, HIGHLIGHT);
        viewer.requestRender();
        return;
      }
      m.userData.batch.setColorAt(m.userData.inst, tmp.copy(a).lerp(b, (Math.sin(t / 120) + 1) / 2));
      viewer.requestRender();
    }, 40);
  }

  // resaltado "rayos X": copia de la pieza dibujada encima de todo (se ve aunque esté al fondo)
  const overlayMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  viewer.registerMaterial(overlayMat);
  let overlay = null;
  function setOverlay(id) {
    if (overlay) { root.remove(overlay); overlay = null; }
    const m = id && meshes.get(id);
    if (m) {
      overlay = new THREE.Mesh(m.geometry, overlayMat);
      overlay.matrixAutoUpdate = false;
      overlay.matrix.copy(m.matrixWorld);
      overlay.renderOrder = 999;
      overlay.raycast = () => {}; // no interfiere con la selección
      root.add(overlay);
    }
    viewer.requestRender();
  }

  function frameAll() { viewer.fitTo(bodyBox, new THREE.Vector3(0, 0.08, 1).normalize(), { margin: 1.05 }); }

  // guardar / restaurar capas (el quiz cambia la vista y luego la devuelve como estaba)
  function snapshot() {
    return {
      sysVisible: { ...state.sysVisible }, sysOpacity: { ...state.sysOpacity },
      hidden: new Set(state.hidden), isolated: state.isolated ? new Set(state.isolated) : null,
    };
  }
  function restore(s) {
    Object.assign(state.sysVisible, s.sysVisible);
    Object.assign(state.sysOpacity, s.sysOpacity);
    state.hidden = new Set(s.hidden);
    state.isolated = s.isolated ? new Set(s.isolated) : null;
    for (const sys of LOAD_ORDER) applyOpacity(sys);
    refresh();
  }

  return {
    root, catalog, byId, meshes, state, systems: catalog.systems, order: LOAD_ORDER, models, female,
    bodyBox, allLoaded, select, focus, reveal, hide, isolate, showAll, setSystemVisible, setSystemOpacity,
    applyPreset, search, visibleMeshes, meshBox, pulse, snapshot, restore, setOverlay, frameAll,
  };
}
