// Resumen de Wikipedia (primero en español, si no en inglés). Las APIs permiten CORS con origin=*.
const cache = new Map();

function clean(name) {
  // en las cavidades del corazón el lado importa (ventrículo izquierdo ≠ derecho ≠ tercer ventrículo del cerebro)
  const keepSide = /ventr|atri|aur[ií]cul/i.test(name || '');
  return (name || '')
    .replace(/\s*\((izq|der)\.\)/gi, '')
    .replace(keepSide ? /^$/ : /^(left|right)\s+/i, '')
    .replace(keepSide ? /^$/ : /\b(izquierd[oa]|derech[oa])\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['musculo', 'muscle', 'hueso', 'bone', 'arteria', 'artery', 'vena', 'vein', 'nervio', 'nerve', 'porcion', 'parte', 'part', 'right', 'left']);
const words = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 6)); // raíz aproximada
function relevant(title, q) {
  const t = new Set(words(title));
  const qs = words(q);
  // artículos de patologías no describen la estructura
  if (/^(fractura|luxaci|s[ií]ndrome|enfermedad|c[aá]ncer|tumor|fracture|syndrome|disease|cancer)/i.test(title)) return false;
  // al menos la mitad de las palabras importantes deben coincidir (antes bastaba una: «Cavidad del ventrículo» → «Tercer ventrículo»)
  return !qs.length || qs.filter((w) => t.has(w)).length >= Math.ceil(qs.length / 2);
}

async function search(lang, q) {
  const u = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(q)}`;
  const r = await fetch(u);
  const j = await r.json();
  return j?.query?.search?.[0]?.title || null;
}

async function summary(lang, title) {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  if (!r.ok) return null;
  const j = await r.json();
  if (j.type === 'disambiguation' || !j.extract) return null;
  return { lang, title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page, thumb: j.thumbnail?.source };
}

export async function wikiFor({ es, en }) {
  const key = `${es}|${en}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const tries = [];
    // "Porción clavicular del deltoides" -> buscar también el todo ("deltoides")
    const whole = (s, rx) => { const m = clean(s).match(rx); return m ? m[m.length - 1] : null; };
    const esWhole = es && whole(es, /^(porci[oó]n|cabeza|vientre|parte|rama|segmento|afluente|cuerpo)\b.*?\b(de la|del|de los|de las|de)\s+(.+)$/i);
    const enWhole = en && whole(en, /^.*?\b(part|head|belly|branch|segment|tributary|portion)\s+of\s+(the\s+)?(.+)$/i);
    // las partes no suelen tener artículo propio: primero el todo
    if (esWhole) tries.push(['es', esWhole]);
    if (es) tries.push(['es', clean(es)]);
    if (enWhole) tries.push(['en', enWhole]);
    if (en) tries.push(['en', clean(en)]);
    for (const [lang, q] of tries) {
      if (!q) continue;
      try {
        const title = await search(lang, q);
        if (!title || !relevant(title, q)) continue;
        const s = await summary(lang, title);
        if (s) return s;
      } catch { /* sin red: probar la siguiente */ }
    }
    return null;
  })();
  cache.set(key, p);
  return p;
}

export function renderWiki(target, srcEl, data) {
  if (!data) {
    target.innerHTML = '<p class="muted">No se encontró un artículo para esta estructura.</p>';
    srcEl.textContent = '';
    return;
  }
  srcEl.textContent = data.lang === 'es' ? '· Wikipedia' : '· Wikipedia (inglés)';
  target.replaceChildren();
  if (data.thumb) {
    const img = document.createElement('img');
    img.src = data.thumb; img.alt = data.title; img.loading = 'lazy';
    target.append(img);
  }
  const p = document.createElement('p');
  p.textContent = data.extract;
  const a = document.createElement('a');
  a.href = data.url; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = `Leer «${data.title}» en Wikipedia →`;
  const note = document.createElement('p');
  note.className = 'muted';
  note.style.fontSize = '12px';
  note.textContent = 'Resumen automático por búsqueda: verifica que el artículo corresponda a la estructura.';
  target.append(p, a, note);
}
