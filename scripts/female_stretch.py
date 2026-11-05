"""Control de calidad: piezas cuyas aristas se estiraron mucho con el ajuste (pliegues/láminas).
Uso: python scripts/female_stretch.py <dump-dir> <fit-dir> [n=25]
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from female_common import Dump, catalogs  # noqa: E402

D, FIT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 25
mcat, _ = catalogs()
rows = []
for base in ["esqueletico", "muscular", "articular"]:
    dm = Dump(D, base)
    tri = np.fromfile(os.path.join(D, base + ".tri.bin"), dtype=np.uint32).reshape(-1, 3)
    W = np.fromfile(os.path.join(FIT, base + ".warped.bin"), dtype=np.float32).reshape(-1, 3).astype(float)
    P = dm.all
    e0 = np.concatenate([np.linalg.norm(P[tri[:, a]] - P[tri[:, b]], axis=1) for a, b in ((0, 1), (1, 2), (2, 0))])
    e1 = np.concatenate([np.linalg.norm(W[tri[:, a]] - W[tri[:, b]], axis=1) for a, b in ((0, 1), (1, 2), (2, 0))])
    owner = np.concatenate([tri[:, 0]] * 3)
    starts = np.array([e["off"] for e in dm.idx]); names = [e["name"] for e in dm.idx]
    part = np.searchsorted(starts, owner, side="right") - 1
    ratio = e1 / np.maximum(e0, 1e-6)
    for k in np.unique(part):
        m = part == k
        r = np.quantile(ratio[m], 0.99)
        rows.append((r, ratio[m].max(), base, mcat.get(names[k], {}).get("en", names[k])))
rows.sort(reverse=True)
for r, mx, b, n in rows[:N]:
    print(f"p99 x{r:5.2f}  máx x{mx:6.2f}  {b:12s} {n}")
