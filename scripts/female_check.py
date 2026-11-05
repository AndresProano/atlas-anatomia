"""Control de calidad del ajuste: qué piezas deformadas se salen de la piel femenina.

Voxeliza la piel (rejilla de 3 mm), rellena el interior y mide, por pieza, la fracción de vértices fuera.
Uso: python scripts/female_check.py <dump-dir> <fit-dir> [umbral=0.05]
"""
import os
import sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from female_common import Dump, catalogs, inside_grid  # noqa: E402

D, FIT = sys.argv[1], sys.argv[2]
TH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
H = 0.003
inside, lo, shape = inside_grid(D, H)
print("volumen interior: %.1f L" % (inside.sum() * H ** 3 * 1000))

mcat, _ = catalogs()
report = []
for base in ["esqueletico", "muscular", "articular"]:
    dm = Dump(D, base)
    W = np.fromfile(os.path.join(FIT, base + ".warped.bin"), dtype=np.float32).reshape(-1, 3)
    q = np.clip(np.floor((W - lo) / H).astype(int), 0, np.array(shape) - 1)
    ins = inside[q[:, 0], q[:, 1], q[:, 2]]
    tot_out = 1 - ins.mean()
    print(f"{base}: {100 * tot_out:.2f}% de vértices fuera de la piel")
    for e in dm.idx:
        o = 1 - ins[e["off"]:e["off"] + e["n"]].mean()
        if o > TH:
            report.append((o, base, mcat.get(e["name"], {}).get("en", e["name"])))
for o, b, n in sorted(report, reverse=True)[:40]:
    print(f"  {100 * o:5.1f}%  {b:12s} {n}")
print("piezas con >%.0f%% fuera: %d" % (TH * 100, len(report)))
