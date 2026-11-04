// Quiz: se resalta una estructura y hay que elegir su nombre entre 4 opciones del mismo sistema.
import { displayName } from './body.js';

export function createQuiz(body, box, { onAnswer, onQuestion } = {}) {
  let score = 0, total = 0, system = 'all', current = null;

  function pool() {
    return body.catalog.parts.filter((p) => p.es && body.meshes.has(p.id) && body.state.loaded.has(p.system)
      && (system === 'all' || p.system === system) && (p.vol ?? 1) > 0.05);
  }
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const baseName = (p) => displayName(p).replace(/\s*\((izq|der)\.\)/, '');

  function next() {
    const ps = pool();
    if (ps.length < 4) {
      box.innerHTML = '<p>Todavía se están cargando los modelos… prueba en unos segundos.</p>';
      return;
    }
    current = rand(ps);
    const sameSys = ps.filter((p) => p.system === current.system && baseName(p) !== baseName(current));
    const opts = new Map([[baseName(current), current]]);
    while (opts.size < 4 && sameSys.length) {
      const o = sameSys.splice(Math.floor(Math.random() * sameSys.length), 1)[0];
      if (!opts.has(baseName(o))) opts.set(baseName(o), o);
    }
    const shuffled = [...opts.keys()].sort(() => Math.random() - 0.5);
    body.reveal(current.id);
    onQuestion?.(current);
    body.select(current.id);
    body.focus(current.id, 3.2);
    render(shuffled);
  }

  function render(options) {
    const systems = body.order.filter((s) => body.catalog.parts.some((p) => p.system === s && p.es));
    box.innerHTML = `
      <h3>¿Qué estructura está resaltada?</h3>
      <div class="opts">${options.map((o) => `<button data-opt="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}</div>
      <div class="row">
        <span class="muted">Aciertos: <strong>${score}</strong> / ${total}</span>
        <span>
          <select id="quiz-sys" aria-label="Sistema del quiz">
            <option value="all">Todos los sistemas</option>
            ${systems.map((s) => `<option value="${s}" ${s === system ? 'selected' : ''}>${body.systems[s]}</option>`).join('')}
          </select>
          <button id="quiz-skip" class="small">Saltar</button>
        </span>
      </div>`;
    box.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => answer(b, options)));
    box.querySelector('#quiz-skip').addEventListener('click', next);
    box.querySelector('#quiz-sys').addEventListener('change', (e) => { system = e.target.value; next(); });
  }

  function answer(btn) {
    if (!current || btn.parentElement.dataset.done) return;
    btn.parentElement.dataset.done = '1';
    const ok = btn.dataset.opt === baseName(current);
    total++; if (ok) score++;
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) box.querySelector(`[data-opt="${CSS.escape(baseName(current))}"]`)?.classList.add('ok');
    box.querySelector('.muted strong').textContent = score;
    box.querySelector('.muted').lastChild.textContent = ` / ${total}`;
    onAnswer?.(current, ok);
    const nb = document.createElement('button');
    nb.textContent = 'Siguiente →';
    nb.className = 'active';
    nb.addEventListener('click', next);
    box.querySelector('.row span:last-child').prepend(nb);
  }

  return { next, get current() { return current; } };
}
