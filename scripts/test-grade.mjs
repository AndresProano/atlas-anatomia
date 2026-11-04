// Prueba de la calificación de respuestas escritas del quiz (web/js/quiz.js).
// Uso: node scripts/test-grade.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js', 'quiz.js');
const src = fs.readFileSync(file, 'utf8');
const code = src.slice(src.indexOf('const STOP'), src.indexOf('// --- progreso')).replace(/export /g, '');
const { gradeText } = new Function(`${code}; return { gradeText };`)();

const femur = { es: 'Hueso Fémur (izq.)', la: 'Os femoris', en: 'Left femur' };
const pec = { es: 'Músculo pectoral mayor (der.)', la: 'Musculus pectoralis major', en: 'Right pectoralis major' };
const vasto = { es: 'Músculo vasto lateral (der.)', la: 'Musculus vastus lateralis', en: 'Right vastus lateralis' };
const cases = [
  [femur, 'femur', 'ok'], [femur, 'fémur', 'ok'], [femur, 'os femoris', 'ok'], [femur, 'femr', 'almost'], [femur, 'tibia', 'bad'],
  [pec, 'pectoral mayor', 'ok'], [pec, 'musculo pectoral mayor', 'ok'], [pec, 'pectoralis major', 'ok'], [pec, 'pectoral mallor', 'ok|almost'],
  [pec, 'pectoral menor', 'bad'], [pec, 'pectoralis minor', 'bad'], [pec, 'pectoral', 'bad|almost'], [vasto, 'vasto lateral', 'ok'], [vasto, 'vasto medial', 'bad'], [vasto, '', 'bad'],
];
let fails = 0;
for (const [p, input, exp] of cases) {
  const r = gradeText(input, p);
  const pass = exp.split('|').includes(r.grade);
  if (!pass) fails++;
  console.log(pass ? 'OK   ' : 'FALLA', JSON.stringify(input).padEnd(26), '->', r.grade, r.score.toFixed(2), `(esperado ${exp})`);
}
console.log(fails ? `${fails} fallas` : 'todos pasan');
process.exit(fails ? 1 : 0);
