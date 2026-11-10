// Motor 3D compartido: renderer, cámara, luces, corte y selección (raycast acelerado con BVH).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
  // aspecto realista: tono cinematográfico + reflejos suaves de estudio (iluminación basada en imagen)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  camera.position.set(0, 1, 4);
  scene.add(camera);

  if (!softwareGpu) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6359, softwareGpu ? 1.3 : 0.75));
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
  controls.zoomToCursor = true; // la rueda del ratón acerca hacia donde apunta el cursor
  // Modo de navegación: 'pan' (mano, arrastra el cuerpo) o 'rotate' (gira alrededor del cuerpo).
  // El clic derecho / Shift+arrastre siempre hace lo contrario del modo activo.
  const ROT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" stroke="white" stroke-width="5"/><path d="M21 4v5h-5" stroke="white" stroke-width="5"/><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>')}") 12 12, move`;
  let navMode = 'rotate';
  const idleCursor = () => (navMode === 'pan' ? 'grab' : ROT_CURSOR);
  function setNavMode(m) {
    navMode = m === 'pan' ? 'pan' : 'rotate';
    const pan = navMode === 'pan';
    controls.mouseButtons = { LEFT: pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    controls.touches = { ONE: pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    canvas.style.cursor = idleCursor();
  }
  setNavMode('rotate');
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const panning = (navMode === 'pan') !== (e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey);
    canvas.style.cursor = panning ? 'grabbing' : ROT_CURSOR;
  });
  window.addEventListener('pointerup', () => { canvas.style.cursor = idleCursor(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Giro por pasos (flechas en modo girar): rota la cámara alrededor del objetivo.
  const _sph = new THREE.Spherical(), _off = new THREE.Vector3();
  function orbitBy(dAz, dPol) {
    _off.copy(camera.position).sub(controls.target);
    _sph.setFromVector3(_off);
    _sph.theta += dAz;
    _sph.phi = THREE.MathUtils.clamp(_sph.phi + dPol, 0.01, Math.PI - 0.01);
    camera.position.copy(controls.target).add(_off.setFromSpherical(_sph));
    camera.lookAt(controls.target);
    controls.update();
    requestRender();
  }
  // Flechas genéricas: mueven o giran según el modo.
  const nudge = (dx, dy) => (navMode === 'pan' ? panBy(dx, dy) : orbitBy(-dx * 0.12, dy * 0.12));

  // Desplazamiento con flechas: mueve cámara y objetivo juntos, proporcional a la distancia.
  const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _delta = new THREE.Vector3();
  function panBy(dx, dy) {
    const dist = camera.position.distanceTo(controls.target);
    const step = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.15;
    _right.setFromMatrixColumn(camera.matrix, 0);
    _up.setFromMatrixColumn(camera.matrix, 1);
    _delta.copy(_right).multiplyScalar(dx * step).addScaledVector(_up, dy * step);
    camera.position.add(_delta);
    controls.target.add(_delta);
    controls.update();
    requestRender();
  }
  // Zoom por pasos (botones +/−): acerca o aleja la cámara hacia el objetivo, respetando los límites.
  function zoomBy(factor) {
    const off = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(off.setLength(d));
    controls.update();
    requestRender();
  }
  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, select, textarea')) return;
    if (e.key === '+' || e.key === '=') { zoomBy(0.85); return; }
    if (e.key === '-' || e.key === '_') { zoomBy(1 / 0.85); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const m = e.shiftKey ? 3 : 1;
    nudge(d[0] * m, d[1] * m);
  });

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

  // animaciones continuas (fisiología): cada función recibe dt en segundos y fuerza el redibujo
  const tickers = new Set();
  let lastT = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    for (const f of tickers) f(dt, now / 1000);
    const moved = controls.update();
    if (dirty || moved || tickers.size) {
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
      if (op < 0.6 && h.object.userData.part?.system === 'piel') continue; // la silueta de piel no tapa los clics
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

  const addTicker = (f) => { tickers.add(f); return () => tickers.delete(f); };

  return { addTicker, gpuName, softwareGpu, THREE, renderer, scene, camera, controls, requestRender, panBy, orbitBy, nudge, zoomBy, setNavMode, get navMode() { return navMode; }, fitTo, pick, setClip, clipState, registerMaterial, buildTreesIdle };
}
