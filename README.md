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
- **Quiz**: se resalta una estructura y eliges su nombre entre 4 opciones; filtrable por sistema.

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
