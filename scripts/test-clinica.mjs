// Prueba de la calificación de preguntas de comprensión (web/js/clinica.js).
// Uso: node scripts/test-clinica.mjs
import { gradeConcepts, gradeDisease } from '../web/js/clinica.js';

const corazon = {
  conceptos: [['bombe', 'impuls', 'bomba', 'contra', 'late'], ['sangre'], ['cuerpo', 'organismo', 'circulac', 'tejidos', 'pulmon', 'arteria']],
  enfermedades: [
    { nombre: 'Infarto agudo de miocardio', claves: ['infarto', 'iam', 'ataque cardiaco', 'ataque al corazon'] },
    { nombre: 'Insuficiencia cardíaca', claves: ['insuficiencia cardiaca', 'falla cardiaca'] },
  ],
};
const higado = {
  conceptos: [['metabol', 'procesa', 'desintoxic', 'toxina', 'filtra'], ['bilis', 'digest', 'grasa'], ['gluc', 'glucogeno', 'proteina', 'almacena', 'reserva']],
  enfermedades: [{ nombre: 'Cirrosis hepática', claves: ['cirrosis'] }, { nombre: 'Hepatitis', claves: ['hepatitis'] }, { nombre: 'Hígado graso', claves: ['higado graso', 'esteatosis'] }],
};
const cases = [
  ['f', corazon, 'Bombea la sangre a todo el cuerpo', 'ok'],
  ['f', corazon, 'bombea sangre', 'ok'],
  ['f', corazon, 'se encarga de la circulación', 'almost'],
  ['f', corazon, 'sirve para pensar', 'bad'],
  ['f', higado, 'produce bilis y desintoxica la sangre', 'ok'],
  ['f', higado, 'ayuda en la digestión', 'almost'],
  ['d', corazon, 'infarto', 'ok'],
  ['d', corazon, 'un ataque al corazón', 'ok'],
  ['d', corazon, 'falla cardíaca', 'ok'],
  ['d', corazon, 'asma', 'bad'],
  ['d', higado, 'Cirrosis', 'ok'],
  ['d', higado, 'esteatosis hepática', 'ok'],
  ['d', higado, 'hep', 'bad'],
];
let fails = 0;
for (const [kind, e, text, exp] of cases) {
  const r = kind === 'f' ? gradeConcepts(text, e) : gradeDisease(text, e);
  const ok = r.grade === exp;
  if (!ok) fails++;
  console.log(ok ? 'OK   ' : 'FALLA', kind, JSON.stringify(text).padEnd(40), '->', r.grade, `(esperado ${exp})`);
}
console.log(fails ? `${fails} fallas` : 'todos pasan');
process.exit(fails ? 1 : 0);
