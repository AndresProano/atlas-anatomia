// «Abrir órgano»: aísla un órgano del cuerpo y deja verlo entero, cortado a la mitad o con sus partes separadas
// (vista explotada), con etiquetas y la lista de sus partes.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const HEART_RE = /atri|ventric|valve|cusp|leaflet|papillary|chordae|septum|coronary|interventricular|cardiac vein|coronary sinus|conus|wall of/i;
const BRAIN_RE = /gyrus|lobe|lobule|cerebell|thalam|hypothal|ventricle|capsule|hippocamp|amygdal|putamen|pallid|caudate|corpus callosum|fornix|midbrain|pons|medulla oblongata|chiasm|optic tract|commissure|colliculus|geniculate|pineal|mammillary|septum of telencephalon|habenula|white matter|insula|lamina terminalis|aqueduct|choroid plexus|stria|tuber cinereum|peduncle|brachium|central canal/i;
const EYE_RE = /cornea|lens|iris|retina|sclera|choroid|vitreous|chamber|corona ciliaris/i;

// Órganos que se pueden abrir. hub = nombre en inglés del órgano detallado de HuBMAP (pestaña Órganos).
// internal = false → en este modelo es una sola pieza sin interior (mejor verlo en HuBMAP).
export const ORGANS = [
  { key: 'corazon', label: 'el corazón', icon: '🫀', hub: 'Heart', match: (p, m, x) => x.isHeart(m) },
  { key: 'encefalo', label: 'el encéfalo', icon: '🧠', hub: 'Brain', tint: true, match: (p) => p.system === 'nervioso' && BRAIN_RE.test(p.en) && !/thymus|liver|nerve|ganglion/i.test(p.en) },
  { key: 'ojo-izq', label: 'el ojo izquierdo', icon: '👁️', hub: 'Left eye', match: (p) => p.system === 'ojo_oido' && /left/i.test(p.en) && EYE_RE.test(p.en) },
  { key: 'ojo-der', label: 'el ojo derecho', icon: '👁️', hub: 'Right eye', match: (p) => p.system === 'ojo_oido' && /right/i.test(p.en) && EYE_RE.test(p.en) },
  { key: 'higado', label: 'el hígado y la vía biliar', icon: '🟤', hub: 'Liver', tint: true, match: (p) => p.system === 'digestivo' && /liver|hepat|biliary|gallbladder|cystic duct/i.test(p.en) },
  { key: 'pancreas', label: 'el páncreas', icon: '🟡', hub: 'Pancreas', match: (p) => p.system === 'digestivo' && /pancrea/i.test(p.en) },
  { key: 'pulmones', label: 'la vía aérea', icon: '🫁', hub: 'Lung', tint: true, match: (p) => p.system === 'respiratorio' },
  { key: 'rinon-izq', label: 'el riñón izquierdo', icon: '🫘', hub: 'Left kidney', internal: false, match: (p) => p.en === 'Left kidney' },
  { key: 'rinon-der', label: 'el riñón derecho', icon: '🫘', hub: 'Right kidney', internal: false, match: (p) => p.en === 'Right kidney' },
];

export function createOrganExplorer(viewer, { onClose } = {}) {
  let body = null, organ = null, parts = [], center = new V3(), radius = 1, box = new THREE.Box3();
  let snapshot = null, mode = 'whole', explodeT = 0, explodeTarget = 0, cutPos = 0.5, stopTick = null;
  const cache = new WeakMap(); // cuerpo → { centros, corazón }

  // --- utilidades por cuerpo ---------------------------------------------------------------------
  function ctx(b) {
    if (cache.has(b)) return cache.get(b);
    const centers = new Map();
    const centerOf = (m) => {
      if (!centers.has(m)) {
        const pos = m.geometry.attributes.position, c = new V3(), v = new V3(), step = Math.max(1, Math.floor(pos.count / 1500));
        let n = 0;
        for (let i = 0; i < pos.count; i += step) { c.add(v.fromBufferAttribute(pos, i).applyMatrix4(m.userData.baseMatrix || m.matrixWorld)); n++; }
        centers.set(m, c.divideScalar(Math.max(n, 1)));
      }
      return centers.get(m);
    };
    const H = b.bodyBox.max.y - b.bodyBox.min.y;
    let heartC = null;
    const isHeart = (m) => {
      const p = m.userData.part;
      if (p.system !== 'cardiovascular' || !HEART_RE.test(p.en)) return false;
      if (!heartC) {
        const cav = [...b.meshes.values()].filter((x) => /^Cavity of (left|right) (atrium|ventricle)$/.test(x.userData.part.en));
        heartC = cav.length ? cav.reduce((a, x) => a.add(centerOf(x)), new V3()).divideScalar(cav.length) : new V3(0, 1e9, 0);
      }
      return centerOf(m).distanceTo(heartC) < H * 0.08;
    };
    const c = { centerOf, isHeart, H };
    cache.set(b, c);
    return c;
  }
  // ¿a qué órgano pertenece esta pieza?
  function organFor(b, partId) {
    const m = b.meshes.get(partId);
    if (!m) return null;
    const x = ctx(b);
    return ORGANS.find((o) => o.match(m.userData.part, m, x)) || null;
  }
  function membersOf(b, o) {
    const x = ctx(b);
    return [...b.meshes.values()].filter((m) => o.match(m.userData.part, m, x));
  }

  // --- etiquetas 3D de las partes principales ---------------------------------------------------------
  const canvas = viewer.renderer.domElement;
  const layer = document.createElement('div');
  layer.className = 'ox-labels';
  layer.innerHTML = '<svg aria-hidden="true"></svg>';
  canvas.parentElement.appendChild(layer);
  const svg = layer.querySelector('svg');
  let labels = [];
  const clean = (s) => String(s || '').replace(/\s*\((izq|der)\.\)$/, '');
  function setLabels(list) {
    labels.forEach((l) => l.el.remove());
    labels = list.map(({ m, text }) => {
      const el = document.createElement('div');
      el.className = 'ox-label';
      el.textContent = text;
      layer.appendChild(el);
      return { m, el, w: 0, h: 0 };
    });
  }
  const _v = new V3(), _off = new V3();
  function placeLabels() {
    if (!labels.length) { svg.innerHTML = ''; return; }
    const W = canvas.clientWidth, Hh = canvas.clientHeight, sheet = document.querySelector('#sheet');
    const right = W >= 900 && sheet && !sheet.hidden ? W - sheet.offsetWidth - 40 : W - 12;
    const bottom = W < 900 && sheet && !sheet.hidden ? Hh - sheet.offsetHeight - 8 : Hh - 90;
    const pts = [];
    for (const l of labels) {
      _v.copy(ctx(body).centerOf(l.m)).add(offsetOf(l.m, _off)).project(viewer.camera);
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * Hh;
      const ok = _v.z < 1 && x > 4 && x < right && y > 60 && y < bottom;
      l.el.style.display = ok ? '' : 'none';
      if (!ok) continue;
      if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
      pts.push({ l, x, y, side: x < right / 2 ? -1 : 1 });
    }
    const lines = [];
    for (const side of [-1, 1]) {
      let last = 60;
      for (const p of pts.filter((q) => q.side === side).sort((a, b) => a.y - b.y)) {
        let ly = Math.min(Math.max(p.y - p.l.h / 2, last + 6), bottom - p.l.h);
        last = ly + p.l.h;
        let lx = side < 0 ? p.x - 70 - p.l.w : p.x + 70;
        lx = Math.max(6, Math.min(lx, right - p.l.w));
        p.l.el.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
        const ex = side < 0 ? lx + p.l.w : lx;
        lines.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${(ly + p.l.h / 2).toFixed(1)}"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"/>`);
      }
    }
    svg.innerHTML = lines.join('');
  }

  // --- vista explotada ----------------------------------------------------------------------------------
  // desplazamiento de cada parte: hacia afuera desde el centro del órgano, proporcional a su distancia
  function offsetOf(m, out) {
    if (!explodeT) return out.set(0, 0, 0);
    const c = ctx(body).centerOf(m);
    out.copy(c).sub(center);
    const d = out.length();
    if (d < radius * 0.04) out.set(0, 1, 0.4).normalize().multiplyScalar(radius * 0.35);
    else out.multiplyScalar(1.1).addScaledVector(out.clone().normalize(), radius * 0.25);
    return out.multiplyScalar(explodeT);
  }
  const _M = new THREE.Matrix4();
  function applyOffsets() {
    for (const m of parts) {
      offsetOf(m, _off);
      _M.makeTranslation(_off.x, _off.y, _off.z).multiply(m.userData.baseMatrix);
      m.userData.batch.setMatrixAt(m.userData.inst, _M);
      m.matrixWorld.copy(_M); // para que la selección y el contorno sigan a la pieza
    }
  }
  function tick(dt) {
    if (explodeT !== explodeTarget) {
      const k = Math.min(1, dt * 3.2);
      explodeT += (explodeTarget - explodeT) * k;
      if (Math.abs(explodeT - explodeTarget) < 0.002) explodeT = explodeTarget;
      applyOffsets();
      viewer.requestRender();
    } else if (explodeT > 0) applyOffsets(); // otras funciones pueden recalcular la posición de una pieza
    placeLabels();
  }

  // --- barra de herramientas ------------------------------------------------------------------------------
  const bar = document.createElement('div');
  bar.className = 'organ-bar-tools';
  bar.hidden = true;
  document.body.appendChild(bar);
  function renderBar() {
    const btn = (m, t) => `<button data-ox="${m}" class="${mode === m ? 'on' : ''}">${t}</button>`;
    bar.innerHTML = `
      <span class="ox-title">${organ.icon} ${organ.label.replace(/^(el|la|los|las) /, '')}</span>
      <div class="ox-modes">${btn('whole', 'Entero')}${organ.internal === false ? '' : btn('cut', 'Cortar a la mitad') + btn('explode', 'Separar partes')}</div>
      ${mode === 'cut' ? `<input type="range" min="0.15" max="0.85" step="0.01" value="${cutPos}" aria-label="Posición del corte">` : ''}
      <button class="ox-close" data-ox="close" aria-label="Cerrar">✕</button>`;
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ox]');
    if (!b) return;
    if (b.dataset.ox === 'close') return close();
    setMode(b.dataset.ox);
  });
  bar.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    cutPos = Number(e.target.value);
    viewer.setClip('coronal', cutPos, false, box);
  });

  function setMode(m) {
    mode = m;
    explodeTarget = m === 'explode' ? 1 : 0;
    // corte coronal: se quita la mitad anterior para ver el interior desde adelante
    viewer.setClip(m === 'cut' ? 'coronal' : 'none', cutPos, false, box);
    const dir = new V3(0.15, 0.1, 1).normalize();
    if (m === 'explode') viewer.fitTo(box.clone().expandByScalar(radius * 1.25), dir, { margin: 1.15 });
    else viewer.fitTo(box, dir, { margin: 1.6 });
    renderBar();
    viewer.requestRender();
  }

  function open(b, o) {
    if (organ) close(true);
    body = b; organ = o;
    parts = membersOf(b, o);
    if (!parts.length) return false;
    snapshot = body.snapshot();
    for (const m of parts) m.userData.baseMatrix = m.matrixWorld.clone();
    box = new THREE.Box3();
    parts.forEach((m) => box.expandByObject(m));
    center = box.getCenter(new V3());
    radius = box.getSize(new V3()).length() / 2;
    // solo el órgano, sólido
    const systems = new Set(parts.map((m) => m.userData.part.system));
    for (const s of body.order) body.state.sysVisible[s] = systems.has(s);
    body.state.hidden = new Set();
    body.state.isolated = new Set(parts.map((m) => m.userData.part.id));
    for (const s of systems) body.setSystemOpacity(s, 1);
    explodeT = 0; explodeTarget = 0; mode = 'whole'; cutPos = 0.5;
    viewer.fitTo(box, new V3(0.15, 0.1, 1).normalize(), { margin: 1.6 });
    // colores distintos por parte (encéfalo, hígado, vía aérea): si no, todo es del mismo color y no se distingue
    if (o.tint) {
      const hues = new Map();
      for (const m of parts) {
        const t = clean(m.userData.part.es || m.userData.part.en).replace(/\s+(izquierd[oa]|derech[oa])$/i, '');
        if (!hues.has(t)) hues.set(t, (hues.size * 0.618034) % 1);
        m.userData.origColor = m.userData.color;
        m.userData.color = new THREE.Color().setHSL(hues.get(t), 0.55, 0.62);
        m.userData.batch.setColorAt(m.userData.inst, m.userData.color);
      }
    }
    // etiquetas: las partes más grandes con nombre distinto
    const seen = new Set();
    const big = [...parts].sort((a, b2) => (b2.userData.part.vol || 0) - (a.userData.part.vol || 0)).filter((m) => {
      const t = clean(m.userData.part.es || m.userData.part.en);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    }).slice(0, 7);
    setLabels(big.map((m) => ({ m, text: clean(m.userData.part.es || m.userData.part.en) })));
    bar.hidden = false;
    document.body.classList.add('organ-open');
    renderBar();
    stopTick = viewer.addTicker(tick);
    return true;
  }

  function close(silent) {
    if (!organ) return;
    stopTick?.(); stopTick = null;
    explodeT = 0;
    for (const m of parts) {
      m.userData.batch.setMatrixAt(m.userData.inst, m.userData.baseMatrix);
      m.matrixWorld.copy(m.userData.baseMatrix);
      if (m.userData.origColor) {
        m.userData.color = m.userData.origColor;
        delete m.userData.origColor;
        if (body.state.selected !== m.userData.part.id) m.userData.batch.setColorAt(m.userData.inst, m.userData.color);
      }
    }
    setLabels([]); svg.innerHTML = '';
    if (snapshot) body.restore(snapshot);
    viewer.setClip('none', 0.5, false, body.bodyBox);
    snapshot = null; organ = null; parts = [];
    bar.hidden = true;
    document.body.classList.remove('organ-open');
    viewer.requestRender();
    if (!silent) onClose?.();
  }

  // lista de partes del órgano abierto (nombres distintos, de mayor a menor)
  function partList() {
    const groups = new Map();
    for (const m of parts) {
      const t = clean(m.userData.part.es || m.userData.part.en);
      if (!groups.has(t)) groups.set(t, { text: t, id: m.userData.part.id, vol: 0 });
      groups.get(t).vol += m.userData.part.vol || 0;
    }
    return [...groups.values()].sort((a, b) => b.vol - a.vol);
  }

  return {
    ORGANS,
    organFor,
    open,
    close,
    setMode,
    partList,
    get organ() { return organ; },
    get isOpen() { return !!organ; },
    has: (id) => !!organ && parts.some((m) => m.userData.part.id === id),
  };
}
