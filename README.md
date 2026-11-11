# Atlas Anatómico 3D

**Sitio publicado:** https://andresproano.github.io/atlas-anatomia/

Atlas 3D del cuerpo humano para estudio personal (no comercial). Junta en un solo visor web varias bases de datos anatómicas abiertas:

| Fuente | Qué aporta | Licencia |
|---|---|---|
| [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) (DBCLS) | 2.228 piezas 3D del cuerpo completo, ligadas a la ontología FMA | CC BY-SA 2.1 JP |
| [HuBMAP Human Reference Atlas](https://humanatlas.io/3d-reference-library) | 81 órganos detallados ♀/♂ con subestructuras (se cargan desde su CDN) | CC BY 4.0 |
| [Z-Anatomy](https://github.com/LluisV/Z-Anatomy) | ~7.300 términos inglés → español / latín | CC BY-SA 4.0 |
| Wikipedia | Resumen de cada estructura, en vivo (español, o inglés si no hay) | CC BY-SA 4.0 |

Visible Human Project, Open Anatomy, NIH 3D, BioDigital, Pulse, BioGears y OpenSim aparecen en la pestaña **Fuentes** como recursos complementarios (son volúmenes de imagen o motores de simulación, no mallas).

## Funciones

- **Cuerpo completo**: 12 sistemas con color, visibilidad y opacidad por sistema; capas rápidas (esqueleto, músculos, órganos, vasos, nervios); arterias rojas y venas azules.
- Clic en cualquier pieza → ficha con nombre en español, inglés, latín, ID FMA, volumen y resumen de Wikipedia. Doble clic centra. Teclas `H` ocultar, `I` aislar, `F` centrar, `Esc` limpiar.
- **Buscador** en español, inglés o latín (sin tildes). Si la pieza está debajo de los músculos, estos se vuelven semitransparentes.
- **Corte** sagital, coronal o axial con deslizador (también en órganos).
- **Órganos en detalle** (HuBMAP): riñón con pirámides y papilas, corazón, ojo, útero, ovarios, mama, placenta, etc.
- **Abrir órgano**: al tocar una pieza del corazón, encéfalo, ojos, hígado, páncreas o vía aérea aparece «Abrir…»: el órgano queda aislado y se puede ver **entero**, **cortado a la mitad** (corte coronal con deslizador) o con las **partes separadas** (vista explotada), con etiquetas y la lista de sus partes. «Ver en detalle» lleva al órgano de HuBMAP (para el riñón es la única opción, porque en BodyParts3D es una sola pieza).
- **Quiz**: se resalta una estructura y eliges su nombre entre 4 opciones; filtrable por sistema.

## Fisiología en movimiento (pestaña Fisiología)

Animaciones sobre el mismo cuerpo 3D, con pasos narrados, cámara automática, pausa y velocidad (`web/js/physio.js`, contenido en `web/js/physio-data.js`):

- **Circulación**: sangre oxigenada (rojo) y pobre en O₂ (azul) por aorta, carótidas, brazos, piernas, riñones, cavas y circuito pulmonar; pulso al ritmo del latido, ECG y frecuencia cardiaca ajustable.
- **Corazón**: latido (aurículas y luego ventrículos), flujo por cavidades, válvulas y coronarias.
- **Respiración**: el diafragma baja, los pulmones se inflan, aire que entra y sale por tráquea y bronquios; frecuencia ajustable.
- **Cerebro y nervios**: impulsos de la vía visual, de la orden motora (corteza → bulbo → médula → bíceps) y del tacto (dedo → tálamo → corteza); mapa de funciones del cerebro.
- **Digestión**: el bolo recorre boca → esófago → estómago → intestinos → recto; bilis y jugo pancreático.
- **Riñones**: sangre que entra y sale, orina por uréteres hasta la vejiga.

**Para estudiantes de medicina** (simple a propósito: un botón y tres líneas de texto):

- **Sano / enfermo** en 4 procesos: infarto y fibrilación auricular (Corazón), asma (Respiración), ACV derecho (Cerebro) y cálculo renal (Riñones). La animación cambia (zona sin oxígeno, ECG con ST elevado o sin onda P, ritmo irregular, bronquios cerrados, impulso que se apaga, orina que se acumula) y una tarjeta dice qué pasa, qué siente el paciente y en qué fijarse.
- **Diagrama de Wiggers** en Corazón: ECG, presiones de aorta, ventrículo y aurícula izquierdos, volumen del ventrículo, S1/S2 y fracción de eyección, sincronizados con el latido. Botón 🔊 para escuchar el «lub-dub».
- **Casos clínicos**: 7 pacientes cortos; se elige entre 4 opciones, se ilumina la estructura en el modelo, se explica el porqué y hay un botón para ver la animación de esa enfermedad.

`node scripts/test-physio.mjs` comprueba que todos los nombres que usa el módulo existan en los catálogos del hombre y la mujer.

Las rutas se calculan desde la geometría real: de cada pieza nombrada (p. ej. «Left femoral artery») se saca su línea central
(vóxeles → grafo → camino más largo) y se encadenan, cortando en los empalmes en T. BodyParts3D no tiene médula espinal,
nervios periféricos ni pulmones como malla: la médula se dibuja por el canal de las vértebras, el nervio del brazo junto a la
arteria y los pulmones como envolvente del árbol bronquial (esquemas, se avisa en el panel).

## Cuerpo femenino («mujer de atlas»)

La mujer es un modelo de estudio, no el cuerpo de una persona concreta (`npm run female`):

1. **Base:** el cuerpo completo de BodyParts3D (huesos, músculos, órganos, vasos, nervios, piel).
2. **Proporciones femeninas medias** (ANSUR II): estatura ×0,928, hombros más estrechos, tórax algo más estrecho,
   cintura más estrecha, caderas y glúteos más llenos.
3. **Pelvis femenina real** (Visible Human Female, Univ. de Denver, CC BY 4.0), escalada a una anchura biilíaca media,
   colocada por los acetábulos (sobre las cabezas femorales), sacro y sínfisis, con la misma inclinación del plano
   pélvico anterior que el hombre. Los músculos que se insertan en la pelvis la siguen (ICP no rígido simétrico).
4. Todo se deforma con thin-plate spline (`textbook_female.py`). Se quitan los genitales masculinos y se añaden útero,
   ovarios, trompas, vagina y mamas de HuBMAP; la piel cubre las mamas y se alisa la zona genital.

Para regenerar hace falta la geometría de Denver: descargar "Final 3D STL Models" de
https://digitalcommons.du.edu/visiblehuman/1/ (no admite descargas automáticas) y descomprimir en `data-raw/du-vhf/stl/`.

## Estructura

```
web/                 sitio estático (esto es lo que se publica)
  index.html, styles.css, js/*.js
  models/<sistema>.glb   18 MB en total (meshopt + cuantizado)
  data/parts.json        catálogo de piezas
  data/hubmap.json       catálogo de órganos HuBMAP
  data/terms.json        diccionario inglés → español/latín
scripts/
  download.sh        baja los datos crudos a data-raw/ (no versionado)
  classify.py        clasifica piezas por sistema (FMA is_a + part_of) y traduce
  build-models.mjs   OBJ → GLB por sistema (gltf-transform + meshoptimizer)
  build-female.mjs   HuBMAP united-female → f-<sistema>.glb
  du_import.py, textbook_female.py, build-female-textbook.mjs   mujer de atlas (ver arriba)
  hubmap.py, terms.py, serve.py
```

## Reconstruir desde cero

```sh
npm install
sh scripts/download.sh
npm run data      # parts.json, terms.json, hubmap.json
npm run models    # web/models/*.glb
npm run serve     # http://127.0.0.1:5173
```

**Publicar cambios:** hacer commit y luego `npm run publish`. Copia `web/` a la rama `gh-pages`, que GitHub Pages sirve en https://andresproano.github.io/atlas-anatomia/.

## Licencia

Los modelos derivados de BodyParts3D y los términos de Z-Anatomy se redistribuyen bajo **CC BY-SA**, con atribución:
"BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan".
Material educativo de referencia; puede contener errores y no sirve para diagnóstico.
