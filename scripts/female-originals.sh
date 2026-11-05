#!/usr/bin/env sh
# Recupera el esqueleto y el catálogo femenino originales de HuBMAP (antes de completarlo) desde el historial,
# porque el ajuste se calcula siempre sobre ellos y los archivos publicados ya llevan piezas sustituidas.
set -e
cd "$(dirname "$0")/.."
mkdir -p data-raw/female-hubmap
git show 5926d36:web/models/f-esqueletico.glb > data-raw/female-hubmap/f-esqueletico.glb
git show 5926d36:web/data/female.json > data-raw/female-hubmap/female.json
echo "originales HuBMAP en data-raw/female-hubmap/"
