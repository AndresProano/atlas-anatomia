// Cuerpo completo: BodyParts3D (DBCLS, CC BY-SA 2.1 JP), un GLB por sistema.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const SYSTEM_COLORS = {
  esqueletico: '#e6dcc6',
  muscular: '#b4544b',
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
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
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
    const geos = list.map((m) => { const g = toFloat(m.geometry); verts += g.attributes.position.count; idx += g.index.count; return g; });
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
    applyPreset, search, visibleMeshes, meshBox, pulse, snapshot, restore, setOverlay,
  };
}
