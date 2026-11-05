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

## Cuerpo femenino completo

La mujer combina tres fuentes, de más real a más aproximada:

1. **HuBMAP** (Visible Human Female): órganos, mamas, aparato reproductor, cerebro, columna, vasos y piel.
2. **Universidad de Denver** ([Andreassen et al. 2023](https://doi.org/10.1038/s41597-022-01905-2), CC BY 4.0):
   cadera y piernas **reales de la misma mujer** — pelvis completa, fémur, tibia, peroné, rótula, pie, 38 músculos por
   lado, cartílagos y ligamentos de rodilla. `du_import.py` las alinea hueso a hueso con HuBMAP (que colocó las
   piernas más separadas) y gira los pies (el cadáver los tiene en punta).
3. **BodyParts3D adaptado** (aproximado): cráneo, costillas, cintura escapular, brazos, manos y músculos de tronco,
   cuello, cabeza y brazos. `female_fit.py` los ajusta con puntos de referencia (huesos comunes, pelvis real, secciones
   de piel descontando la grasa), articula los brazos hacia su postura, deforma con thin-plate spline y empuja hacia
   dentro lo que se sale de la piel.

Para regenerar: descargar "Final 3D STL Models" de https://digitalcommons.du.edu/visiblehuman/1/ (el sitio no admite
descargas automáticas), descomprimir en `data-raw/du-vhf/stl/` y ejecutar `npm run female`.
Controles de calidad: `female_check.py` (qué se sale de la piel) y `female_stretch.py` (qué se estiró demasiado).

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
  du_import.py, female_fit.py, build-female-complete.mjs   completan el cuerpo femenino (ver arriba)
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
