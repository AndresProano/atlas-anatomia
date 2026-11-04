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
};
const VEIN_COLOR = '#3f63ad';
const HEART_COLOR = '#a83a3a';
const LOAD_ORDER = ['esqueletico', 'muscular', 'digestivo', 'respiratorio', 'cardiovascular', 'nervioso',
  'urogenital', 'endocrino', 'articular', 'ojo_oido', 'otros', 'piel'];

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

export async function createBody(viewer, { onProgress, onSystemLoaded } = {}) {
  const [catalog, models] = await Promise.all([
    fetch('data/parts.json').then((r) => r.json()),
    fetch('data/models.json').then((r) => r.json()),
  ]);
  const byId = new Map(catalog.parts.map((p) => [p.id, p]));
  const root = new THREE.Group();
  root.name = 'body';
  viewer.scene.add(root);

  const state = {
    sysVisible: Object.fromEntries(LOAD_ORDER.map((s) => [s, s !== 'piel'])),
    sysOpacity: Object.fromEntries(LOAD_ORDER.map((s) => [s, s === 'piel' ? 0.35 : 1])),
    hidden: new Set(),
    isolated: null, // Set de ids o null
    selected: null,
    loaded: new Set(),
  };
  const meshes = new Map(); // id -> Mesh
  const materials = {}; // sistema -> [materiales]

  function makeMaterial(system, color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
    viewer.registerMaterial(m);
    (materials[system] ??= []).push(m);
    return m;
  }
  const highlight = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ff9f1c', emissiveIntensity: 0.45, roughness: 0.5, side: THREE.DoubleSide });
  viewer.registerMaterial(highlight);

  function applyOpacity(system) {
    const op = state.sysOpacity[system];
    for (const m of materials[system] || []) {
      m.opacity = op;
      m.transparent = op < 0.999;
      m.depthWrite = op >= 0.999;
      m.needsUpdate = true;
    }
  }

  function refresh() {
    for (const [id, mesh] of meshes) {
      const p = mesh.userData.part;
      mesh.visible = state.sysVisible[p.system] && !state.hidden.has(id) && (!state.isolated || state.isolated.has(id));
      // los transparentes se dibujan después
      mesh.renderOrder = state.sysOpacity[p.system] < 1 ? 1 : 0;
    }
    viewer.requestRender();
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const total = LOAD_ORDER.reduce((a, s) => a + (models[s]?.bytes || 0), 0);
  const done = {};

  async function loadSystem(system) {
    const info = models[system];
    if (!info) return;
    const gltf = await loader.loadAsync(info.file, (e) => {
      done[system] = e.loaded;
      onProgress?.(Object.values(done).reduce((a, b) => a + b, 0) / total, system);
    });
    done[system] = info.bytes;
    const base = makeMaterial(system, SYSTEM_COLORS[system]);
    const vein = system === 'cardiovascular' ? makeMaterial(system, VEIN_COLOR) : null;
    const heart = system === 'cardiovascular' ? makeMaterial(system, HEART_COLOR) : null;
    const group = gltf.scene;
    group.name = system;
    const list = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      const id = o.name.replace(/_\d+$/, '');
      const p = byId.get(id);
      if (!p) return;
      o.geometry.computeVertexNormals();
      o.userData.part = p;
      let mat = base;
      if (vein && /vein|venous|vena\b|sinus|tributary/i.test(p.en)) mat = vein;
      else if (heart && /atri|ventric|valve|cusp|leaflet|papillary|myocard|heart|chordae|septum/i.test(p.en)) mat = heart;
      o.material = mat;
      o.userData.baseMaterial = mat;
      meshes.set(id, o);
      list.push(o);
    });
    root.add(group);
    applyOpacity(system);
    state.loaded.add(system);
    refresh();
    onSystemLoaded?.(system, list.length);
    viewer.buildTreesIdle(list);
  }

  // esqueleto primero, el resto en paralelo de a dos
  await loadSystem(LOAD_ORDER[0]);
  const bodyBox = new THREE.Box3().setFromObject(root);
  const queue = LOAD_ORDER.slice(1);
  const workers = [0, 1].map(async () => { while (queue.length) await loadSystem(queue.shift()); });
  const allLoaded = Promise.all(workers).then(() => bodyBox.setFromObject(root));

  // --- API -----------------------------------------------------------------
  function select(id) {
    if (state.selected) {
      const prev = meshes.get(state.selected);
      if (prev) prev.material = prev.userData.baseMaterial;
    }
    state.selected = id && meshes.has(id) ? id : null;
    if (state.selected) meshes.get(state.selected).material = highlight;
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

  return {
    root, catalog, byId, meshes, state, systems: catalog.systems, order: LOAD_ORDER, models,
    bodyBox, allLoaded, select, focus, reveal, hide, isolate, showAll, setSystemVisible, setSystemOpacity,
    applyPreset, search, visibleMeshes, meshBox,
  };
}
