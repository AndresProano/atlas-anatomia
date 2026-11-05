#!/usr/bin/env sh
# Recupera del historial los archivos femeninos ORIGINALES de HuBMAP (antes de construir la mujer de atlas),
# porque el proceso los usa como fuente y los publicados ya son la versión final.
set -e
cd "$(dirname "$0")/.."
mkdir -p data-raw/female-hubmap
for f in f-esqueletico f-piel f-reproductor; do
  git show 5926d36:web/models/$f.glb > data-raw/female-hubmap/$f.glb
done
git show 5926d36:web/data/female.json > data-raw/female-hubmap/female.json
echo "originales HuBMAP en data-raw/female-hubmap/"
