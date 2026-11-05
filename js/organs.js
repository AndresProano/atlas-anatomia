// Órganos en detalle: HuBMAP Human Reference Atlas (CC BY 4.0), cargados desde cdn.humanatlas.io.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VIEWS } from './scene.js?v=60749a66';

const SIDE = { l: 'izquierdo', r: 'derecho', left: 'izquierdo', right: 'derecho' };

// "VH_F_renal_pyramid_L_c" -> { key: "renal pyramid", side: "l" }
export function parseNodeName(raw) {
  let s = (raw || '').replace(/^(VH|Allen|SBU|NIH|SBU_[A-Z])_?[FM]?_/i, '').replace(/^[FM]_/, '');
  s = s.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  let side = null;
  s = s.replace(/\b(L|R)\b(\s+[a-z]{1,2})?$/i, (_, lr) => { side = lr.toLowerCase(); return ''; }).trim();
  s = s.replace(/\s+[a-z]$/i, '').replace(/\s+\d+$/, '').trim();
  const m = s.match(/^(left|right)\s+(.*)$/i);
  if (m) { side = side || m[1].toLowerCase()[0]; s = m[2]; }
  return { key: s.toLowerCase(), side };
}

export function createOrgans(viewer, terms, { onProgress, onLoaded, onError } = {}) {
  const root = new THREE.Group();
  root.name = 'organs';
  root.visible = false;
  viewer.scene.add(root);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map(); // id -> { scene, groups }
  let current = null, token = 0;
  const highlight = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ff9f1c', emissiveIntensity: 0.45, side: THREE.DoubleSide });
  viewer.registerMaterial(highlight);
  let selectedKey = null;

  function translate(key, side) {
    const t = terms[key] || terms[key.replace(/ of the /, ' of ')] || terms[key + ' muscle'];
    let es = t ? t[0] : null;
    const label = es || key.charAt(0).toUpperCase() + key.slice(1);
    return { es, label: side ? `${label} (${side === 'l' ? 'izq.' : 'der.'})` : label, la: t?.[1] || null };
  }

  async function show(organ) {
    const my = ++token;
    if (current) current.scene.visible = false;
    selectedKey = null;
    let entry = cache.get(organ.id);
    if (!entry) {
      const gltf = await loader.loadAsync(organ.url, (e) => onProgress?.(e.total ? e.loaded / e.total : e.loaded / (organ.bytes || 1)));
      const groups = new Map(); // key+side -> { label, meshes[] }
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        // nombre útil: el del nodo o el de su padre
        const raw = o.name && !/^mesh|primitive/i.test(o.name) ? o.name : o.parent?.name || o.name;
        const { key, side } = parseNodeName(raw);
        if (!key) return;
        const gk = `${key}|${side || ''}`;
        if (!groups.has(gk)) groups.set(gk, { gk, key, side, ...translate(key, side), meshes: [] });
        groups.get(gk).meshes.push(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.side = THREE.DoubleSide; viewer.registerMaterial(m); });
        o.userData.baseMaterial = o.material;
        o.userData.group = gk;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      });
      // normalizar escala: el órgano mide ~1 unidad, centrado en el origen
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const center = box.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group();
      gltf.scene.position.sub(center);
      wrap.add(gltf.scene);
      wrap.scale.setScalar(1 / size);
      entry = { scene: wrap, groups, meshes: [] };
      for (const g of groups.values()) entry.meshes.push(...g.meshes);
      cache.set(organ.id, entry);
      root.add(wrap);
    }
    if (my !== token) { entry.scene.visible = false; return null; }
    entry.scene.visible = true;
    current = entry;
    for (const m of entry.meshes) m.visible = true;
    viewer.fitTo(new THREE.Box3().setFromObject(entry.scene), VIEWS.front, { instant: true, margin: 1.1 });
    viewer.buildTreesIdle(entry.meshes);
    viewer.requestRender();
    onLoaded?.(organ, entry);
    return entry;
  }

  function select(gk) {
    if (!current) return null;
    for (const m of current.meshes) m.material = m.userData.baseMaterial;
    selectedKey = gk && current.groups.has(gk) ? gk : null;
    if (selectedKey) for (const m of current.groups.get(selectedKey).meshes) m.material = highlight;
    viewer.requestRender();
    return selectedKey ? current.groups.get(selectedKey) : null;
  }
  function setGroupVisible(gk, v) {
    const g = current?.groups.get(gk);
    if (g) g.meshes.forEach((m) => { m.visible = v; });
    viewer.requestRender();
  }
  function isolate(gk) {
    if (!current) return;
    for (const [k, g] of current.groups) g.meshes.forEach((m) => { m.visible = k === gk; });
    viewer.requestRender();
  }
  function showAll() { current?.meshes.forEach((m) => { m.visible = true; }); viewer.requestRender(); }
  function focus(gk) {
    const g = current?.groups.get(gk);
    if (!g) return;
    const box = new THREE.Box3();
    g.meshes.forEach((m) => box.expandByObject(m));
    viewer.fitTo(box, null, { margin: 2 });
  }
  function frame(dir) {
    if (current) viewer.fitTo(new THREE.Box3().setFromObject(current.scene), dir, { margin: 1.1 });
  }

  return {
    root, show, select, setGroupVisible, isolate, showAll, focus, frame,
    get current() { return current; }, get selectedKey() { return selectedKey; },
    meshes: () => current?.meshes || [],
    onError,
  };
}
