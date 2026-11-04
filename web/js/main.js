import { createViewer, VIEWS } from './scene.js';
import { createBody, SYSTEM_COLORS, displayName } from './body.js';
import { createOrgans } from './organs.js';
import { createQuiz } from './quiz.js';
import { renderSources } from './sources.js';
import { wikiFor, renderWiki } from './wiki.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#canvas');
const viewer = createViewer(canvas);

// --- tema ---------------------------------------------------------------
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin storage */ } } };
const savedTheme = store.get('atlas-theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$('#theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  store.set('atlas-theme', document.documentElement.dataset.theme);
});

// --- carga --------------------------------------------------------------
const loaderEl = $('#loader'), loaderBar = $('#loader-bar'), loaderText = $('#loader-text');
function progress(f, text) {
  loaderEl.classList.remove('done');
  loaderBar.style.width = `${Math.round(Math.min(f, 1) * 100)}%`;
  loaderText.textContent = text;
}
const loaderDone = () => loaderEl.classList.add('done');

let mode = 'body';
let organs = null; // se crea más abajo, updateClip puede correr antes
const systemsEl = $('#systems');
let body = null;

function systemRow(s) {
  const li = document.createElement('li');
  li.dataset.system = s;
  li.className = 'pending';
  li.innerHTML = `
    <input type="checkbox" id="sys-${s}">
    <label for="sys-${s}"><span class="dot" style="background:${SYSTEM_COLORS[s]}"></span><span>${body.systems[s]}</span></label>
    <span class="count">…</span>
    <input type="range" min="0" max="1" step="0.05" aria-label="Opacidad ${body.systems[s]}" title="Opacidad">`;
  const cb = li.querySelector('input[type=checkbox]');
  const range = li.querySelector('input[type=range]');
  cb.addEventListener('change', () => body.setSystemVisible(s, cb.checked));
  range.addEventListener('input', () => body.setSystemOpacity(s, Number(range.value)));
  return li;
}
function syncSystems() {
  for (const li of systemsEl.children) {
    const s = li.dataset.system;
    li.querySelector('input[type=checkbox]').checked = body.state.sysVisible[s];
    li.querySelector('input[type=range]').value = body.state.sysOpacity[s];
  }
}

body = await createBody(viewer, {
  onProgress: (f, s) => progress(f, `Cargando modelos 3D… ${Math.round(f * 100)}%`),
  onSystemLoaded: (s, n) => {
    if (!body) return; // el primer sistema llega antes de que exista `body`; se sincroniza abajo
    const li = systemsEl.querySelector(`[data-system="${s}"]`);
    if (li) { li.classList.remove('pending'); li.querySelector('.count').textContent = n; }
    const left = body.order.filter((x) => body.models[x] && !body.state.loaded.has(x)).length;
    $('#load-status').textContent = left ? `· cargando ${left}` : '';
    if (!left) loaderDone();
  },
}).catch((e) => { progress(0, 'No se pudieron cargar los modelos: ' + e.message); throw e; });

for (const s of body.order) if (body.models[s]) systemsEl.append(systemRow(s));
syncSystems();
for (const s of body.state.loaded) {
  const li = systemsEl.querySelector(`[data-system="${s}"]`);
  li?.classList.remove('pending');
  if (li) li.querySelector('.count').textContent = body.models[s].parts;
}
viewer.fitTo(body.bodyBox, VIEWS.front, { instant: true });
body.allLoaded.then(() => updateClip());

// --- ficha ----------------------------------------------------------------
const infoEmpty = $('#info-empty'), infoCard = $('#info-card');
let infoTarget = null; // { kind: 'body', id } | { kind: 'organ', gk }
function showInfo(data) {
  infoTarget = data;
  if (!data) { infoCard.hidden = true; infoEmpty.hidden = false; return; }
  infoEmpty.hidden = true; infoCard.hidden = false;
  $('#info-name').textContent = data.name;
  $('#info-system').innerHTML = `<i style="background:${data.color}"></i>${data.systemLabel}`;
  $('#info-en').textContent = data.en || '—';
  $('#info-la').textContent = data.la || '—';
  $('#info-id').textContent = data.idText || '—';
  $('#info-vol').textContent = data.vol ? `${data.vol.toFixed(2)} cm³` : '—';
  $('#wiki-body').innerHTML = '<p class="muted">Buscando en Wikipedia…</p>';
  $('#wiki-src').textContent = '';
  const ask = data;
  wikiFor({ es: data.es, en: data.en }).then((w) => { if (infoTarget === ask) renderWiki($('#wiki-body'), $('#wiki-src'), w); });
}
function showBodyPart(p) {
  if (!p) return showInfo(null);
  showInfo({
    kind: 'body', id: p.id, name: displayName(p), es: p.es, en: p.en, la: p.la,
    idText: `${p.fma || ''} · ${p.id}`, vol: p.vol, color: SYSTEM_COLORS[p.system], systemLabel: body.systems[p.system],
  });
}
function selectBody(id, { focus = false } = {}) {
  const p = body.select(id);
  if (p && focus) body.focus(id);
  if (mode !== 'quiz' || !quiz.current || quiz.current.id !== id) showBodyPart(p);
}

$('#act-focus').addEventListener('click', () => {
  if (infoTarget?.kind === 'body') body.focus(infoTarget.id);
  if (infoTarget?.kind === 'organ') organs.focus(infoTarget.gk);
});
$('#act-isolate').addEventListener('click', () => {
  if (infoTarget?.kind === 'body') body.isolate(infoTarget.id);
  if (infoTarget?.kind === 'organ') organs.isolate(infoTarget.gk);
});
$('#act-hide').addEventListener('click', () => {
  if (infoTarget?.kind === 'body') { body.hide(infoTarget.id); showInfo(null); }
  if (infoTarget?.kind === 'organ') { organs.setGroupVisible(infoTarget.gk, false); organs.select(null); showInfo(null); }
});
$('#show-all').addEventListener('click', () => { if (mode === 'organs') organs.showAll(); else body.showAll(); });
$('#reset-view').addEventListener('click', () => {
  if (mode === 'organs') organs.frame(VIEWS.front); else viewer.fitTo(body.bodyBox, VIEWS.front);
});
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  const dir = VIEWS[b.dataset.view];
  if (mode === 'organs') organs.frame(dir); else viewer.fitTo(body.bodyBox, dir);
}));

// --- capas y corte ----------------------------------------------------------
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  body.applyPreset(b.dataset.preset);
  syncSystems();
  document.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('active', x === b));
}));
const clipAxis = $('#clip-axis'), clipPos = $('#clip-pos'), clipFlip = $('#clip-flip');
let clipFlipped = false;
function updateClip() {
  const on = clipAxis.value !== 'none';
  clipPos.disabled = clipFlip.disabled = !on;
  const box = mode === 'organs' && organs?.current ? new viewer.THREE.Box3().setFromObject(organs.current.scene) : body.bodyBox;
  viewer.setClip(mode === 'sources' ? 'none' : clipAxis.value, Number(clipPos.value), clipFlipped, box);
}
clipAxis.addEventListener('change', updateClip);
clipPos.addEventListener('input', updateClip);
clipFlip.addEventListener('click', () => { clipFlipped = !clipFlipped; updateClip(); });

// --- búsqueda ----------------------------------------------------------------
const searchEl = $('#search'), resultsEl = $('#search-results');
let results = [], cursor = 0;
function renderResults() {
  resultsEl.hidden = !results.length;
  resultsEl.innerHTML = results.map((p, i) =>
    `<li data-id="${p.id}" class="${i === cursor ? 'sel' : ''}">${displayName(p)}<small>${p.es ? p.en : ''}${p.la ? ' · ' + p.la : ''} · ${body.systems[p.system]}</small></li>`).join('');
}
function pickResult(p) {
  if (!p) return;
  resultsEl.hidden = true;
  searchEl.value = displayName(p);
  body.reveal(p.id);
  seeThrough(p);
  syncSystems();
  selectBody(p.id, { focus: true });
}
// si la estructura está debajo de músculos/piel, volverlos semitransparentes
function seeThrough(p) {
  const covers = { esqueletico: ['muscular', 'piel'], articular: ['muscular', 'piel'], muscular: ['piel'] }[p.system]
    || ['muscular', 'piel', 'esqueletico'];
  for (const s of covers) {
    if (body.state.sysVisible[s] && body.state.sysOpacity[s] > 0.3) body.setSystemOpacity(s, s === 'esqueletico' ? 0.35 : 0.2);
  }
}
searchEl.addEventListener('input', () => { results = body.search(searchEl.value); cursor = 0; renderResults(); });
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, results.length - 1); renderResults(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); renderResults(); e.preventDefault(); }
  if (e.key === 'Enter') pickResult(results[cursor]);
  if (e.key === 'Escape') { resultsEl.hidden = true; searchEl.blur(); }
});
resultsEl.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li');
  if (li) pickResult(body.byId.get(li.dataset.id));
});
searchEl.addEventListener('blur', () => setTimeout(() => { resultsEl.hidden = true; }, 150));

// --- órganos HuBMAP ----------------------------------------------------------
const [hubmap, terms] = await Promise.all([
  fetch('data/hubmap.json').then((r) => r.json()),
  fetch('data/terms.json').then((r) => r.json()),
]);
organs = createOrgans(viewer, terms, {
  onProgress: (f) => progress(f, `Descargando órgano desde HuBMAP… ${Math.round(Math.min(f, 1) * 100)}%`),
});
const organList = $('#organ-list');
let sexFilter = 'all', currentOrgan = null;
const mb = (b) => (b ? `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB` : '');
function renderOrgans() {
  organList.innerHTML = hubmap.filter((o) => sexFilter === 'all' || o.sex === sexFilter).map((o) => `
    <li data-id="${o.id}" class="${currentOrgan?.id === o.id ? 'active' : ''}">
      <span>${o.es} <span class="tag">${o.sex === 'F' ? '♀' : '♂'}</span></span><small>${mb(o.bytes)}</small>
    </li>`).join('');
}
renderOrgans();
document.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => {
  sexFilter = b.dataset.sex;
  document.querySelectorAll('[data-sex]').forEach((x) => x.classList.toggle('active', x === b));
  renderOrgans();
}));
organList.addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const organ = hubmap.find((o) => o.id === li.dataset.id);
  currentOrgan = organ;
  renderOrgans();
  try {
    const entry = await organs.show(organ);
    loaderDone();
    if (entry) { showOrganSummary(organ, entry); updateClip(); }
  } catch (err) {
    progress(0, `No se pudo descargar ${organ.es}: ${err.message}`);
  }
});
function showOrganSummary(organ, entry, activeGk = null) {
  infoTarget = { kind: 'organ-root' };
  infoEmpty.hidden = true; infoCard.hidden = false;
  $('#info-name').textContent = `${organ.es} ${organ.sex === 'F' ? '♀' : '♂'}`;
  $('#info-system').innerHTML = '<i style="background:var(--accent)"></i>HuBMAP · Human Reference Atlas';
  $('#info-en').textContent = organ.en;
  $('#info-la').textContent = terms[organ.en.toLowerCase()]?.[1] || '—';
  $('#info-id').textContent = organ.uberon.replace('_', ':');
  $('#info-vol').textContent = organ.dims_mm.some(Boolean) ? `${organ.dims_mm.join(' × ')} mm` : '—';
  $('#wiki-src').textContent = '';
  const groups = [...entry.groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const wb = $('#wiki-body');
  wb.innerHTML = `<p class="muted">${groups.length} subestructuras. Haz clic en una (aquí o en el modelo).</p>
    <ul class="node-list">${groups.map((g) => `<li data-gk="${g.gk.replace(/"/g, '&quot;')}" class="${g.gk === activeGk ? 'active' : ''}"><span>${g.label}</span><small class="muted">${g.meshes.length > 1 ? g.meshes.length : ''}</small></li>`).join('')}</ul>`;
  wb.querySelector('.node-list').addEventListener('click', (ev) => {
    const l = ev.target.closest('li');
    if (l) selectOrganGroup(l.dataset.gk, true);
  });
}
function selectOrganGroup(gk, focus = false) {
  const g = organs.select(gk);
  if (!g) { if (organs.current) showOrganSummary(currentOrgan, organs.current); return; }
  if (focus) organs.focus(gk);
  showInfo({
    kind: 'organ', gk, name: g.label, es: g.es, en: g.key.charAt(0).toUpperCase() + g.key.slice(1), la: g.la,
    idText: `${currentOrgan.es} · HuBMAP`, color: 'var(--accent)', systemLabel: `${currentOrgan.es} · HuBMAP`,
  });
  const back = document.createElement('button');
  back.className = 'small';
  back.textContent = `← Todas las partes de ${currentOrgan.es}`;
  back.style.marginBottom = '10px';
  back.addEventListener('click', () => { organs.select(null); showOrganSummary(currentOrgan, organs.current, gk); });
  $('#info-card').prepend(back);
  back.dataset.temp = '1';
}

// --- quiz ------------------------------------------------------------------
const quizBox = $('#quiz-box');
const quiz = createQuiz(body, quizBox, { onAnswer: (p) => showBodyPart(p), onQuestion: (p) => { seeThrough(p); syncSystems(); } });

// --- modos -------------------------------------------------------------------
function setMode(m) {
  mode = m;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
  document.querySelectorAll('.sidebar .panel').forEach((p) => { p.hidden = !p.dataset.for.split(' ').includes(m); });
  body.root.visible = m === 'body' || m === 'quiz';
  organs.root.visible = m === 'organs';
  quizBox.hidden = m !== 'quiz';
  $('#sources-page').hidden = m !== 'sources';
  $('#info').style.visibility = m === 'sources' ? 'hidden' : '';
  document.querySelectorAll('#info-card [data-temp]').forEach((x) => x.remove());
  showInfo(null);
  body.select(null);
  updateClip();
  if (m === 'body' || m === 'quiz') viewer.fitTo(body.bodyBox, VIEWS.front, { instant: true });
  if (m === 'organs') {
    if (organs.current) { organs.frame(VIEWS.front); showOrganSummary(currentOrgan, organs.current); }
    else { infoEmpty.hidden = false; infoEmpty.querySelector('p').innerHTML = '<strong>Elige un órgano</strong> de la lista. Se descarga desde HuBMAP (el peso aparece al lado).'; }
  } else {
    infoEmpty.querySelector('p').innerHTML = '<strong>Haz clic en una estructura</strong> para ver su ficha.';
  }
  if (m === 'quiz') quiz.next();
  if (m === 'sources') renderSources($('#sources-page'));
  viewer.requestRender();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

// --- puntero -----------------------------------------------------------------
const hoverLabel = $('#hover-label');
let down = null, hoverQueued = false, lastMove = null;
const activeMeshes = () => (mode === 'organs' ? organs.meshes() : [...body.meshes.values()]);
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
  const hit = viewer.pick(e.clientX, e.clientY, activeMeshes());
  document.querySelectorAll('#info-card [data-temp]').forEach((x) => x.remove());
  if (mode === 'organs') {
    if (hit) selectOrganGroup(hit.object.userData.group);
    else if (organs.current) { organs.select(null); showOrganSummary(currentOrgan, organs.current); }
  } else if (mode === 'body') {
    selectBody(hit ? hit.object.userData.part.id : null);
  }
});
canvas.addEventListener('dblclick', (e) => {
  const hit = viewer.pick(e.clientX, e.clientY, activeMeshes());
  if (!hit) return;
  if (mode === 'organs') { selectOrganGroup(hit.object.userData.group, true); }
  else if (mode === 'body') selectBody(hit.object.userData.part.id, { focus: true });
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
    const r = canvas.getBoundingClientRect();
    hoverLabel.textContent = mode === 'organs'
      ? organs.current?.groups.get(hit.object.userData.group)?.label
      : displayName(hit.object.userData.part);
    hoverLabel.style.left = `${ev.clientX - r.left}px`;
    hoverLabel.style.top = `${ev.clientY - r.top}px`;
    hoverLabel.hidden = false;
  });
});
canvas.addEventListener('pointerleave', () => { hoverLabel.hidden = true; });

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { body.select(null); organs.select(null); showInfo(null); }
  if (k === 'h') $('#act-hide').click();
  if (k === 'i') $('#act-isolate').click();
  if (k === 'f') $('#act-focus').click();
});

setMode('body');
