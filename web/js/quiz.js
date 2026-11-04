// Quiz: se muestra solo la capa de la pregunta (con el esqueleto tenue de referencia),
// se resalta una estructura conocida y hay que elegir su nombre entre 4 opciones.
import { displayName } from './body.js?v=d68bc1b1';

export const QUIZ_GROUPS = {
  all: { label: 'Todo el cuerpo', systems: ['esqueletico', 'muscular', 'digestivo', 'respiratorio', 'urogenital', 'endocrino', 'cardiovascular', 'nervioso'] },
  huesos: { label: 'Huesos', systems: ['esqueletico'] },
  musculos: { label: 'Músculos', systems: ['muscular'] },
  organos: { label: 'Órganos', systems: ['digestivo', 'respiratorio', 'urogenital', 'endocrino'] },
  vasos: { label: 'Corazón y vasos', systems: ['cardiovascular'] },
  nervios: { label: 'Sistema nervioso', systems: ['nervioso'] },
};
// qué se ve en pantalla según el sistema de la pregunta
const SCENE = {
  esqueletico: { show: ['esqueletico', 'articular'] },
  muscular: { show: ['esqueletico', 'muscular'] },
  cardiovascular: { show: ['esqueletico', 'cardiovascular'], ghost: ['esqueletico'] },
  nervioso: { show: ['esqueletico', 'nervioso'], ghost: ['esqueletico'] },
};
const ORGANS = { show: ['esqueletico', 'digestivo', 'respiratorio', 'urogenital', 'endocrino', 'cardiovascular'], ghost: ['esqueletico'] };

export function createQuiz(body, box, { onAnswer } = {}) {
  let score = 0, total = 0, group = 'all', current = null, saved = null;
  const baseName = (p) => displayName(p).replace(/\s*\((izq|der)\.\)/, '');

  // estructuras "de examen": con nombre latino (vienen de Z-Anatomy) y de tamaño visible
  function pool() {
    const sys = QUIZ_GROUPS[group].systems;
    return body.catalog.parts.filter((p) => p.es && p.la && body.meshes.has(p.id) && body.state.loaded.has(p.system)
      && sys.includes(p.system) && (p.vol ?? 0) >= 1.5);
  }
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  function stage(p) {
    const sc = SCENE[p.system] || ORGANS;
    for (const s of body.order) {
      body.setSystemVisible(s, sc.show.includes(s));
      body.setSystemOpacity(s, sc.ghost?.includes(s) ? 0.22 : 1);
    }
    body.showAll();
  }

  function next() {
    const ps = pool();
    if (ps.length < 4) {
      box.innerHTML = '<h3>Preparando el quiz…</h3><p class="sub">Los modelos se están cargando. Inténtalo en unos segundos.</p>';
      return;
    }
    current = rand(ps);
    const same = ps.filter((p) => p.system === current.system && baseName(p) !== baseName(current));
    const others = same.length >= 3 ? same : ps.filter((p) => baseName(p) !== baseName(current));
    const opts = new Set([baseName(current)]);
    while (opts.size < 4 && others.length) opts.add(baseName(others.splice(Math.floor(Math.random() * others.length), 1)[0]));
    stage(current);
    body.select(current.id);
    body.setOverlay(current.id);
    body.focus(current.id, 5);
    setTimeout(() => body.pulse(current.id, 2200), 450);
    render([...opts].sort(() => Math.random() - 0.5));
  }

  function render(options) {
    box.innerHTML = `
      <h3>¿Qué estructura está resaltada?</h3>
      <p class="sub">${QUIZ_GROUPS[group].label} · toca el modelo para girarlo</p>
      <div class="opts">${options.map((o) => `<button data-opt="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}</div>
      <div class="row">
        <span class="score">${score} / ${total}</span>
        <select id="quiz-group" aria-label="Tema del quiz">
          ${Object.entries(QUIZ_GROUPS).map(([k, g]) => `<option value="${k}" ${k === group ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select>
        <button class="btn ghost" id="quiz-skip">Saltar</button>
      </div>`;
    box.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => answer(b)));
    box.querySelector('#quiz-skip').addEventListener('click', next);
    box.querySelector('#quiz-group').addEventListener('change', (e) => { group = e.target.value; next(); });
  }

  function answer(btn) {
    const opts = btn.parentElement;
    if (!current || opts.dataset.done) return;
    opts.dataset.done = '1';
    const right = baseName(current);
    const ok = btn.dataset.opt === right;
    total++; if (ok) score++;
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) opts.querySelector(`[data-opt="${CSS.escape(right)}"]`)?.classList.add('ok');
    box.querySelector('.score').textContent = `${score} / ${total}`;
    const ex = document.createElement('div');
    ex.className = 'explain';
    ex.innerHTML = `<strong>${ok ? '¡Correcto!' : 'Era: ' + right}</strong><em>${current.la}</em>`;
    opts.after(ex);
    const skip = box.querySelector('#quiz-skip');
    skip.textContent = 'Siguiente';
    skip.className = 'btn';
    body.pulse(current.id, 1200);
    onAnswer?.(current, ok);
  }

  return {
    next,
    start() { saved = body.snapshot(); next(); },
    stop() { if (saved) body.restore(saved); saved = null; current = null; body.select(null); body.setOverlay(null); },
    get current() { return current; },
  };
}
