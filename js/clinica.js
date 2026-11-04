// Base clínica (función, enfermedades, dato de examen) y calificación de respuestas de concepto.
// Datos: web/data/clinica.json — contenido educativo; verificar con la bibliografía de la carrera.
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\((izq|der)\.?\)/g, ' ').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function loadClinica(version = '') {
  let list = [];
  try { list = await fetch(`data/clinica.json?v=${version}`).then((r) => (r.ok ? r.json() : [])); } catch { /* sin datos */ }
  const byName = new Map();
  for (const e of list) {
    for (const n of e.nombres || []) {
      const k = norm(n);
      byName.set(k, e);
      // alias sin "hueso"/"músculo" ("Cabeza del fémur" -> "Hueso Fémur")
      const bare = k.replace(/^(hueso|musculo) /, '');
      if (bare !== k && !byName.has(bare)) byName.set(bare, e);
    }
  }
  return {
    list,
    // entrada para una pieza (por su nombre sin lado)
    forName(name) { return byName.get(norm(name)) || null; },
    // para la ficha: si la pieza es parte de un órgano de la base ("Lóbulo caudado del hígado"), usar el órgano
    forContext(name) {
      const n = norm(name);
      const exact = byName.get(n);
      if (exact) return { entry: exact, parent: false };
      let best = null;
      for (const [k, e] of byName) {
        if (k.length >= 4 && (n.endsWith(` ${k}`) || n.includes(` ${k} `)) && (!best || k.length > best.k.length)) best = { k, e };
      }
      return best ? { entry: best.e, parent: true } : null;
    },
  };
}

// Respuesta libre sobre la función: cuenta cuántos grupos de ideas clave aparecen.
export function gradeConcepts(text, entry) {
  const t = ` ${norm(text)} `;
  const groups = entry.conceptos || [];
  if (!norm(text) || !groups.length) return { grade: 'bad', hit: 0, total: groups.length };
  const hit = groups.filter((g) => g.some((w) => w && t.includes(norm(w)))).length;
  const need = Math.max(1, Math.ceil(groups.length * 0.6));
  const grade = hit >= need ? 'ok' : hit >= 1 ? 'almost' : 'bad';
  return { grade, hit, total: groups.length };
}

// "Nombra una enfermedad de…": vale cualquiera de la lista (o sus sinónimos).
export function gradeDisease(text, entry) {
  const t = norm(text);
  if (t.length < 3) return { grade: 'bad', match: null };
  for (const d of entry.enfermedades || []) {
    const keys = [d.nombre, ...(d.claves || [])].map(norm).filter(Boolean);
    if (keys.some((k) => t.includes(k) || (t.length >= 5 && k.includes(t)))) return { grade: 'ok', match: d };
  }
  return { grade: 'bad', match: null };
}
