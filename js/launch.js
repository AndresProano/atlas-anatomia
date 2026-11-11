// Lanzamiento público: aviso educativo, formulario de opiniones, botón de donación (PayPal) y analítica sin cookies.
import { DONATE_URL, CF_ANALYTICS_TOKEN } from './config.js?v=7c754a0a';
import { syncUrl } from './sync.js?v=7c754a0a';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HEART = '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>';

export const hasDonate = () => !!DONATE_URL;
export function donateHtml(text = '¿Te sirve el atlas? Ayúdame a mantenerlo gratis.') {
  if (!DONATE_URL) return '';
  return `<a class="donate" href="${esc(DONATE_URL)}" target="_blank" rel="noopener">${HEART}<span>${esc(text)}</span><b>Donar con PayPal o tarjeta</b></a>`;
}

export function setupLaunch({ toast }) {
  // 1) analítica sin cookies (solo si hay token)
  if (CF_ANALYTICS_TOKEN && !/^(127\.|localhost)/.test(location.hostname)) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token: CF_ANALYTICS_TOKEN });
    document.head.appendChild(s);
  }

  // 2) aviso educativo, una sola vez
  if (!store.get('atlas-aviso')) {
    const n = document.createElement('div');
    n.className = 'notice';
    n.setAttribute('role', 'note');
    n.innerHTML = '<p><b>Material educativo.</b> Sirve para estudiar anatomía y fisiología; no reemplaza el consejo de un médico ni sirve para diagnosticar.</p><button class="btn">Entendido</button>';
    n.querySelector('button').addEventListener('click', () => { store.set('atlas-aviso', '1'); n.remove(); });
    document.body.appendChild(n);
  }

  // 3) opiniones
  const dlg = document.createElement('dialog');
  dlg.className = 'feedback';
  dlg.innerHTML = `
    <form method="dialog">
      <h2>Danos tu opinión</h2>
      <p class="muted">¿Encontraste un error, te falta algo o tienes una idea? Lo leo todo.</p>
      <div class="fb-kind" role="group" aria-label="Tipo">
        <button type="button" data-kind="error" class="active">Algo falla</button>
        <button type="button" data-kind="contenido">Dato médico incorrecto</button>
        <button type="button" data-kind="idea">Idea</button>
        <button type="button" data-kind="otro">Otro</button>
      </div>
      <textarea name="text" rows="5" maxlength="2000" placeholder="Cuéntame qué pasó o qué te gustaría ver…" required></textarea>
      <input name="contact" maxlength="120" placeholder="Tu correo o usuario (opcional, si quieres respuesta)" autocomplete="email">
      <p class="fb-status" aria-live="polite"></p>
      <div class="fb-btns">
        <button type="button" class="btn ghost" data-close>Cerrar</button>
        <button type="submit" class="btn" data-send>Enviar</button>
      </div>
      <div class="fb-donate">${donateHtml()}</div>
    </form>`;
  document.body.appendChild(dlg);
  let kind = 'error';
  const status = dlg.querySelector('.fb-status');
  dlg.querySelector('.fb-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    kind = b.dataset.kind;
    dlg.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('active', x === b));
  });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // tocar fuera cierra
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, text = f.text.value.trim();
    if (text.length < 3) { status.textContent = 'Escribe tu opinión.'; return; }
    const mode = document.body.dataset.mode || '';
    const sub = mode === 'physio' ? document.querySelector('#physio-box h2')?.textContent : '';
    const send = f.querySelector('[data-send]');
    send.disabled = true; status.textContent = 'Enviando…';
    try {
      const r = await fetch(`${syncUrl()}/v1/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, kind, contact: f.contact.value, where: `${mode}${sub ? ': ' + sub : ''}`, v: window.ATLAS_V || '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo enviar');
      f.reset();
      status.textContent = '';
      dlg.close();
      toast?.('¡Gracias! Tu opinión llegó.', 3000);
    } catch (err) {
      status.textContent = `${err.message}. Revisa tu conexión e intenta de nuevo.`;
    } finally { send.disabled = false; }
  });
  document.querySelector('#feedback-btn')?.addEventListener('click', () => { status.textContent = ''; dlg.showModal(); });
}
