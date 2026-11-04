"""Lista los nombres de subestructuras de todos los órganos HuBMAP leyendo solo el JSON de cada GLB
(con descargas parciales Range, sin bajar las mallas).

Uso: python -I scripts/hubmap_names.py <hubmap.json> <salida nombres.txt>
"""
import concurrent.futures as cf
import json
import re
import struct
import sys
import urllib.request

organs = json.load(open(sys.argv[1], encoding="utf-8"))


def get(url, start, end):
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    return urllib.request.urlopen(req, timeout=60).read()


def names(o):
    try:
        head = get(o["url"], 0, 19)
        jlen = struct.unpack("<I", head[12:16])[0]
        js = json.loads(get(o["url"], 20, 20 + jlen - 1))
        return [n.get("name", "") for n in js.get("nodes", [])]
    except Exception as e:
        print("fallo", o["id"], e, file=sys.stderr)
        return []


def parse(raw):  # igual que parseNodeName en web/js/organs.js
    s = re.sub(r"^(VH|Allen|SBU|NIH|SBU_[A-Z])_?[FM]?_", "", raw or "", flags=re.I)
    s = re.sub(r"^[FM]_", "", s)
    s = re.sub(r"[._-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\b(L|R)\b(\s+[a-z]{1,2})?$", "", s, flags=re.I).strip()
    s = re.sub(r"\s+[a-z]$", "", s, flags=re.I)
    s = re.sub(r"\s+\d+$", "", s).strip()
    s = re.sub(r"^(left|right)\s+", "", s, flags=re.I)
    return s.lower()


with cf.ThreadPoolExecutor(12) as ex:
    allnames = [n for lst in ex.map(names, organs) for n in lst]
keys = sorted({parse(n) for n in allnames if parse(n)})
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(keys))
print("nodos:", len(allnames), "| claves únicas:", len(keys))
