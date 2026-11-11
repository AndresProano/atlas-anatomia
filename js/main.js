// Interfaz tipo app: visor a pantalla completa, buscador flotante, capas en chips,
// ficha como hoja inferior (móvil) o tarjeta lateral (escritorio) y barra de pestañas.
import { createViewer, VIEWS } from './scene.js?v=da0ca425';
import { createBody, SYSTEM_COLORS, displayName } from './body.js?v=da0ca425';
import { createOrgans } from './organs.js?v=da0ca425';
import { createProfiles } from './profiles.js?v=da0ca425';
import { loadClinica } from './clinica.js?v=da0ca425';
import { createSync } from './sync.js?v=da0ca425';
import { createQuiz } from './quiz.js?v=da0ca425';
import { renderSources } from './sources.js?v=da0ca425';
import { wikiFor } from './wiki.js?v=da0ca425';
import { createPhysio } from './physio.js?v=da0ca425';
import { setupLaunch, afterNotice, physioCta, physioSeen, markPhysioSeen } from './launch.js?v=da0ca425';
import { createOrganExplorer } from './organ-open.js?v=da0ca425';

const $ = (s) => document.querySelector(s);
const V = window.ATLAS_V || '';
const isMobile = () => matchMedia('(max-width: 899px)').matches;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  focus: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>',
  isolate: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  hide: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6A17 17 0 0 0 2 12s3.5 6 10 6a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  xray: '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 7v10M9 9h6M9 12h6M9 15h6"/></svg>',
};
const SYSTEM_SHORT = {
  reproductor: 'Aparato reproductor', esqueletico: 'Hueso', articular: 'Articulación', muscular: 'Músculo', cardiovascular: 'Corazón y vasos',
  nervioso: 'Sistema nervioso', respiratorio: 'Sistema respiratorio', digestivo: 'Sistema digestivo',
  urogenital: 'Sistema urogenital', endocrino: 'Sistema endocrino', ojo_oido: 'Órganos de los sentidos', piel: 'Piel', otros: 'Órgano',
};
const LAYERS = [
  { key: 'huesos', label: 'Huesos', color: SYSTEM_COLORS.esqueletico, systems: ['esqueletico', 'articular'] },
  { key: 'musculos', label: 'Músculos', color: SYSTEM_COLORS.muscular, systems: ['muscular'] },
  { key: 'organos', label: 'Órganos', color: SYSTEM_COLORS.digestivo, systems: ['digestivo', 'respiratorio', 'urogenital', 'endocrino', 'otros'] },
  { key: 'vasos', label: 'Vasos', color: SYSTEM_COLORS.cardiovascular, systems: ['cardiovascular'] },
  { key: 'nervios', label: 'Nervios', color: SYSTEM_COLORS.nervioso, systems: ['nervioso', 'ojo_oido'] },
  { key: 'reproductor', label: 'Reproductor', color: SYSTEM_COLORS.reproductor, systems: ['reproductor'] },
  { key: 'piel', label: 'Piel', color: SYSTEM_COLORS.piel, systems: ['piel'] },
];

const canvas = $('#canvas');
const viewer = createViewer(canvas);
let mode = 'body';
let organs = null;
let clinica = null; // base clínica, se carga más abajo

// --- tema ---------------------------------------------------------------
if (store.get('atlas-theme')) document.documentElement.dataset.theme = store.get('atlas-theme');
$('#theme-btn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  store.set('atlas-theme', document.documentElement.dataset.theme);
});

// --- carga y avisos ---------------------------------------------------------
const loaderEl = $('#loader');
function progress(f, text) {
  loaderEl.classList.remove('done');
  $('#loader-bar').style.width = `${Math.round(Math.min(f, 1) * 100)}%`;
  $('#loader-text').textContent = text;
}
const loaderDone = () => loaderEl.classList.add('done');
let toastTimer = null;
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// --- cuerpo ---------------------------------------------------------------------
let body = null;
let firstDone = false;
body = await createBody(viewer, {
  onProgress: (f) => progress(f, `Cargando el cuerpo… ${Math.round(f * 100)}%`),
  onSystemLoaded: () => {
    if (!body) return;
    renderLayers();
    const left = body.order.filter((x) => body.models[x] && !body.state.loaded.has(x)).length;
    if (!left && !firstDone) {
      firstDone = true;
      loaderDone();
      if (viewer.softwareGpu && store.get('atlas-gpu-warn') !== 'off') {
        store.set('atlas-gpu-warn', 'off');
        toast('Tu navegador no usa la tarjeta gráfica: activa la aceleración de hardware para que vaya fluido.', 6000);
      } else {
        // primera visita: primero el aviso educativo; después, la invitación a Fisiología o la pista
        afterNotice(() => {
          if (mode !== 'body') return;
          if (physioCta(() => setMode('physio'))) return;
          if (!store.get('atlas-hint')) { store.set('atlas-hint', '1'); toast('Toca una estructura para ver su ficha'); }
        });
      }
    }
  },
}).catch((e) => { progress(0, 'No se pudieron cargar los modelos: ' + e.message); throw e; });
viewer.fitTo(body.bodyBox, VIEWS.front, { instant: true });

// --- capas (chips) --------------------------------------------------------------
let xray = false;
const layersEl = $('#layers');
const layerOn = (l) => l.systems.some((s) => body.state.sysVisible[s]);
function setLayer(l, on) { l.systems.forEach((s) => body.setSystemVisible(s, on)); }
function setXray(on) {
  xray = on;
  body.setSystemOpacity('muscular', on ? 0.18 : 1);
  body.setSystemOpacity('piel', on ? 0.08 : (body.female ? 0.22 : 0.35));
  renderLayers();
}
function renderLayers() {
  const has = (l) => l.systems.some((s) => body.models[s]);
  layersEl.innerHTML = LAYERS.filter(has).map((l) =>
    `<button class="chip ${layerOn(l) ? '' : 'off'}" data-layer="${l.key}" aria-pressed="${layerOn(l)}"><span class="dot" style="background:${l.color}"></span>${l.label}</button>`).join('')
    + `<button class="chip ${xray ? 'on' : ''}" data-xray aria-pressed="${xray}">${ICON.xray}Rayos X</button>`;
}
layersEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (explorer?.isOpen) explorer.close(true);
  if (b.hasAttribute('data-xray')) return setXray(!xray);
  const l = LAYERS.find((x) => x.key === b.dataset.layer);
  setLayer(l, !layerOn(l));
  renderLayers();
});
renderLayers();
// si la estructura está tapada por músculos o piel, activar rayos X
function seeThrough(p) {
  if (p.system !== 'muscular' && p.system !== 'piel' && body.state.sysVisible.muscular && !xray) setXray(true);
}

// --- ficha --------------------------------------------------------------------------
const sheet = $('#sheet'), sheetBody = $('#sheet-body');
let sheetTarget = null;
function openSheet(html, target) {
  sheetTarget = target;
  sheetBody.innerHTML = html;
  sheet.hidden = false;
  sheet.classList.remove('expanded');
  sheet.scrollTop = 0;
  layout();
}
function closeSheet() {
  sheet.hidden = true;
  sheetTarget = null;
  layout();
}
$('#sheet-close').addEventListener('click', () => {
  if (mode === 'body') body.select(null);
  if (mode === 'organs') organs.select(null);
  closeSheet();
});
$('#sheet-handle').addEventListener('click', () => sheet.classList.toggle('expanded'));

function actionsHtml() {
  return `<div class="actions">
    <button class="act" data-act="focus">${ICON.focus}Centrar</button>
    <button class="act" data-act="isolate">${ICON.isolate}Aislar</button>
    <button class="act" data-act="hide">${ICON.hide}Ocultar</button>
  </div>`;
}
function descHtml() {
  return '<div class="section-title">Descripción</div><div class="desc" id="desc"><div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div></div>';
}
function fillDesc(es, en, target) {
  wikiFor({ es, en }).then((w) => {
    const d = $('#desc');
    if (!d || sheetTarget !== target) return;
    if (!w) { d.innerHTML = '<p class="note">No hay una descripción disponible para esta estructura.</p>'; return; }
    d.innerHTML = `${w.thumb ? `<img src="${esc(w.thumb)}" alt="" loading="lazy">` : ''}<p>${esc(w.extract)}</p>
      <a class="more" href="${esc(w.url)}" target="_blank" rel="noopener">Leer más en Wikipedia${w.lang === 'en' ? ' (inglés)' : ''} →</a>`;
  });
}
// bloque clínico de la ficha (si la estructura está en la base)
function clinicaHtml(name) {
  const ctx = clinica && clinica.forContext(name.replace(/\s*\((izq|der)\.\)/, ''));
  if (!ctx) return '';
  const e = ctx.entry;
  return `<div class="clin">
    ${ctx.parent ? `<p class="sub">Es parte de: <b>${esc(e.nombres[0])}</b></p>` : ''}
    <div class="section-title">Función${ctx.parent ? ` · ${esc(e.nombres[0])}` : ''}</div><p>${esc(e.funcion)}</p>
    ${e.dato ? `<p class="dato">${esc(e.dato)}</p>` : ''}
    <div class="section-title">Enfermedades frecuentes</div>
    <ul class="dz">${e.enfermedades.map((d) => `<li><b>${esc(d.nombre)}</b>: ${esc(d.nota)}</li>`).join('')}</ul>
  </div>`;
}
// «Abrir órgano»: botón en la ficha o, si ya está abierto, la lista de sus partes
let explorer = null;
const hubOrgan = (o) => o.hub && (hubmap.find((h) => h.en === o.hub && h.sex === bodySex) || hubmap.find((h) => h.en === o.hub));
function organHtml(p) {
  if (!explorer || mode !== 'body') return '';
  const o = explorer.organFor(body, p.id);
  if (!o) return '';
  const hub = hubOrgan(o);
  const short = o.label.replace(/^(el|la) /, '');
  if (explorer.isOpen && explorer.has(p.id)) {
    const list = explorer.partList();
    return `<div class="open-organ">
      <div class="section-title">Partes ${esc(('de ' + o.label).replace(/^de el /, 'del '))} (${list.length}) · toca una</div>
      <div class="parts">${list.map((x) => `<button data-part="${x.id}" class="${x.id === p.id ? 'active' : ''}">${esc(x.text)}</button>`).join('')}</div>
      ${hub ? `<button class="btn ghost" data-hub="${hub.id}">🔬 Ver ${esc(short)} en detalle (HuBMAP)</button>` : ''}
    </div>`;
  }
  return `<div class="open-organ">
    ${o.internal === false ? '' : `<button class="btn" data-open-organ="${o.key}">${o.icon} Abrir ${esc(o.label)}</button>`}
    ${hub ? `<button class="btn ${o.internal === false ? '' : 'ghost'}" data-hub="${hub.id}">🔬 Ver ${esc(short)} ${o.internal === false ? 'por dentro' : 'en detalle'}</button>` : ''}
    ${o.internal === false ? '<p class="note">En el modelo del cuerpo este órgano es una sola pieza; el detallado muestra su interior.</p>' : ''}
  </div>`;
}
function showPart(p) {
  if (!p) return closeSheet();
  const target = { kind: 'body', id: p.id };
  openSheet(`
    <p class="kicker"><i style="background:${SYSTEM_COLORS[p.system]}"></i>${SYSTEM_SHORT[p.system] || ''}</p>
    <h2>${esc(displayName(p))}</h2>
    <p class="latin">${esc(p.la || p.en)}</p>
    ${organHtml(p)}
    ${actionsHtml()}
    ${clinicaHtml(displayName(p))}
    ${descHtml()}`, target);
  fillDesc(p.es, p.en, target);
}
sheetBody.addEventListener('click', (e) => {
  const openKey = e.target.closest('[data-open-organ]')?.dataset.openOrgan;
  if (openKey && sheetTarget?.kind === 'body') {
    const id = sheetTarget.id;
    if (explorer.open(body, explorer.ORGANS.find((o) => o.key === openKey))) { body.select(id); showPart(body.byId.get(id)); updateShowAll(); }
    return;
  }
  const partId = e.target.closest('[data-part]')?.dataset.part;
  if (partId) return selectBody(partId);
  const hubId = e.target.closest('[data-hub]')?.dataset.hub;
  if (hubId) {
    const entry = hubmap.find((h) => h.id === hubId);
    if (explorer.isOpen) explorer.close(true);
    sex = entry.sex;
    document.querySelectorAll('#sex-filter button').forEach((x) => x.classList.toggle('active', x.dataset.sex === sex));
    setMode('organs', { skipDefault: true });
    openOrgan(entry);
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const part = e.target.closest('[data-gk]')?.dataset.gk;
  if (part !== undefined) return selectOrganPart(part, true);
  if (!act || !sheetTarget) return;
  if (sheetTarget.kind === 'body') {
    const id = sheetTarget.id;
    if (act === 'focus') body.focus(id);
    if (act === 'isolate') { body.isolate(id); body.focus(id); }
    if (act === 'hide') { body.hide(id); closeSheet(); toast('Estructura oculta'); }
  } else if (sheetTarget.kind === 'organ-part') {
    const gk = sheetTarget.gk;
    if (act === 'focus') organs.focus(gk);
    if (act === 'isolate') organs.isolate(gk);
    if (act === 'hide') { organs.setGroupVisible(gk, false); organs.select(null); showOrganSummary(); }
  } else if (sheetTarget.kind === 'organ') {
    if (act === 'focus') organs.frame(VIEWS.front);
  }
  updateShowAll();
});
function selectBody(id, { focus = false } = {}) {
  const p = body.select(id);
  if (p && focus) body.focus(id);
  showPart(p);
  updateShowAll();
}

// --- mostrar todo / vistas / corte -------------------------------------------------------
const showAllBtn = $('#show-all');
function updateShowAll() {
  const hiddenSomething = mode === 'organs'
    ? organs?.current?.meshes.some((m) => !m.visible)
    : body.state.hidden.size > 0 || !!body.state.isolated;
  showAllBtn.hidden = !hiddenSomething;
}
showAllBtn.addEventListener('click', () => {
  if (explorer?.isOpen) explorer.close(true);
  if (mode === 'organs') organs.showAll(); else body.showAll();
  updateShowAll();
});
const VIEW_CYCLE = [['front', 'Vista anterior'], ['left', 'Vista lateral izquierda'], ['back', 'Vista posterior'], ['right', 'Vista lateral derecha']];
let viewIdx = 0;
$('#view-btn').addEventListener('click', () => {
  viewIdx = (viewIdx + 1) % VIEW_CYCLE.length;
  const [v, label] = VIEW_CYCLE[viewIdx];
  if (mode === 'organs') organs.frame(VIEWS[v]); else viewer.fitTo(body.bodyBox, VIEWS[v]);
  toast(label, 1400);
});
const clipPop = $('#clip-pop'), clipBtn = $('#clip-btn'), clipPos = $('#clip-pos');
let clipAxis = 'none';
function updateClip() {
  const box = mode === 'organs' && organs?.current ? new viewer.THREE.Box3().setFromObject(organs.current.scene) : body.bodyBox;
  const active = mode === 'body' || mode === 'organs' ? clipAxis : 'none';
  viewer.setClip(active, Number(clipPos.value), false, box);
  clipBtn.classList.toggle('on', clipAxis !== 'none');
  clipPop.querySelectorAll('[data-axis]').forEach((b) => b.classList.toggle('active', b.dataset.axis === clipAxis));
}
clipBtn.addEventListener('click', () => {
  clipPop.hidden = !clipPop.hidden;
  if (!clipPop.hidden && clipAxis === 'none') { clipAxis = 'sagital'; updateClip(); }
});
clipPop.addEventListener('click', (e) => {
  const b = e.target.closest('[data-axis]');
  if (b) { clipAxis = b.dataset.axis; updateClip(); }
});
clipPos.addEventListener('input', updateClip);
$('#clip-off').addEventListener('click', () => { clipAxis = 'none'; clipPop.hidden = true; updateClip(); });
body.allLoaded.then(updateClip);

// --- búsqueda ------------------------------------------------------------------------------
const searchEl = $('#search'), resultsEl = $('#search-results'), clearBtn = $('#search-clear');
let results = [], cursor = 0;
function renderResults() {
  const q = searchEl.value.trim();
  clearBtn.hidden = !q;
  if (!q) { resultsEl.hidden = true; return; }
  resultsEl.hidden = false;
  resultsEl.innerHTML = results.length
    ? results.map((p, i) => `<li data-id="${p.id}" class="${i === cursor ? 'sel' : ''}"><span class="dot" style="background:${SYSTEM_COLORS[p.system]}"></span><span>${esc(displayName(p))}${p.la ? `<small>${esc(p.la)}</small>` : ''}</span></li>`).join('')
    : '<li class="empty">Sin resultados</li>';
}
function pickResult(p) {
  if (!p) return;
  resultsEl.hidden = true;
  searchEl.value = displayName(p);
  searchEl.blur();
  body.reveal(p.id);
  seeThrough(p);
  renderLayers();
  selectBody(p.id, { focus: true });
}
searchEl.addEventListener('input', () => { results = body.search(searchEl.value, 20); cursor = 0; renderResults(); });
searchEl.addEventListener('focus', () => { if (searchEl.value) renderResults(); });
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, results.length - 1); renderResults(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); renderResults(); e.preventDefault(); }
  if (e.key === 'Enter') pickResult(results[cursor]);
  if (e.key === 'Escape') { resultsEl.hidden = true; searchEl.blur(); }
});
resultsEl.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) { e.preventDefault(); pickResult(body.byId.get(li.dataset.id)); }
});
searchEl.addEventListener('blur', () => setTimeout(() => { resultsEl.hidden = true; }, 150));
clearBtn.addEventListener('click', () => { searchEl.value = ''; results = []; renderResults(); searchEl.focus(); });

// --- órganos HuBMAP ------------------------------------------------------------------------
const [hubmap, terms] = await Promise.all([
  fetch(`data/hubmap.json?v=${V}`).then((r) => r.json()),
  fetch(`data/terms.json?v=${V}`).then((r) => r.json()),
]);
organs = createOrgans(viewer, terms, {
  onProgress: (f) => progress(f, `Descargando órgano… ${Math.round(Math.min(f, 1) * 100)}%`),
});
let sex = 'F', currentOrgan = null;
const organChips = $('#organ-chips');
function renderOrganChips() {
  const list = hubmap.filter((o) => o.sex === sex);
  organChips.innerHTML = list.map((o) =>
    `<button class="chip ${currentOrgan?.id === o.id ? 'on' : ''}" data-id="${o.id}">${esc(o.es)}</button>`).join('');
  organChips.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
$('#sex-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sex]');
  if (!b) return;
  sex = b.dataset.sex;
  document.querySelectorAll('#sex-filter button').forEach((x) => x.classList.toggle('active', x === b));
  // abrir el mismo órgano en el otro sexo si existe
  const same = currentOrgan && hubmap.find((o) => o.es === currentOrgan.es && o.sex === sex);
  renderOrganChips();
  if (same) openOrgan(same);
});
organChips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) openOrgan(hubmap.find((o) => o.id === b.dataset.id));
});
async function openOrgan(organ) {
  if (!organ) return;
  currentOrgan = organ;
  renderOrganChips();
  openSheet(`<p class="kicker"><i style="background:var(--accent)"></i>Órgano · HuBMAP</p><h2>${esc(organ.es)}</h2><p class="latin">Descargando…</p>`, { kind: 'loading' });
  try {
    const entry = await organs.show(organ);
    loaderDone();
    if (entry && currentOrgan === organ) { showOrganSummary(); updateClip(); updateShowAll(); }
  } catch (err) {
    loaderDone();
    openSheet(`<h2>${esc(organ.es)}</h2><p class="latin">No se pudo descargar. Revisa tu conexión.</p>`, { kind: 'error' });
  }
}
function showOrganSummary() {
  const entry = organs.current;
  if (!entry || !currentOrgan) return;
  const groups = [...entry.groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const target = { kind: 'organ', id: currentOrgan.id };
  openSheet(`
    <p class="kicker"><i style="background:var(--accent)"></i>Órgano ${currentOrgan.sex === 'F' ? 'femenino' : 'masculino'}</p>
    <h2>${esc(currentOrgan.es)}</h2>
    <p class="latin">${esc(terms[currentOrgan.en.toLowerCase()]?.[1] || currentOrgan.en)}</p>
    <div class="section-title">Partes · toca una</div>
    <div class="parts">${groups.map((g) => `<button data-gk="${esc(g.gk)}">${esc(g.label)}</button>`).join('')}</div>
    <div class="section-title" style="margin-top:16px">Descripción</div><div class="desc" id="desc"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div>`, target);
  fillDesc(currentOrgan.es, currentOrgan.en, target);
}
function selectOrganPart(gk, focus = false) {
  const g = organs.select(gk);
  if (!g) return showOrganSummary();
  if (focus) organs.focus(gk);
  const target = { kind: 'organ-part', gk };
  openSheet(`
    <p class="kicker"><i style="background:var(--accent)"></i>${esc(currentOrgan.es)}</p>
    <h2>${esc(g.label)}</h2>
    <p class="latin">${esc(g.la || g.key)}</p>
    ${actionsHtml()}
    <button class="link" data-back style="margin-bottom:14px">← Todas las partes</button>
    ${descHtml()}`, target);
  sheetBody.querySelector('[data-back]').addEventListener('click', () => { organs.select(null); showOrganSummary(); });
  fillDesc(g.es, g.key, target);
}

// --- quiz ------------------------------------------------------------------------------------
const quizBox = $('#quiz-box');
const profiles = createProfiles();
clinica = await loadClinica(V);
const sync = createSync(profiles);
let quiz = createQuiz(body, quizBox, { profiles, clinica, sync });

setupLaunch({ toast });

// --- fisiología en movimiento -------------------------------------------------------------------
const physioBox = $('#physio-box');
const physio = createPhysio(viewer, physioBox, $('#physio-chips'), { toast });

// --- abrir órganos (cuerpo) -----------------------------------------------------------------------
explorer = createOrganExplorer(viewer, {
  onClose: () => {
    renderLayers(); updateClip(); updateShowAll();
    if (sheetTarget?.kind === 'body') showPart(body.byId.get(sheetTarget.id));
  },
});

// --- cuerpo masculino / femenino ----------------------------------------------------------------
const bodies = { M: body };
let bodySex = 'M';
const sexBtns = document.querySelectorAll('#body-sex button');
async function switchBody(sx) {
  if (sx === bodySex) return;
  sexBtns.forEach((b) => b.classList.toggle('active', b.dataset.sex === sx));
  if (!bodies[sx]) {
    progress(0, 'Cargando el cuerpo femenino…');
    const holder = {};
    holder.b = await createBody(viewer, {
      dataset: { parts: 'female.json', models: 'female-models.json' },
      onProgress: (f) => progress(f, `Cargando el cuerpo femenino… ${Math.round(f * 100)}%`),
      onSystemLoaded: () => {
        if (body === holder.b) renderLayers();
        const left = holder.b?.order.filter((x) => holder.b.models[x] && !holder.b.state.loaded.has(x)).length;
        if (holder.b && !left) loaderDone();
      },
    });
    bodies[sx] = holder.b;
    holder.b.allLoaded.then(() => { loaderDone(); updateClip(); });
  }
  if (mode === 'quiz') quiz.stop();
  if (mode === 'physio') physio.stop();
  if (explorer.isOpen) explorer.close(true);
  body.select(null);
  body.root.visible = false;
  bodySex = sx;
  body = bodies[sx];
  body.root.visible = mode === 'body' || mode === 'quiz' || mode === 'physio';
  xray = false;
  quiz = createQuiz(body, quizBox, { profiles, clinica, sync });
  closeSheet();
  searchEl.value = ''; results = []; renderResults();
  renderLayers();
  updateShowAll();
  updateClip();
  viewer.fitTo(body.bodyBox, VIEWS.front);
  if (mode === 'quiz') quiz.start();
  if (mode === 'physio') physio.start(body);
  if (sx === 'F' && !store.get('atlas-female-hint')) {
    store.set('atlas-female-hint', '1');
    toast('Cuerpo femenino (HuBMAP): órganos en su lugar, pelvis femenina y silueta de piel', 4500);
  }
}
sexBtns.forEach((b) => b.addEventListener('click', () => switchBody(b.dataset.sex)));

// --- modos ------------------------------------------------------------------------------------
function setMode(m, { skipDefault = false } = {}) {
  if (explorer?.isOpen) explorer.close(true);
  if (mode === 'quiz' && m !== 'quiz') { quiz.stop(); renderLayers(); }
  if (mode === 'physio' && m !== 'physio') physio.stop();
  mode = m;
  document.body.dataset.mode = m;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
  body.root.visible = m === 'body' || m === 'quiz' || m === 'physio';
  organs.root.visible = m === 'organs';
  $('#search-pill').hidden = m !== 'body';
  $('#body-sex').hidden = m !== 'body' && m !== 'quiz' && m !== 'physio';
  $('#tools').hidden = m === 'quiz' || m === 'sources' || m === 'physio';
  $('#navpad').hidden = m === 'sources';
  $('#layers').hidden = m !== 'body';
  $('#organ-bar').hidden = m !== 'organs';
  $('#physio-chips').hidden = m !== 'physio';
  $('.dock').hidden = m === 'quiz' || m === 'sources';
  quizBox.hidden = m !== 'quiz';
  $('#sources-page').hidden = m !== 'sources';
  clipPop.hidden = true;
  closeSheet();
  body.select(null);
  if (m === 'body') viewer.fitTo(body.bodyBox, VIEWS.front, { instant: true });
  if (m === 'organs') {
    if (!organs.current) { sex = bodySex; document.querySelectorAll('#sex-filter button').forEach((x) => x.classList.toggle('active', x.dataset.sex === sex)); }
    renderOrganChips();
    if (organs.current) { organs.frame(VIEWS.front); showOrganSummary(); }
    else if (!skipDefault) openOrgan(hubmap.find((o) => o.id === '3d-vh-f-heart') || hubmap[0]); // nunca abrir vacío
  }
  if (m === 'quiz') quiz.start();
  if (m === 'physio') { clipAxis = 'none'; markPhysioSeen(); physio.start(body); }
  if (m !== 'body') document.querySelector('.cta')?.remove();
  if (m === 'sources') renderSources($('#sources-page'));
  updateClip();
  updateShowAll();
  layout();
  viewer.requestRender();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { if (t.dataset.mode !== mode) setMode(t.dataset.mode); }));

// la ficha tapa parte de la pantalla: correr el centro de la vista hacia la zona libre
function layout() {
  document.body.classList.toggle('sheet-open', !sheet.hidden);
  const cam = viewer.camera;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const panel = !sheet.hidden ? sheet : (!quizBox.hidden ? quizBox : (!physioBox.hidden ? physioBox : null));
  let dx = 0, dy = 0;
  if (panel) {
    if (isMobile()) dy = Math.min(panel.offsetHeight, h * 0.6) / 2;
    else dx = (panel.offsetWidth + 16) / 2;
  }
  if (dx || dy) cam.setViewOffset(w, h, dx, dy, w, h); else cam.clearViewOffset();
  cam.updateProjectionMatrix();
  viewer.requestRender();
}
new ResizeObserver(() => layout()).observe(sheet);
new ResizeObserver(() => layout()).observe(quizBox);
new ResizeObserver(() => layout()).observe(physioBox);
window.addEventListener('resize', layout);

// --- puntero -----------------------------------------------------------------------------------
const hoverLabel = $('#hover-label');
let down = null, hoverQueued = false, lastMove = null, lastTap = 0;
const activeMeshes = () => (mode === 'organs' ? organs.meshes() : [...body.meshes.values()]);
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  if (!resultsEl.hidden) searchEl.blur();
  if (!clipPop.hidden && e.target === canvas) clipPop.hidden = true;
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || e.button !== 0) return;
  if (mode === 'sources') return;
  if (mode === 'physio') {
    const h = viewer.pick(e.clientX, e.clientY, [...body.meshes.values()]);
    if (h) toast(displayName(h.object.userData.part), 1800);
    return;
  }
  if (mode === 'quiz') {
    // modo Señalar: solo cuentan las capas sólidas (el esqueleto tenue de referencia no "roba" el toque)
    if (!quiz.tapMode) return;
    const solid = [...body.meshes.values()].filter((m) => body.state.sysOpacity[m.userData.part.system] >= 0.5);
    const h = viewer.pick(e.clientX, e.clientY, solid);
    quiz.tap(h ? h.object.userData.part.id : null);
    return;
  }
  const hit = viewer.pick(e.clientX, e.clientY, activeMeshes());
  const now = performance.now(), dbl = now - lastTap < 320;
  lastTap = now;
  if (mode === 'organs') {
    if (hit) selectOrganPart(hit.object.userData.group, dbl);
    else if (organs.current) { organs.select(null); showOrganSummary(); }
  } else {
    if (hit) selectBody(hit.object.userData.part.id, { focus: dbl });
    else { body.select(null); closeSheet(); }
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastMove = e;
  if (e.buttons || e.pointerType !== 'mouse' || hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false;
    if (mode === 'quiz' || mode === 'sources') { hoverLabel.hidden = true; return; }
    const ev = lastMove;
    const hit = viewer.pick(ev.clientX, ev.clientY, activeMeshes(), { buildTrees: false });
    if (!hit) { hoverLabel.hidden = true; return; }
    hoverLabel.textContent = mode === 'organs'
      ? organs.current?.groups.get(hit.object.userData.group)?.label
      : displayName(hit.object.userData.part);
    hoverLabel.style.left = `${ev.clientX}px`;
    hoverLabel.style.top = `${ev.clientY}px`;
    hoverLabel.hidden = false;
  });
});
canvas.addEventListener('pointerleave', () => { hoverLabel.hidden = true; });

// Botón de modo: mano (mover) ⇄ girar. Se recuerda entre visitas.
const navModeBtn = $('#navmode-btn');
function applyNavMode(m) {
  viewer.setNavMode(m);
  const pan = m === 'pan';
  navModeBtn.classList.toggle('on', pan);
  navModeBtn.querySelector('.ico-pan').style.display = pan ? '' : 'none';
  navModeBtn.querySelector('.ico-rot').style.display = pan ? 'none' : '';
  navModeBtn.title = pan ? 'Modo mano: arrastra para mover (clic para cambiar a girar)' : 'Modo girar: arrastra para girar (clic para cambiar a mano)';
  navModeBtn.setAttribute('aria-label', pan ? 'Modo mano activo' : 'Modo girar activo');
}
applyNavMode(store.get('navMode') === 'pan' ? 'pan' : 'rotate');
navModeBtn.addEventListener('click', () => {
  const m = viewer.navMode === 'pan' ? 'rotate' : 'pan';
  applyNavMode(m); store.set('navMode', m);
  toast(m === 'pan' ? '✋ Modo mano: arrastra para mover' : '🔄 Modo girar: arrastra para girar', 1600);
});
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key.toLowerCase() === 'm') navModeBtn.click();
});

// Panel de navegación: un toque = un paso; mantener pulsado = movimiento continuo.
document.querySelectorAll('#navpad [data-pan], #navpad [data-zoom]').forEach((b) => {
  let timer = null;
  const step = () => {
    if (b.dataset.zoom) viewer.zoomBy(Number(b.dataset.zoom));
    else { const [x, y] = b.dataset.pan.split(',').map(Number); viewer.nudge(x * 0.5, y * 0.5); }
  };
  const stop = () => { clearInterval(timer); timer = null; };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(); stop(); timer = setInterval(step, 60); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
});

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (explorer?.isOpen) { explorer.close(); return; } body.select(null); organs.select(null); closeSheet(); }
  if (k === '/' && mode === 'body') { e.preventDefault(); searchEl.focus(); }
  const act = { h: 'hide', i: 'isolate', f: 'focus' }[k];
  if (act) sheetBody.querySelector(`[data-act="${act}"]`)?.click();
});

setMode('body');
if (physioSeen()) document.querySelector('.tab-new')?.remove();
// enlace directo: #fisiologia o #fisiologia/<proceso> (circulacion, corazon, respiracion, nervios, digestion, rinones, casos)
const deep = location.hash.match(/^#fisiologia(?:\/([a-z]+))?/);
if (deep) { physio.setInitial(deep[1]); setMode('physio'); }
window.__atlas = { viewer, get body() { return body; }, organs, get quiz() { return quiz; }, physio, switchBody, setMode, selectBody, get explorer() { return explorer; } }; // depuración y pruebas
