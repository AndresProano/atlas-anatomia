// Motor 3D compartido: renderer, cámara, luces, corte y selección (raycast acelerado con BVH).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const VIEWS = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(1, 0, 0),   // lado izquierdo del paciente = +X
  right: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0.0001),
};

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
  const softwareGpu = /basic render|swiftshader|llvmpipe|software/i.test(gpuName);
  // resolución: completa en reposo, reducida mientras se rota
  const fullDpr = Math.min(window.devicePixelRatio, softwareGpu ? 1 : 1.5);
  const moveDpr = softwareGpu ? 0.5 : Math.min(1, fullDpr);
  renderer.setPixelRatio(fullDpr);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  camera.position.set(0, 1, 4);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6359, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(0.6, 0.8, 1);
  camera.add(key); // la luz principal sigue a la cámara
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(-1, 0.5, -1);
  scene.add(rim);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;

  let dirty = true;
  const requestRender = () => { dirty = true; };
  controls.addEventListener('change', requestRender);
  let restoreTimer = null;
  controls.addEventListener('start', () => { clearTimeout(restoreTimer); if (renderer.getPixelRatio() !== moveDpr) { renderer.setPixelRatio(moveDpr); resize(); } });
  controls.addEventListener('end', () => { restoreTimer = setTimeout(() => { renderer.setPixelRatio(fullDpr); resize(); }, 250); });

  function resize() {
    const el = canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  (function loop() {
    requestAnimationFrame(loop);
    const moved = controls.update();
    if (dirty || moved) {
      dirty = false;
      renderer.render(scene, camera);
    }
  })();

  // --- encuadre -------------------------------------------------------
  let anim = null;
  function fitTo(box, dir, { margin = 1.25, instant = false } = {}) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.005);
    const d = (dir ? dir.clone() : camera.position.clone().sub(controls.target)).normalize();
    // tamaño aparente visto desde la dirección d: alto = eje Y, ancho = el horizontal perpendicular
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const h = Math.abs(d.y) > 0.9 ? size.z : size.y;
    const w = Math.abs(d.x) > Math.abs(d.z) ? size.z : size.x;
    const depth = Math.abs(d.x) > Math.abs(d.z) ? size.x : (Math.abs(d.y) > 0.9 ? size.y : size.z);
    const dist = Math.max(h / 2 / tan, w / 2 / (tan * camera.aspect), 0.01) * margin + depth / 2;
    const toPos = center.clone().addScaledVector(d, dist);
    camera.near = Math.max(dist / 200, 0.0005);
    camera.far = dist * 50 + radius * 10;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.05;
    controls.maxDistance = dist * 6;
    const fromPos = camera.position.clone(), fromT = controls.target.clone();
    if (instant) {
      camera.position.copy(toPos); controls.target.copy(center); controls.update(); requestRender(); return;
    }
    const t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = (t) => {
      const k = Math.min((t - t0) / 450, 1), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(fromPos, toPos, e);
      controls.target.lerpVectors(fromT, center, e);
      controls.update(); requestRender();
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // --- corte -------------------------------------------------------------
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const clipState = { active: false, axis: 'none', pos: 0.5, flip: false, bounds: new THREE.Box3() };
  const clippedMaterials = new Set();
  function registerMaterial(m) {
    clippedMaterials.add(m);
    m.clippingPlanes = clipState.active ? [clipPlane] : [];
  }
  function setClip(axis, pos, flip, bounds) {
    Object.assign(clipState, { axis, pos, flip, active: axis !== 'none' });
    if (bounds) clipState.bounds.copy(bounds);
    if (clipState.active) {
      const i = { sagital: 'x', coronal: 'z', axial: 'y' }[axis];
      const b = clipState.bounds;
      const v = THREE.MathUtils.lerp(b.min[i], b.max[i], pos);
      const n = new THREE.Vector3(); n[i] = flip ? 1 : -1;
      clipPlane.normal.copy(n);
      clipPlane.constant = flip ? -v : v;
    }
    for (const m of clippedMaterials) m.clippingPlanes = clipState.active ? [clipPlane] : [];
    requestRender();
  }

  // --- selección -----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;
  const ndc = new THREE.Vector2();
  const sphere = new THREE.Sphere();
  function pick(clientX, clientY, meshes, { buildTrees = true } = {}) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const candidates = [];
    for (const m of meshes) {
      if (!m.visible || !isShown(m)) continue;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      sphere.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      if (!raycaster.ray.intersectsSphere(sphere)) continue;
      if (!m.geometry.boundsTree) {
        if (!buildTrees) continue;
        m.geometry.computeBoundsTree();
      }
      candidates.push(m);
    }
    const hits = raycaster.intersectObjects(candidates, false);
    for (const h of hits) {
      if (clipState.active && clipPlane.distanceToPoint(h.point) < 0) continue;
      const op = h.object.material.opacity ?? 1;
      if (op < 0.15) continue; // atravesar capas casi invisibles
      return h;
    }
    return null;
  }
  function isShown(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  // construir BVH en segundo plano para que el hover sea rápido
  function buildTreesIdle(meshes) {
    // tandas de ~8 ms para no congelar la página
    const queue = [...meshes];
    const work = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 8) {
        const m = queue.shift();
        if (m.geometry && !m.geometry.boundsTree) m.geometry.computeBoundsTree();
      }
      if (queue.length) setTimeout(work, 30);
    };
    setTimeout(work, 300);
  }

  return { gpuName, softwareGpu, THREE, renderer, scene, camera, controls, requestRender, fitTo, pick, setClip, clipState, registerMaterial, buildTreesIdle };
}
