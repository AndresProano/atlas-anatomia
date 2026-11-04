// Quiz con tres tipos de pregunta y progreso guardado en el navegador:
//  - Opciones: se resalta una estructura y eliges su nombre entre 4.
//  - Escribir: se resalta una estructura y escribes el nombre (se califica con tolerancia).
//  - Señalar: te dan el nombre y tocas la estructura en el modelo.
// Repetición espaciada (cajas de Leitner): lo que fallas vuelve antes, lo que dominas sale menos.
import { displayName } from './body.js?v=3fd73cb6';

export const QUIZ_GROUPS = {
  all: { label: 'Todo el cuerpo', systems: ['esqueletico', 'muscular', 'digestivo', 'respiratorio', 'urogenital', 'reproductor', 'endocrino', 'cardiovascular', 'nervioso'] },
  huesos: { label: 'Huesos', systems: ['esqueletico'] },
  musculos: { label: 'Músculos', systems: ['muscular'] },
  organos: { label: 'Órganos', systems: ['digestivo', 'respiratorio', 'urogenital', 'endocrino'] },
  reproductor: { label: 'Aparato reproductor', systems: ['reproductor'] },
  vasos: { label: 'Corazón y vasos', systems: ['cardiovascular'] },
  nervios: { label: 'Sistema nervioso', systems: ['nervioso'] },
};
const MODES = { choice: 'Opciones', type: 'Escribir', point: 'Señalar' };
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
const KEY = 'atlas-progress-v1';
function loadProgress() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function saveProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }
const WEIGHT = [6, 3, 1.5, 0.6, 0.25]; // caja 0 (nuevo/fallado) … caja 4 (dominado)
const MASTERED = 2; // a partir de esta caja cuenta como dominado

export function createQuiz(body, box, { onAnswer } = {}) {
  let score = 0, total = 0, group = 'all', mode = 'choice', review = false;
  let current = null, saved = null, answered = false, hintLevel = 0;
  const progress = loadProgress();
  const sex = body.female ? 'F' : 'M';
  const baseName = (p) => displayName(p).replace(/\s*\((izq|der)\.\)/, '');
  const keyOf = (p) => `${sex}:${baseName(p)}`;
  const rec = (p) => progress[keyOf(p)] || { a: 0, c: 0, box: 0 };

  // estructuras "de examen": con nombre conocido y tamaño visible
  function poolFor(g) {
    const sys = QUIZ_GROUPS[g].systems;
    return body.catalog.parts.filter((p) => p.es && (p.la || body.female) && body.meshes.has(p.id) && body.state.loaded.has(p.system)
      && sys.includes(p.system) && (p.vol ?? 0) >= 1.5);
  }
  // un elemento por nombre (izquierdo y derecho cuentan como uno)
  function uniqueByName(list) {
    const seen = new Map();
    for (const p of list) if (!seen.has(baseName(p))) seen.set(baseName(p), p);
    return [...seen.values()];
  }
  function stats(g) {
    const u = uniqueByName(poolFor(g));
    const mastered = u.filter((p) => rec(p).box >= MASTERED).length;
    const seen = u.filter((p) => rec(p).a > 0).length;
    return { total: u.length, mastered, seen };
  }

  function pickWeighted(list) {
    const ws = list.map((p) => WEIGHT[Math.min(rec(p).box, 4)]);
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
    if (mode === 'point') {
      const big = ps.filter((p) => (p.vol ?? 0) >= (p.system === 'esqueletico' ? 3 : 8));
      if (big.length >= 4) ps = big;
    }
    if (review) {
      const failed = ps.filter((p) => { const r = rec(p); return r.a > 0 && r.box < MASTERED; });
      if (failed.length) ps = failed;
      else { review = false; }
    }
    if (ps.length < 4) {
      box.innerHTML = '<h3>Preparando el quiz…</h3><p class="sub">Los modelos se están cargando. Inténtalo en unos segundos.</p>';
      return;
    }
    // evitar repetir la misma estructura dos veces seguidas
    const prev = current && baseName(current);
    let cand = pickWeighted(ps);
    for (let i = 0; i < 5 && baseName(cand) === prev; i++) cand = pickWeighted(ps);
    current = cand;
    stage(current);
    if (mode === 'point') {
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
    return `
      <div class="seg quiz-modes">${Object.entries(MODES).map(([k, l]) => `<button data-mode="${k}" class="${k === mode ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="progress-line">
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span>${st.mastered}/${st.total} dominadas</span>
      </div>`;
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
    box.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => answerChoice(b)));
    box.querySelector('#quiz-skip').addEventListener('click', next);
    box.querySelector('#quiz-group').addEventListener('change', (e) => { group = e.target.value; next(); });
    box.querySelector('#quiz-review').addEventListener('click', () => { review = !review; next(); });
    box.querySelector('#quiz-stats').addEventListener('click', showStats);
    box.querySelector('#type-form')?.addEventListener('submit', (e) => { e.preventDefault(); answerText(); });
    box.querySelector('#quiz-hint')?.addEventListener('click', hint);
  }

  // --- registrar resultado ------------------------------------------------------------------
  function record(points) {
    const r = rec(current);
    r.a++;
    if (points >= 1) { r.c++; r.box = Math.min(r.box + 1, 4); }
    else if (points > 0) { r.box = Math.max(r.box, 1); }
    else r.box = 0;
    r.t = Date.now();
    progress[keyOf(current)] = r;
    saveProgress(progress);
    total++; score += points;
    answered = true;
    onAnswer?.(current, points >= 1);
  }
  function feedback(kind, title) {
    const el = box.querySelector('#quiz-feedback');
    el.innerHTML = `<div class="explain ${kind}"><strong>${title}</strong>
      <span>${baseName(current)}</span>${current.la ? `<em>${current.la}</em>` : ''}</div>`;
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
    feedback(ok ? 'ok' : 'bad', ok ? '¡Correcto!' : 'Era:');
    body.pulse(current.id, 1200);
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
    if (mode !== 'point' || !current || answered) return;
    const hit = id && body.byId.get(id);
    if (!hit) return; // tocar el fondo no cuenta
    const ok = hit.id === current.id || baseName(hit) === baseName(current);
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
    box.innerHTML = `<h3>Mi progreso <span class="sub">· cuerpo ${body.female ? 'femenino' : 'masculino'}</span></h3>
      <p class="sub">Una estructura queda "dominada" cuando la aciertas 2 veces seguidas. Se guarda en este navegador.</p>
      <ul class="stats">${rows}</ul>
      <p class="sub">${att} respuestas en total · ${att ? Math.round((cor / att) * 100) : 0}% de aciertos</p>
      <div class="row"><button class="link danger" id="quiz-reset">Borrar progreso</button><button class="btn" id="quiz-back">Seguir practicando</button></div>`;
    box.querySelector('#quiz-back').addEventListener('click', next);
    box.querySelector('#quiz-reset').addEventListener('click', (e) => {
      if (e.target.dataset.confirm) {
        for (const k of Object.keys(progress)) if (k.startsWith(`${sex}:`)) delete progress[k];
        saveProgress(progress); showStats();
      } else { e.target.dataset.confirm = '1'; e.target.textContent = '¿Seguro? Toca otra vez para borrar'; }
    });
  }

  return {
    next, tap,
    start() { saved = body.snapshot(); next(); },
    stop() { if (saved) body.restore(saved); saved = null; current = null; body.select(null); body.setOverlay(null); },
    get current() { return current; },
    get mode() { return mode; },
  };
}
