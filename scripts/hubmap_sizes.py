"""Peso (bytes) de cada GLB de HuBMAP vía HEAD: python -I scripts/hubmap_sizes.py <reference-organs.json> <sizes.json>"""
import json, sys, urllib.request, concurrent.futures as cf
d = json.load(open(sys.argv[1], encoding="utf-8"))
def size(o):
    u = o["object"]["file"]
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, method="HEAD"), timeout=20)
        return int(r.headers.get("Content-Length", 0)), u
    except Exception as e:
        return -1, u
with cf.ThreadPoolExecutor(16) as ex:
    res = sorted(ex.map(size, d))
out = {u: s for s, u in res}
json.dump(out, open(sys.argv[2], "w"), indent=0)
for s, u in res[-10:]:
    print(f"{s/1e6:.1f}MB", u.rsplit("/", 1)[-1])
print("total MB", round(sum(max(s, 0) for s, _ in res) / 1e6, 1), "fallos", sum(1 for s, _ in res if s < 0))
