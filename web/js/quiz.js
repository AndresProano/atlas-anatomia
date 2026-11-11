// Quiz con tres tipos de pregunta y progreso guardado en el navegador:
//  - Opciones: se resalta una estructura y eliges su nombre entre 4.
//  - Escribir: se resalta una estructura y escribes el nombre (se califica con tolerancia).
//  - Señalar: te dan el nombre y tocas la estructura en el modelo.
//  - Función / Enfermedades (Comprender): respondes con tus palabras y se califica por ideas clave.
// Repetición espaciada (cajas de Leitner): lo que fallas vuelve antes, lo que dominas sale menos.
import { displayName } from './body.js?v=7c754a0a';
import { renderGoogleButton } from './sync.js?v=7c754a0a';
import { gradeConcepts, gradeDisease } from './clinica.js?v=7c754a0a';

export const QUIZ_GROUPS = {
  all: { label: 'Todo el cuerpo', systems: ['esqueletico', 'muscular', 'digestivo', 'respiratorio', 'urogenital', 'reproductor', 'endocrino', 'cardiovascular', 'nervioso'] },
  huesos: { label: 'Huesos', systems: ['esqueletico'] },
  musculos: { label: 'Músculos', systems: ['muscular'] },
  organos: { label: 'Órganos', systems: ['digestivo', 'respiratorio', 'urogenital', 'endocrino'] },
  reproductor: { label: 'Aparato reproductor', systems: ['reproductor'] },
  vasos: { label: 'Corazón y vasos', systems: ['cardiovascular'] },
  nervios: { label: 'Sistema nervioso', systems: ['nervioso'] },
};
// Tres pruebas en el orden en que se estudia: anatomía -> fisiología -> fisiopatología
const STAGES = {
  anat: { n: 1, label: 'Anatomía', hint: 'Dónde está y cómo se llama', modes: { choice: 'Opciones', type: 'Escribir', point: 'Señalar' } },
  fisio: { n: 2, label: 'Fisiología', hint: 'Cómo funciona', modes: { func: '¿Qué función tiene?', funcRev: '¿Quién lo hace?' } },
  pato: { n: 3, label: 'Fisiopatología', hint: 'Qué pasa cuando falla', modes: { disease: 'Enfermedades', caseRev: 'Caso clínico' } },
};
const stageOfMode = (m) => Object.keys(STAGES).find((k) => m in STAGES[k].modes);
const TAP_MODES = new Set(['point', 'funcRev', 'caseRev']); // se responde tocando el modelo
const REVERSE = new Set(['funcRev', 'caseRev']);
// qué se ve en pantalla según el sistema de la pregunta
const SCENE = {
  esqueletico: { show: ['esqueletico', 'articular'] },
  muscular: { show: ['esqueletico', 'muscular'] },
  cardiovascular: { show: ['esqueletico', 'cardiovascular'], ghost: ['esqueletico'] },
  nervioso: { show: ['esqueletico', 'nervioso'], ghost: ['esqueletico'] },
};
const ORGANS = { show: ['esqueletico', 'digestivo', 'respiratorio', 'urogenital', 'reproductor', 'endocrino', 'cardiovascular'], ghost: ['esqueletico'] };

// --- calificación de respuestas escritas ------------------------------------------------
const STOP = new Set(['musculo', 'musculos', 'hueso', 'huesos', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'muscle', 'bone', 'of', 'the', 'm', 'os', 'musculus']);
export function normAnswer(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\((izq|der|left|right)\.?\)/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// palabras que cambian de estructura (pectoral mayor ≠ pectoral menor): no es una falta de ortografía
const OPPOSITES = [['mayor', 'menor'], ['major', 'minor'], ['medial', 'lateral'], ['anterior', 'posterior'],
  ['superior', 'inferior'], ['interno', 'externo'], ['interna', 'externa'], ['internus', 'externus'],
  ['proximal', 'distal'], ['superficial', 'profundo'], ['longus', 'brevis'], ['largo', 'corto'],
  ['izquierdo', 'derecho'], ['izquierda', 'derecha'], ['primero', 'segundo'], ['dorsal', 'ventral'], ['dorsal', 'palmar']];
function contradicts(given, accepted) {
  const g = new Set(given.split(' ')), a = new Set(accepted.split(' '));
  return OPPOSITES.some(([x, y]) => (g.has(x) && !a.has(x) && a.has(y)) || (g.has(y) && !a.has(y) && a.has(x)));
}
// devuelve { grade: 'ok' | 'almost' | 'bad', score: 0..1 }
export function gradeText(input, p) {
  const given = normAnswer(input);
  if (!given) return { grade: 'bad', score: 0 };
  const accepted = [p.es, p.la, p.en].filter(Boolean).map(normAnswer).filter(Boolean);
  if (accepted.some((a) => contradicts(given, a))) return { grade: 'bad', score: 0 };
  let best = 0;
  for (const a of accepted) {
    const sim = 1 - lev(given, a) / Math.max(given.length, a.length);
    // también vale si escribió el nombre sin un calificativo (p. ej. "vasto lateral" para "vasto lateral derecho")
    const contains = a.includes(given) && given.length >= a.length * 0.75 ? 0.9 : 0;
    best = Math.max(best, sim, contains);
  }
  return { grade: best >= 0.88 ? 'ok' : best >= 0.7 ? 'almost' : 'bad', score: best };
}

// --- progreso (localStorage, por navegador) -------------------------------------------------
// el progreso vive en el perfil de cada persona (web/js/profiles.js)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WEIGHT = [6, 3, 1.5, 0.6, 0.25]; // caja 0 (nuevo/fallado) … caja 4 (dominado)
const MASTERED = 2; // a partir de esta caja cuenta como dominado

export function createQuiz(body, box, { onAnswer, profiles, clinica, sync } = {}) {
  let score = 0, total = 0, group = 'all', mode = 'choice', review = false;
  let current = null, saved = null, answered = false, hintLevel = 0;
  let progress = profiles.loadProgress();
  const saveProgress = (p) => profiles.saveProgress(p);
  const sex = body.female ? 'F' : 'M';
  const baseName = (p) => displayName(p).replace(/\s*\((izq|der)\.\)/, '');
  const curStage = () => stageOfMode(mode);
  const isComp = () => curStage() !== 'anat';
  const entryOf = (p) => (p && clinica ? clinica.forName(baseName(p)) : null);
  // identificar se guarda por nombre y cuerpo; comprender, por concepto (igual en ambos cuerpos)
  // anatomía: por nombre y cuerpo · fisiología / fisiopatología: por concepto (igual en ambos cuerpos)
  const keyOf = (p, st = curStage()) => (st === 'anat' ? `${sex}:${baseName(p)}` : `c:${st === 'fisio' ? 'func' : 'disease'}:${entryOf(p)?.id}`);
  let currentCase = null;
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  let compChoices = false, lastRec = null;
  const rec = (p, st) => progress[keyOf(p, st)] || { a: 0, c: 0, box: 0 };

  // estructuras "de examen": con nombre conocido y tamaño visible
  function poolFor(g, st = curStage()) {
    const sys = QUIZ_GROUPS[g].systems;
    return body.catalog.parts.filter((p) => p.es && (p.la || body.female) && body.meshes.has(p.id) && body.state.loaded.has(p.system)
      && sys.includes(p.system) && (p.vol ?? 0) >= 1.5 && (st === 'anat' || entryOf(p)));
  }
  // un elemento por nombre (izquierdo y derecho cuentan como uno)
  function uniqueByName(list) {
    const seen = new Map();
    for (const p of list) if (!seen.has(baseName(p))) seen.set(baseName(p), p);
    return [...seen.values()];
  }
  function stats(g, st = curStage()) {
    let u = uniqueByName(poolFor(g, st));
    if (st !== 'anat') { const seenE = new Set(); u = u.filter((p) => { const id = entryOf(p).id; if (seenE.has(id)) return false; seenE.add(id); return true; }); }
    const mastered = u.filter((p) => rec(p, st).box >= MASTERED).length;
    const seen = u.filter((p) => rec(p, st).a > 0).length;
    return { total: u.length, mastered, seen };
  }

  function pickWeighted(list) {
    const st = curStage();
    const ws = list.map((p) => {
      let w = WEIGHT[Math.min(rec(p).box, 4)];
      if (st !== 'anat') {
        const prev = rec(p, st === 'pato' ? 'fisio' : 'anat');
        w *= prev.box >= MASTERED ? 2 : prev.a > 0 ? 1.2 : 0.6;
      }
      return w;
    });
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  function stage(p) {
    const sc = SCENE[p.system] || ORGANS;
    // en Señalar el esqueleto queda tenue (no se puede tocar) salvo que la pregunta sea de huesos
    const ghost = mode === 'point' && p.system !== 'esqueletico' ? ['esqueletico', ...(sc.ghost || [])] : (sc.ghost || []);
    for (const s of body.order) {
      const silhouette = body.female && s === 'piel'; // silueta femenina como referencia
      body.setSystemVisible(s, sc.show.includes(s) || silhouette);
      body.setSystemOpacity(s, silhouette ? 0.12 : (ghost.includes(s) ? 0.22 : 1));
    }
    body.showAll();
  }

  function next() {
    answered = false; hintLevel = 0;
    let ps = poolFor(group);
    // Señalar: solo estructuras que se puedan tocar (no las diminutas ni las muy profundas)
    if (TAP_MODES.has(mode)) {
      const big = ps.filter((p) => (p.vol ?? 0) >= (p.system === 'esqueletico' ? 3 : 8));
      if (big.length >= 4) ps = big;
    }
    if (review) {
      const failed = ps.filter((p) => { const r = rec(p); return r.a > 0 && r.box < MASTERED; });
      if (failed.length) ps = failed;
      else { review = false; }
    }
    if (isComp() && ps.length < 4 && group !== 'all') { group = 'all'; ps = poolFor(group); }
    compChoices = false; lastRec = null;
    if (ps.length < 4) {
      box.innerHTML = '<h3>Preparando el quiz…</h3><p class="sub">Los modelos se están cargando. Inténtalo en unos segundos.</p>';
      return;
    }
    // evitar repetir la misma estructura dos veces seguidas
    const prev = current && baseName(current);
    let cand = pickWeighted(ps);
    for (let i = 0; i < 5 && baseName(cand) === prev; i++) cand = pickWeighted(ps);
    current = cand;
    currentCase = mode === 'caseRev' ? rand(entryOf(current).enfermedades) : null;
    stage(current);
    if (REVERSE.has(mode)) {
      // no se dice cuál es: se ve la capa completa y hay que encontrarla
      body.select(null);
      body.setOverlay(null);
      body.frameAll();
    } else if (mode === 'point') {
      // no se resalta: hay que encontrarla. La cámara muestra la región con contexto amplio.
      body.select(null);
      body.setOverlay(null);
      body.focus(current.id, 6.5);
    } else {
      body.select(current.id);
      body.setOverlay(current.id);
      body.focus(current.id, 5);
      setTimeout(() => body.pulse(current.id, 2200), 450);
    }
    render();
  }

  // --- interfaz -------------------------------------------------------------------------
  function header() {
    const st = stats(group);
    const pct = st.total ? Math.round((st.mastered / st.total) * 100) : 0;
    const who = profiles.current;
    return `
      <button class="who" id="quiz-who" title="Cambiar de persona"><i style="background:${who?.color || 'var(--accent)'}">${esc((who?.name || '?')[0].toUpperCase())}</i>${esc(who?.name || 'Elegir persona')}</button>
      <div class="stages">${Object.entries(STAGES).map(([k, S]) => {
        const x = stats(group, k);
        return `<button data-stage="${k}" class="${k === curStage() ? 'active' : ''}"><b>${S.n}</b><span>${S.label}</span><small>${x.mastered}/${x.total}</small></button>`;
      }).join('<i class="arrow">›</i>')}</div>
      <p class="stage-hint">${STAGES[curStage()].hint}</p>
      ${tipHtml()}
      <div class="seg quiz-modes">${Object.entries(STAGES[curStage()].modes).map(([k, l]) => `<button data-mode="${k}" class="${k === mode ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="progress-line">
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span>${st.mastered}/${st.total} dominadas</span>
      </div>`;
  }
  // sugerir el orden recomendado si se salta una etapa
  function tipHtml() {
    const st = curStage();
    if (st === 'anat') return '';
    const prevKey = st === 'pato' ? 'fisio' : 'anat';
    const prev = stats(group, prevKey);
    if (!prev.total || prev.mastered / prev.total >= 0.2) return '';
    return `<p class="tip">Sugerencia: avanza primero en <b>${STAGES[prevKey].label}</b> (llevas ${prev.mastered}/${prev.total}). Aquí salen primero las estructuras que ya dominas allí.</p>`;
  }
  function footer() {
    return `
      <div class="row">
        <span class="score">${score} / ${total}${review ? ' · repaso' : ''}</span>
        <select id="quiz-group" aria-label="Tema del quiz">
          ${Object.entries(QUIZ_GROUPS).filter(([k]) => poolFor(k).length >= 4)
            .map(([k, g]) => `<option value="${k}" ${k === group ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select>
        <button class="btn ghost" id="quiz-skip">${answered ? 'Siguiente' : 'Saltar'}</button>
      </div>
      <div class="row small">
        <button class="link" id="quiz-review">${review ? 'Volver a todo' : 'Repasar fallos'}</button>
        <button class="link" id="quiz-stats">Mi progreso</button>
      </div>`;
  }
  function options() {
    const ps = poolFor(group);
    const same = uniqueByName(ps.filter((p) => p.system === current.system && baseName(p) !== baseName(current)));
    const others = same.length >= 3 ? same : uniqueByName(ps.filter((p) => baseName(p) !== baseName(current)));
    const opts = new Set([baseName(current)]);
    while (opts.size < 4 && others.length) opts.add(baseName(others.splice(Math.floor(Math.random() * others.length), 1)[0]));
    return [...opts].sort(() => Math.random() - 0.5);
  }

  function render() {
    let q = '';
    if (mode === 'choice') {
      q = `<h3>¿Qué estructura está resaltada?</h3>
        <div class="opts">${options().map((o) => `<button data-opt="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}</div>`;
    } else if (mode === 'type') {
      q = `<h3>¿Cómo se llama la estructura resaltada?</h3>
        <form class="type-answer" id="type-form" autocomplete="off">
          <input id="type-input" type="text" placeholder="Escribe el nombre (español o latín)" autocapitalize="off" spellcheck="false" enterkeyhint="done">
          <button class="btn" type="submit">Calificar</button>
        </form>
        <button class="link" id="quiz-hint">Pista</button><span class="hint" id="hint-text"></span>`;
    } else if (mode === 'func') {
      q = `<h3>¿Qué función tiene?</h3>
        <p class="target-name">${esc(baseName(current))}</p>
        <p class="sub">Responde con tus palabras: qué hace o de qué se encarga.</p>
        ${compChoices ? `<div class="opts">${compOptions().map((o) => `<button data-copt="${o.id}">${esc(o.text)}</button>`).join('')}</div>` : `
        <form class="type-answer col" id="type-form" autocomplete="off">
          <textarea id="type-input" rows="3" placeholder="Ej.: bombea la sangre a todo el cuerpo…"></textarea>
          <div class="row"><button class="link" type="button" id="comp-opts">Prefiero opciones</button><button class="btn" type="submit">Calificar</button></div>
        </form>`}`;
    } else if (mode === 'disease') {
      q = `<h3>Nombra una enfermedad o lesión de:</h3>
        <p class="target-name">${esc(baseName(current))}</p>
        <p class="sub">Cualquiera de las frecuentes vale.</p>
        ${compChoices ? `<div class="opts">${compOptions().map((o) => `<button data-copt="${o.id}">${esc(o.text)}</button>`).join('')}</div>` : `
        <form class="type-answer" id="type-form" autocomplete="off">
          <input id="type-input" type="text" placeholder="Ej.: fractura, hepatitis…" autocapitalize="off" spellcheck="false" enterkeyhint="done">
          <button class="btn" type="submit">Calificar</button>
        </form>
        <button class="link" type="button" id="comp-opts">Prefiero opciones</button>`}`;
    } else if (mode === 'funcRev') {
      q = `<h3>¿Qué estructura cumple esta función?</h3>
        <p class="clue">«${esc(mask(entryOf(current).funcion))}»</p>
        ${compChoices ? `<div class="opts">${options().map((o) => `<button data-opt="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}</div>`
          : '<p class="sub">Tócala en el modelo (puedes girarlo y hacer zoom). <button class="link" type="button" id="comp-opts">Prefiero opciones</button></p>'}`;
    } else if (mode === 'caseRev') {
      q = `<h3>Caso clínico: ¿qué estructura está afectada?</h3>
        <p class="clue"><b>${esc(mask(currentCase.nombre))}</b>: ${esc(mask(currentCase.nota))}</p>
        ${compChoices ? `<div class="opts">${options().map((o) => `<button data-opt="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}</div>`
          : '<p class="sub">Tócala en el modelo. <button class="link" type="button" id="comp-opts">Prefiero opciones</button></p>'}`;
    } else {
      q = `<h3>Señala en el modelo:</h3>
        <p class="target-name">${baseName(current)}</p>
        <p class="sub">Toca la estructura. Puedes girar y hacer zoom antes de tocar.</p>`;
    }
    box.innerHTML = header() + q + '<div id="quiz-feedback"></div>' + footer();
    wire();
    if (mode === 'type' && !matchMedia('(max-width: 899px)').matches) box.querySelector('#type-input')?.focus();
  }

  function wire() {
    box.querySelectorAll('.quiz-modes [data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; next(); }));
    box.querySelectorAll('.stages [data-stage]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.stage === curStage()) return;
      mode = Object.keys(STAGES[b.dataset.stage].modes)[0]; next();
    }));
    box.querySelector('#comp-opts')?.addEventListener('click', () => { compChoices = true; render(); });
    box.querySelectorAll('[data-copt]').forEach((b) => b.addEventListener('click', () => answerCompChoice(b)));
    box.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => answerChoice(b)));
    box.querySelector('#quiz-skip').addEventListener('click', next);
    box.querySelector('#quiz-group').addEventListener('change', (e) => { group = e.target.value; next(); });
    box.querySelector('#quiz-review').addEventListener('click', () => { review = !review; next(); });
    box.querySelector('#quiz-stats').addEventListener('click', showStats);
    box.querySelector('#quiz-who')?.addEventListener('click', showStats);
    box.querySelector('#type-form')?.addEventListener('submit', (e) => { e.preventDefault(); if (isComp()) answerComp(); else answerText(); });
    if (isComp()) box.querySelector('textarea#type-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answerComp(); } });
    box.querySelector('#quiz-hint')?.addEventListener('click', hint);
  }

  // --- registrar resultado ------------------------------------------------------------------
  function record(points) {
    const r = rec(current);
    lastRec = { key: keyOf(current), prev: { ...r }, points };
    r.a++;
    if (points >= 1) { r.c++; r.box = Math.min(r.box + 1, 4); }
    else if (points > 0) { r.box = Math.max(r.box, 1); }
    else r.box = 0;
    r.t = Date.now();
    progress[keyOf(current)] = r;
    saveProgress(progress);
    sync?.schedule();
    total++; score += points;
    answered = true;
    onAnswer?.(current, points >= 1);
  }
  function feedback(kind, title) {
    const el = box.querySelector('#quiz-feedback');
    el.innerHTML = `<div class="explain ${kind}"><strong>${title}</strong>
      <span>${baseName(current)}</span>${current.la ? `<em>${current.la}</em>` : ''}</div>
      ${profiles.backupDue() ? `<button class="backup-nudge" id="nudge">${sync?.configured ? 'Crea una cuenta para no perder tu progreso →' : 'Guarda una copia de tu progreso para no perderlo →'}</button>` : ''}`;
    el.querySelector('#nudge')?.addEventListener('click', showStats);
    const skip = box.querySelector('#quiz-skip');
    skip.textContent = 'Siguiente'; skip.className = 'btn';
    box.querySelector('.score').textContent = `${Math.round(score * 10) / 10} / ${total}${review ? ' · repaso' : ''}`;
    const st = stats(group);
    box.querySelector('.progress-line').innerHTML = `<div class="bar"><span style="width:${st.total ? Math.round((st.mastered / st.total) * 100) : 0}%"></span></div><span>${st.mastered}/${st.total} dominadas</span>`;
  }

  function answerChoice(btn) {
    const opts = btn.parentElement;
    if (!current || answered) return;
    const right = baseName(current);
    const ok = btn.dataset.opt === right;
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) opts.querySelector(`[data-opt="${CSS.escape(right)}"]`)?.classList.add('ok');
    record(ok ? 1 : 0);
    if (REVERSE.has(mode)) { revealTarget(); compFeedback(ok ? 'ok' : 'bad', ok ? `¡Correcto! ${esc(right)}` : `Era: ${esc(right)}`, '', false); return; }
    feedback(ok ? 'ok' : 'bad', ok ? '¡Correcto!' : 'Era:');
    body.pulse(current.id, 1200);
  }
  function revealTarget() {
    body.select(current.id);
    body.setOverlay(current.id);
    body.focus(current.id, 4);
    body.pulse(current.id, 1600);
  }

  function answerText() {
    if (!current || answered) return;
    const input = box.querySelector('#type-input');
    const { grade } = gradeText(input.value, current);
    const pts = grade === 'ok' ? (hintLevel ? 0.5 : 1) : grade === 'almost' ? 0.5 : 0;
    record(pts);
    input.disabled = true;
    input.classList.add(grade);
    const titles = { ok: hintLevel ? '¡Correcto! (con pista, medio punto)' : '¡Correcto!', almost: 'Casi: revisa cómo se escribe', bad: 'No. La respuesta es:' };
    feedback(grade, titles[grade]);
    body.pulse(current.id, 1200);
  }

  function mask(text) {
    const e = entryOf(current);
    let t = String(text || '');
    const names = (e?.nombres || []).flatMap((n) => [n, n.replace(/^(Hueso|Músculo) /, '')]).filter((n) => n.length >= 4)
      .sort((a, b) => b.length - a.length);
    for (const n of names) t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[…]');
    return t;
  }
  // --- comprender -----------------------------------------------------------------------------
  function compOptions() {
    const e = entryOf(current);
    const others = clinica.list.filter((x) => x.id !== e.id);
    const pick = (arr, n) => arr.sort(() => Math.random() - 0.5).slice(0, n);
    if (mode === 'func') {
      return pick([{ id: e.id, text: e.funcion }, ...pick(others, 3).map((x) => ({ id: x.id, text: x.funcion }))], 4);
    }
    const right = pick([...e.enfermedades], 1)[0];
    // distractores: enfermedades de otras estructuras que no se repitan en esta
    const own = new Set(e.enfermedades.map((d) => d.nombre.toLowerCase()));
    const pool = others.flatMap((x) => x.enfermedades.map((d) => ({ id: `x:${x.id}`, text: d.nombre }))).filter((d) => !own.has(d.text.toLowerCase()));
    return pick([{ id: e.id, text: right.nombre }, ...pick(pool, 3)], 4);
  }
  function modelAnswer(e, extra = '') {
    const list = curStage() === 'pato'
      ? `<ul class="dz">${e.enfermedades.map((d) => `<li><b>${esc(d.nombre)}</b>: ${esc(d.nota)}</li>`).join('')}</ul>`
      : `<p>${esc(e.funcion)}</p>`;
    return `${extra}${list}${e.dato ? `<p class="dato">${esc(e.dato)}</p>` : ''}`;
  }
  function compFeedback(kind, title, extra = '', allowOverride = true) {
    const e = entryOf(current);
    const el = box.querySelector('#quiz-feedback');
    el.innerHTML = `<div class="explain ${kind}"><strong>${title}</strong>${modelAnswer(e, extra)}
      ${kind !== 'ok' && !compChoices && allowOverride ? '<button class="link" id="override">Mi respuesta estaba bien</button>' : ''}</div>`;
    el.querySelector('#override')?.addEventListener('click', overrideOk);
    const skip = box.querySelector('#quiz-skip');
    skip.textContent = 'Siguiente'; skip.className = 'btn';
    box.querySelector('.score').textContent = `${Math.round(score * 10) / 10} / ${total}${review ? ' · repaso' : ''}`;
    const st = stats(group);
    box.querySelector('.progress-line').innerHTML = `<div class="bar"><span style="width:${st.total ? Math.round((st.mastered / st.total) * 100) : 0}%"></span></div><span>${st.mastered}/${st.total} dominadas</span>`;
  }
  function answerComp() {
    if (!current || answered) return;
    const input = box.querySelector('#type-input');
    const e = entryOf(current);
    let grade, extra = '';
    if (mode === 'func') {
      const g = gradeConcepts(input.value, e);
      grade = g.grade;
      extra = `<p class="sub">Mencionaste ${g.hit} de ${g.total} ideas clave. Respuesta modelo:</p>`;
    } else {
      const g = gradeDisease(input.value, e);
      grade = g.grade;
      extra = g.match ? `<p class="sub">Sí: ${esc(g.match.nombre)}. Todas las frecuentes:</p>` : '<p class="sub">Las frecuentes son:</p>';
    }
    record(grade === 'ok' ? 1 : grade === 'almost' ? 0.5 : 0);
    input.disabled = true;
    input.classList.add(grade);
    compFeedback(grade, { ok: '¡Bien!', almost: 'Vas bien, pero te faltaron ideas', bad: mode === 'func' ? 'No del todo' : 'No es de las frecuentes' }[grade], extra);
  }
  function answerCompChoice(btn) {
    if (!current || answered) return;
    const e = entryOf(current);
    const ok = btn.dataset.copt === e.id;
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) btn.parentElement.querySelector(`[data-copt="${CSS.escape(e.id)}"]`)?.classList.add('ok');
    record(ok ? 0.5 + 0.5 : 0); // con opciones también cuenta, pero sin pistas
    compFeedback(ok ? 'ok' : 'bad', ok ? '¡Correcto!' : 'No:');
  }
  // si la calificación automática no reconoció una respuesta válida
  function overrideOk() {
    if (!lastRec) return;
    const r = { ...lastRec.prev };
    r.a++; r.c++; r.box = Math.min(r.box + 1, 4); r.t = Date.now();
    progress[lastRec.key] = r;
    saveProgress(progress);
    sync?.schedule();
    score += 1 - lastRec.points;
    lastRec.points = 1;
    const ex = box.querySelector('#quiz-feedback .explain');
    ex.className = 'explain ok';
    ex.querySelector('strong').textContent = 'Anotado como correcta';
    box.querySelector('#override')?.remove();
    box.querySelector('.score').textContent = `${Math.round(score * 10) / 10} / ${total}${review ? ' · repaso' : ''}`;
  }

  function hint() {
    if (!current || answered) return;
    hintLevel++;
    const name = baseName(current);
    const words = name.split(' ');
    // 1.ª pista: inicial de cada palabra; 2.ª: la mitad de cada palabra
    const shown = words.map((w) => {
      const k = hintLevel === 1 ? 1 : Math.ceil(w.length / 2);
      return w.slice(0, k) + '·'.repeat(Math.max(w.length - k, 0));
    }).join('  ');
    box.querySelector('#hint-text').textContent = shown;
  }

  // modo señalar: main.js llama a tap() con la pieza tocada
  function tap(id) {
    if (!TAP_MODES.has(mode) || !current || answered) return;
    const hit = id && body.byId.get(id);
    if (!hit) return; // tocar el fondo no cuenta
    let ok = hit.id === current.id || baseName(hit) === baseName(current);
    if (!ok && REVERSE.has(mode)) {
      // en fisiología/fisiopatología vale cualquier parte del mismo órgano (p. ej. un lóbulo del hígado)
      const ctx = clinica?.forContext(baseName(hit));
      ok = !!ctx && ctx.entry.id === entryOf(current).id;
    }
    if (REVERSE.has(mode)) {
      record(ok ? 1 : 0);
      revealTarget();
      compFeedback(ok ? 'ok' : 'bad', ok ? `¡Correcto! ${esc(baseName(current))}` : `Tocaste: ${esc(baseName(hit))}. Era: ${esc(baseName(current))}`, '', false);
      return;
    }
    record(ok ? 1 : 0);
    body.select(current.id);
    body.setOverlay(current.id);
    body.pulse(current.id, 1600);
    feedback(ok ? 'ok' : 'bad', ok ? '¡Correcto!' : `Tocaste: ${hit ? baseName(hit) : 'nada'}. Estaba aquí:`);
  }

  function showStats() {
    const rows = Object.entries(QUIZ_GROUPS).filter(([k]) => k !== 'all' && poolFor(k).length >= 4).map(([k, g]) => {
      const st = stats(k);
      const pct = st.total ? Math.round((st.mastered / st.total) * 100) : 0;
      return `<li><div class="st-head"><span>${g.label}</span><span>${st.mastered}/${st.total}</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <small>${st.seen} vistas · ${pct}% dominadas</small></li>`;
    }).join('');
    const all = Object.entries(progress).filter(([k]) => k.startsWith(`${sex}:`)).map(([, r]) => r);
    const att = all.reduce((a, r) => a + r.a, 0), cor = all.reduce((a, r) => a + r.c, 0);
    const me = profiles.current;
    box.innerHTML = `<h3>Progreso de ${esc(me?.name || '…')} <span class="sub">· cuerpo ${body.female ? 'femenino' : 'masculino'}</span></h3>
      <div class="people">${profiles.list.map((p) => `<button data-pid="${p.id}" class="${p.id === me?.id ? 'active' : ''}"><i style="background:${p.color}">${esc(p.name[0].toUpperCase())}</i>${esc(p.name)}</button>`).join('')}
        <button data-new class="add">+ Otra persona</button></div>
      <div class="section-title">Ruta de estudio</div>
      <ul class="stats stage-sum">${Object.entries(STAGES).map(([k, S]) => { const x = stats('all', k); const pc = x.total ? Math.round((x.mastered / x.total) * 100) : 0;
        return `<li><div class="st-head"><span>${S.n}. ${S.label}</span><span>${x.mastered}/${x.total}</span></div><div class="bar"><span style="width:${pc}%"></span></div><small>${S.hint} · ${pc}%</small></li>`; }).join('')}</ul>
      <div class="section-title">${STAGES[curStage()].label} por tema</div>
      <p class="sub">Una estructura queda "dominada" cuando la aciertas 2 veces seguidas.</p>
      <ul class="stats">${rows}</ul>
      <p class="sub">${att} respuestas en total · ${att ? Math.round((cor / att) * 100) : 0}% de aciertos</p>
      ${sync?.configured ? `<div class="backup cloud" id="account">${accountHtml(me)}</div>` : ''}
      <div class="backup">
        <div class="section-title">Copia de seguridad</div>
        <p class="sub">El progreso se guarda en este navegador. Haz una copia para pasarlo a otro dispositivo o por si se borran los datos.${me?.lastBackup ? ` Última copia: ${new Date(me.lastBackup).toLocaleDateString('es')}.` : ''}</p>
        <div class="row wrap">
          <button class="btn ghost" id="bk-file">Descargar archivo</button>
          <button class="btn ghost" id="bk-code">Copiar código</button>
          <button class="btn ghost" id="bk-restore">Restaurar</button>
        </div>
        <div id="bk-area"></div>
      </div>
      <div class="row"><button class="link danger" id="quiz-reset">Borrar progreso</button><button class="btn" id="quiz-back">Seguir practicando</button></div>`;
    box.querySelector('#quiz-back').addEventListener('click', next);
    box.querySelectorAll('[data-pid]').forEach((b) => b.addEventListener('click', () => { profiles.use(b.dataset.pid); progress = profiles.loadProgress(); showStats(); }));
    box.querySelector('[data-new]').addEventListener('click', () => showWelcome(true));
    box.querySelector('#bk-file').addEventListener('click', () => { profiles.downloadBackup(); showStats(); });
    wireAccount();
    box.querySelector('#bk-code').addEventListener('click', async () => {
      const code = await profiles.backupCode();
      const area = box.querySelector('#bk-area');
      area.innerHTML = '<textarea readonly rows="3"></textarea><p class="sub">Copiado. Pégalo en un chat contigo misma o en tus notas; en otro dispositivo usa «Restaurar».</p>';
      const ta = area.querySelector('textarea'); ta.value = code;
      try { await navigator.clipboard.writeText(code); } catch { ta.select(); }
      profiles.markBackup();
    });
    box.querySelector('#bk-restore').addEventListener('click', () => {
      const area = box.querySelector('#bk-area');
      area.innerHTML = `<textarea id="bk-in" rows="3" placeholder="Pega aquí el código (ATLAS1…)"></textarea>
        <div class="row wrap"><button class="btn" id="bk-go">Restaurar código</button><label class="btn ghost file">Elegir archivo<input type="file" id="bk-filein" accept=".json,application/json" hidden></label></div>
        <p class="sub" id="bk-msg"></p>`;
      const done = (r) => { progress = profiles.loadProgress(); box.querySelector('#bk-msg').textContent = `Listo: ${r.items} estructuras restauradas en el perfil de ${r.name}.`; setTimeout(showStats, 1400); };
      const fail = (e) => { box.querySelector('#bk-msg').textContent = 'No se pudo restaurar: ' + e.message; };
      area.querySelector('#bk-go').addEventListener('click', () => profiles.restore(area.querySelector('#bk-in').value).then(done, fail));
      area.querySelector('#bk-filein').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        profiles.restore(await f.text()).then(done, fail);
      });
    });
    box.querySelector('#quiz-reset').addEventListener('click', (e) => {
      if (e.target.dataset.confirm) {
        for (const k of Object.keys(progress)) if (k.startsWith(`${sex}:`)) delete progress[k];
        saveProgress(progress); showStats();
      } else { e.target.dataset.confirm = '1'; e.target.textContent = '¿Seguro? Toca otra vez para borrar'; }
    });
  }


  // --- cuenta (Cloudflare) ---------------------------------------------------------------
  let accTab = 'login', recoveryShown = null, recoveryTitle = 'Cuenta creada', accEmailOpen = false;
  function accountHtml(me) {
    if (recoveryShown) {
      return `<div class="section-title">${recoveryTitle}</div>
        <p class="sub">Guarda este <b>código de recuperación</b>: es la única forma de cambiar tu contraseña si la olvidas. Solo se muestra esta vez.</p>
        <div class="code-row"><code>${recoveryShown}</code><button class="btn ghost" id="rec-copy">Copiar</button></div>
        <div class="row wrap"><button class="btn" id="rec-done">Ya lo guardé</button></div><p class="sub" id="acc-msg"></p>`;
    }
    const acc = me?.account;
    if (acc && !acc.expired) {
      return `<div class="section-title">Cuenta</div>
        <p class="sub">Sesión iniciada como <b>${esc(acc.email)}</b>. Tu progreso se guarda solo en la nube.</p>
        <p class="sub" id="acc-msg">${me.lastSync ? `Último guardado: ${new Date(me.lastSync).toLocaleString('es')}` : 'Aún no se ha guardado.'}</p>
        <div class="row wrap"><button class="btn ghost" id="acc-sync">Sincronizar ahora</button><button class="link" id="acc-logout">Cerrar sesión</button></div>`;
    }
    const legacy = me?.sync && !acc;
    const tabs = { login: 'Iniciar sesión', register: 'Crear cuenta', reset: 'Olvidé mi contraseña' };
    const f = {
      login: `<input id="acc-email" type="email" placeholder="Correo" autocomplete="username" value="${esc(acc?.email || '')}">
        <input id="acc-pass" type="password" placeholder="Contraseña" autocomplete="current-password">
        <button class="btn" type="submit">Entrar</button>`,
      register: `<input id="acc-name" type="text" placeholder="Nombre" value="${esc(me?.named === false ? '' : (me?.name || ''))}" maxlength="40">
        <input id="acc-email" type="email" placeholder="Correo" autocomplete="username">
        <input id="acc-pass" type="password" placeholder="Contraseña (mínimo 8)" autocomplete="new-password">
        <button class="btn" type="submit">Crear cuenta</button>`,
      reset: `<input id="acc-email" type="email" placeholder="Correo" autocomplete="username">
        <input id="acc-rec" type="text" placeholder="Código de recuperación (XXXX-XXXX-XXXX)" autocapitalize="characters" spellcheck="false">
        <input id="acc-pass" type="password" placeholder="Contraseña nueva (mínimo 8)" autocomplete="new-password">
        <button class="btn" type="submit">Cambiar contraseña</button>`,
    };
    return `<div class="section-title">Cuenta</div>
      ${acc?.expired ? '<p class="sub warn">Tu sesión venció. Vuelve a iniciar sesión para seguir guardando en la nube.</p>'
        : `<p class="sub">${legacy ? `Usas el código <b>${esc(me.sync)}</b>. Crea una cuenta para entrar con correo y contraseña.` : `Inicia sesión para guardar el progreso de ${esc(me?.name || 'esta persona')} en la nube y usarlo en cualquier dispositivo.`}</p>`}
      ${sync.google ? '<div class="g-btn" id="g-btn"></div><p class="sub" id="acc-msg"></p><details class="old-code" id="acc-email-box"' + (accEmailOpen ? ' open' : '') + '><summary>Usar correo y contraseña</summary>' : ''}
      <div class="seg acc-tabs">${Object.entries(tabs).map(([k, l]) => `<button data-acctab="${k}" class="${k === accTab ? 'active' : ''}">${l}</button>`).join('')}</div>
      <form class="acc-form" id="acc-form" autocomplete="on">${f[accTab]}</form>
      ${sync.google ? '</details>' : '<p class="sub" id="acc-msg"></p>'}
      ${legacy ? '' : `<details class="old-code"><summary>Tengo un código de sincronización</summary>
        <form class="type-answer" id="sync-join" autocomplete="off"><input id="sync-input" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false"><button class="btn ghost" type="submit">Entrar</button></form></details>`}`;
  }
  function wireAccount() {
    const el = box.querySelector('#account');
    if (!el) return;
    const msg = (t) => { const m = box.querySelector('#acc-msg'); if (m) m.textContent = t; };
    const val = (id) => box.querySelector(id)?.value || '';
    el.querySelectorAll('[data-acctab]').forEach((b) => b.addEventListener('click', () => { accTab = b.dataset.acctab; accEmailOpen = true; showStats(); }));
    const gEl = box.querySelector('#g-btn');
    if (gEl) {
      renderGoogleButton(gEl, async (credential) => {
        msg('Entrando con Google…');
        try { await sync.loginGoogle(credential); progress = profiles.loadProgress(); showStats(); } catch (err) { msg(err.message); }
      }).catch((err) => { gEl.remove(); msg(err.message + '. Usa tu correo.'); });
    }
    box.querySelector('#acc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; msg(accTab === 'register' ? 'Creando la cuenta…' : 'Entrando…');
      try {
        if (accTab === 'login') await sync.login(val('#acc-email'), val('#acc-pass'));
        if (accTab === 'register') { const r = await sync.register(val('#acc-email'), val('#acc-pass'), val('#acc-name')); recoveryShown = r.recovery; recoveryTitle = 'Cuenta creada'; }
        if (accTab === 'reset') { const r = await sync.reset(val('#acc-email'), val('#acc-rec'), val('#acc-pass')); recoveryShown = r.recovery; recoveryTitle = 'Contraseña cambiada: este es tu nuevo código de recuperación'; }
        progress = profiles.loadProgress();
        showStats();
      } catch (err) { msg(err.message); btn.disabled = false; }
    });
    box.querySelector('#rec-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(recoveryShown); msg('Copiado. Guárdalo en tus notas o en un chat contigo misma.'); } catch { msg('Cópialo a mano.'); }
    });
    box.querySelector('#rec-done')?.addEventListener('click', () => { recoveryShown = null; showStats(); });
    box.querySelector('#acc-sync')?.addEventListener('click', async () => { msg('Sincronizando…'); await sync.pull(); await sync.push(); progress = profiles.loadProgress(); showStats(); });
    box.querySelector('#acc-logout')?.addEventListener('click', async (e) => {
      if (!e.target.dataset.confirm) { e.target.dataset.confirm = '1'; e.target.textContent = 'Tu progreso queda guardado en la nube. ¿Cerrar sesión? Toca otra vez'; return; }
      await sync.logout(); showStats();
    });
    box.querySelector('#sync-join')?.addEventListener('submit', async (e) => {
      e.preventDefault(); msg('Buscando tu progreso…');
      try { const r = await sync.join(val('#sync-input')); progress = profiles.loadProgress(); msg(`Listo: ${r.items} estructuras de ${r.name}.`); setTimeout(showStats, 1200); }
      catch (err) { msg(err.message); }
    });
  }

  function showWelcome(adding = false) {
    box.innerHTML = `<h3>${adding ? 'Nueva persona' : '¿Quién va a estudiar?'}</h3>
      <p class="sub">Cada persona guarda su propio progreso en este dispositivo.</p>
      <form class="type-answer" id="who-form" autocomplete="off">
        <input id="who-name" type="text" placeholder="Tu nombre" maxlength="24" enterkeyhint="done">
        <button class="btn" type="submit">Empezar</button>
      </form>
      ${adding ? '<button class="link" id="who-cancel">Cancelar</button>' : ''}
      ${sync?.google && !adding ? '<div class="or">o</div><div class="g-btn" id="who-google"></div><p class="sub" id="who-msg"></p>' : ''}
      ${sync?.configured ? '<p class="sub">¿Ya tienes cuenta? <button class="link" id="who-login">Inicia sesión</button></p>' : ''}`;
    box.querySelector('#who-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = box.querySelector('#who-name').value.trim();
      if (!name) return;
      if (adding || !profiles.current) profiles.add(name); else profiles.rename(name);
      progress = profiles.loadProgress();
      next();
    });
    box.querySelector('#who-cancel')?.addEventListener('click', showStats);
    const wg = box.querySelector('#who-google');
    if (wg) {
      renderGoogleButton(wg, async (credential) => {
        box.querySelector('#who-msg').textContent = 'Entrando con Google…';
        try { await sync.loginGoogle(credential); progress = profiles.loadProgress(); next(); }
        catch (err) { box.querySelector('#who-msg').textContent = err.message; }
      }).catch(() => wg.remove());
    }
    box.querySelector('#who-login')?.addEventListener('click', () => { accTab = 'login'; showStats(); setTimeout(() => box.querySelector('#account')?.scrollIntoView({ block: 'start' }), 50); });
    if (!matchMedia('(max-width: 899px)').matches) box.querySelector('#who-name').focus();
  }

  return {
    next, tap,
    start() {
      saved = body.snapshot();
      progress = profiles.loadProgress();
      if (sync?.active) sync.pull().then((changed) => { if (changed) progress = profiles.loadProgress(); });
      if (profiles.needsName()) { stage(poolFor(group)[0] || body.catalog.parts[0]); showWelcome(); } else next();
    },
    stop() { if (saved) body.restore(saved); saved = null; current = null; body.select(null); body.setOverlay(null); },
    get current() { return current; },
    get mode() { return mode; },
    get tapMode() { return TAP_MODES.has(mode) && !compChoices; },
  };
}
