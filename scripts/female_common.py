"""Carga de volcados (scripts/female-dump.mjs) y catálogos, compartida por el ajuste y los gráficos."""
import json
import os

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def catalogs():
    male = json.load(open(os.path.join(ROOT, "web/data/parts.json"), encoding="utf-8"))["parts"]
    female = json.load(open(os.path.join(ROOT, "web/data/female.json"), encoding="utf-8"))["parts"]
    return {p["id"]: p for p in male}, {p["id"]: p for p in female}


class Dump:
    """Vértices por pieza de un GLB volcado: d[name] -> (n,3)."""

    def __init__(self, ddir, base):
        self.idx = json.load(open(os.path.join(ddir, base + ".json")))
        self.all = np.fromfile(os.path.join(ddir, base + ".bin"), dtype=np.float32).reshape(-1, 3).astype(np.float64)
        self.by = {}
        for e in self.idx:
            self.by.setdefault(e["name"], []).append(self.all[e["off"]:e["off"] + e["n"]])

    def get(self, name):
        return np.concatenate(self.by[name]) if name in self.by else None

    def names(self):
        return list(self.by)


def find(cat, dump, pred):
    """Vértices de todas las piezas del volcado cuyo registro de catálogo cumple pred(p)."""
    arrs = [dump.get(n) for n in dump.names() if n in cat and pred(cat[n])]
    arrs = [a for a in arrs if a is not None]
    return np.concatenate(arrs) if arrs else None


def inside_grid(ddir, H=0.003):
    """Rejilla booleana del interior del cuerpo femenino (piel voxelizada, agujeros cerrados y rellena)."""
    from scipy import ndimage
    skin = Dump(ddir, "f-piel").all
    tri = np.fromfile(os.path.join(ddir, "f-piel.tri.bin"), dtype=np.uint32).reshape(-1, 3)
    lo = skin.min(0) - 0.02
    shape = np.ceil((skin.max(0) + 0.02 - lo) / H).astype(int) + 1
    grid = np.zeros(shape, bool)
    # rasterizar triángulos muestreando su superficie con paso < H
    A, B, C = skin[tri[:, 0]], skin[tri[:, 1]], skin[tri[:, 2]]
    L = np.maximum.reduce([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - A, axis=1), np.linalg.norm(C - B, axis=1)])
    steps_all = np.maximum(1, np.ceil(L / (H * 0.6)).astype(int))
    for steps in np.unique(steps_all):
        m = steps_all == steps
        a, b, c = A[m], B[m], C[m]
        for i in range(steps + 1):
            for j in range(steps + 1 - i):
                p = a + (b - a) * (i / steps) + (c - a) * (j / steps)
                q = np.floor((p - lo) / H).astype(int)
                grid[q[:, 0], q[:, 1], q[:, 2]] = True
    # cerrar agujeros de la malla de piel, rellenar y devolver el tamaño
    CL = 3
    inside = ndimage.binary_fill_holes(ndimage.binary_dilation(grid, iterations=CL))
    inside = ndimage.binary_erosion(inside, iterations=CL) | grid
    return inside, lo, shape
