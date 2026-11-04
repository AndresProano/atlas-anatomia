#!/usr/bin/env sh
# Descarga los datos crudos a data-raw/ (no se versionan; ~210 MB comprimidos, ~470 MB descomprimidos).
set -e
cd "$(dirname "$0")/.."
B=https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST
mkdir -p data-raw/bp3d data-raw/za data-raw/hubmap
cd data-raw/bp3d
for f in partof_parts_list_e.txt partof_inclusion_relation_list.txt partof_element_parts.txt \
         isa_parts_list_e.txt isa_inclusion_relation_list.txt isa_element_parts.txt isa_BP3D_4.0_obj_99.zip; do
  [ -f "$f" ] || curl -fsSLO "$B/$f"
done
[ -d obj_isa ] || (mkdir obj_isa && cd obj_isa && unzip -q ../isa_BP3D_4.0_obj_99.zip)
cd ../za
[ -f Translations0.txt ] || curl -fsSL https://raw.githubusercontent.com/LluisV/Z-Anatomy/PC-Version/Resources/Translations0.txt -o Translations0.txt
cd ../hubmap
curl -fsSL https://apps.humanatlas.io/api/v1/reference-organs -o reference-organs.json
python -I ../../scripts/hubmap_sizes.py reference-organs.json sizes.json
echo "Listo. Siguiente: npm run data && npm run models"
