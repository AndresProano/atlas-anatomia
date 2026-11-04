"""Diccionario inglés -> [español, latín] para el navegador (Z-Anatomy + traducciones propias).

Uso: python -I scripts/terms.py <data-raw> <salida terms.json>
"""
import json
import os
import sys

raw, out = sys.argv[1], sys.argv[2]
t = {}
for line in open(os.path.join(raw, "za", "Translations0.txt"), encoding="utf-8").read().splitlines()[1:]:
    c = line.split(";")
    if len(c) >= 4 and c[0].strip() and c[3].strip():
        t.setdefault(c[0].strip().lower(), [c[3].strip(), c[1].strip()])
extra = os.path.join(raw, "traducciones_es.json")
if os.path.exists(extra):
    for k, v in json.load(open(extra, encoding="utf-8")).items():
        t.setdefault(k.lower().strip(), [v, ""])
json.dump(t, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("términos:", len(t))
