// Página de fuentes y créditos.
const INTEGRATED = [
  {
    name: 'BodyParts3D', badge: 'Cuerpo completo',
    lic: 'CC BY-SA 2.1 Japón · Database Center for Life Science (DBCLS)',
    text: '2.228 piezas 3D del cuerpo humano ligadas a la ontología FMA. Son la base del modo "Cuerpo completo": se convirtieron de OBJ a GLB comprimido, clasificadas por sistema con los árboles is_a y part_of.',
    url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    credit: '"BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan".',
  },
  {
    name: 'HuBMAP Human Reference Atlas', badge: 'Órganos en detalle',
    lic: 'CC BY 4.0 · HuBMAP / Indiana University CNS',
    text: 'Del cuerpo femenino de referencia (Visible Human Female, «united-female») salen el útero, los ovarios, las trompas, la vagina y las mamas de la mujer del atlas; y 81 órganos de referencia con subestructuras en el modo Órganos.',
    url: 'https://humanatlas.io/3d-reference-library',
  },
  {
    name: 'Visible Human Female — Universidad de Denver', badge: 'Pelvis femenina',
    lic: 'CC BY 4.0 · Center for Orthopaedic Biomechanics, University of Denver',
    text: 'Pelvis, sacro y cóccix reales de una mujer, segmentados de los cortes del Visible Human. La mujer del atlas es el cuerpo de BodyParts3D con proporciones femeninas medias (estatura, hombros, cintura, caderas) y esta pelvis femenina; músculos, vasos y nervios se adaptan a ella. Es un modelo de estudio, no el cuerpo de una persona concreta.',
    url: 'https://doi.org/10.56902/COB.vh.2022.0',
    credit: 'Andreassen TE et al. "Three-dimensional lower extremity musculoskeletal geometry of the Visible Human Female and Male." Scientific Data 10:34 (2023), doi:10.1038/s41597-022-01905-2.',
  },
  {
    name: 'Z-Anatomy', badge: 'Nombres en español',
    lic: 'CC BY-SA 4.0 · Lluís Vinent / Gauthier Kervyn',
    text: 'Diccionario de ~7.300 términos anatómicos en inglés, latín, francés, español y portugués. De aquí salen los nombres en español y latín.',
    url: 'https://github.com/LluisV/Z-Anatomy',
  },
  {
    name: 'Wikipedia', badge: 'Descripciones',
    lic: 'CC BY-SA 4.0',
    text: 'La ficha de cada estructura busca en vivo el resumen del artículo en Wikipedia en español (o en inglés si no existe).',
    url: 'https://es.wikipedia.org',
  },
];

const EXTERNAL = [
  {
    name: 'Visible Human Project (NLM)', lic: 'Gratis, licencia NLM',
    text: 'Cortes reales de criosección, CT y MRI de un hombre y una mujer. Son volúmenes de imagen, no mallas 3D: ideal para estudiar cortes transversales junto al modo "Corte" de este atlas.',
    url: 'https://www.nlm.nih.gov/research/visible/visible_human.html',
  },
  {
    name: 'Open Anatomy Project', lic: 'Abierta · Harvard SPL',
    text: 'Atlas de cerebro, cabeza y cuello, abdomen y rodilla segmentados desde imágenes médicas, con visor web propio.',
    url: 'https://www.openanatomy.org',
  },
  {
    name: 'NIH 3D', lic: 'Varía por modelo',
    text: 'Biblioteca de modelos médicos y biológicos (órganos, proteínas, anatomía) para ver o imprimir en 3D.',
    url: 'https://3d.nih.gov',
  },
  {
    name: 'BioDigital Human', lic: 'Freemium',
    text: 'Plataforma web parecida a Visible Body, con plan gratis. Útil para comparar y para animaciones de patologías.',
    url: 'https://human.biodigital.com',
  },
  {
    name: 'Pulse Physiology Engine', lic: 'Apache 2.0 · Kitware', tag: 'Simulación',
    text: 'Simula fisiología de todo el cuerpo: cardiovascular, respiratorio, fármacos, hemorragias. Es un motor C++ con explorador de escritorio.',
    url: 'https://pulse.kitware.com',
  },
  {
    name: 'BioGears', lic: 'Apache 2.0', tag: 'Simulación',
    text: 'Motor de fisiología humana similar a Pulse, orientado a entrenamiento médico.',
    url: 'https://www.biogearsengine.com',
  },
  {
    name: 'OpenSim', lic: 'Apache 2.0 · Stanford', tag: 'Simulación',
    text: 'Simulación musculoesquelética: músculos, articulaciones y movimiento.',
    url: 'https://simtk.org/projects/opensim',
  },
];

const card = (s) => `
  <div class="card">
    <h3>${s.name}${s.badge ? `<span class="badge">${s.badge}</span>` : ''}${s.tag ? `<span class="badge">${s.tag}</span>` : ''}</h3>
    <p class="lic">${s.lic}</p>
    <p>${s.text}</p>
    ${s.credit ? `<p class="muted" style="font-size:12px">${s.credit}</p>` : ''}
    <a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname} →</a>
  </div>`;

import { donateHtml } from './launch.js?v=9d8bd228';

export function renderSources(el) {
  el.innerHTML = `
    <h2>Fuentes de datos</h2>
    <p>Este atlas es gratuito y junta varias bases de datos anatómicas abiertas en un solo visor.
    Visible Body y Complete Anatomy no publican sus datos, así que todo lo que ves viene de proyectos con licencia libre.</p>
    <p class="notice-inline"><b>Material educativo.</b> No reemplaza el consejo de un médico ni sirve para diagnosticar. Las animaciones de fisiología son esquemas simplificados.
    Si encuentras un error, usa el botón de opinión (arriba) para avisarme.</p>
    ${donateHtml('El atlas es gratis. Si te sirve, puedes ayudar a mantenerlo.')}
    <div class="cards">${INTEGRATED.map(card).join('')}</div>
    <h2>Otras fuentes recomendadas</h2>
    <p>Recursos que no se integran en el visor porque son otro tipo de dato (volúmenes de imagen, motores de simulación) o tienen licencia propia, pero sirven para profundizar.</p>
    <div class="cards">${EXTERNAL.map(card).join('')}</div>
    <p class="muted" style="font-size:12px">Licencia del atlas: los modelos derivados de BodyParts3D y los términos de Z-Anatomy se comparten bajo CC BY-SA.
    Los datos son de referencia educativa y pueden contener errores; no usar para diagnóstico.</p>`;
}
