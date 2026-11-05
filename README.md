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

HuBMAP (Visible Human Female) trae los órganos, la columna, la pelvis y las piernas de una mujer real, pero no
el cráneo, las costillas, la cintura escapular, los brazos, las manos, los pies ni casi ningún músculo. Esas piezas
se toman de BodyParts3D y se **ajustan a su cuerpo** (`npm run female`):

1. Puntos de referencia emparejados entre ambos cuerpos: vértebras, sacro, esternón, coxales, fémur/tibia/peroné,
   y secciones de la piel a alturas equivalentes (tronco, cuello, cabeza, muslos, piernas, brazos, pies),
   descontando la grasa subcutánea.
2. Los brazos del hombre (colgando) se articulan en hombro, codo y muñeca hacia la postura de ella (abiertos).
3. Deformación suave (thin-plate spline) de todas las piezas y limpieza final: lo que queda fuera de la piel se
   empuja hacia dentro.
4. `female_check.py` informa qué se sale de la piel y `female_stretch.py` qué piezas se estiraron demasiado.

Resultado: +202 huesos, +416 músculos y +29 cartílagos/ligamentos (1590 piezas). Las proporciones de esas piezas
son aproximadas: vienen de un cuerpo masculino adaptado, no de una disección femenina.

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
  female_fit.py, build-female-complete.mjs   completa el cuerpo femenino (ver arriba)
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
