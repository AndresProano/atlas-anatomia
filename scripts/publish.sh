#!/usr/bin/env sh
# Publica web/ en GitHub Pages: copia el contenido de web/ a la rama gh-pages y la sube.
# Uso: sh scripts/publish.sh   (después de hacer commit de los cambios)
set -e
cd "$(dirname "$0")/.."
# sellar versión (?v=hash) para que los celulares no usen archivos viejos en caché
python -I scripts/stamp.py
if ! git diff --quiet -- web; then
  git add web
  git commit -q -m "Sello de versión para publicar"
fi
git subtree split --prefix web -b gh-pages-tmp
git push origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp
echo "Publicado: https://andresproano.github.io/atlas-anatomia/ (tarda ~1 min en actualizarse)"
