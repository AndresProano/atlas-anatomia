"""Importa la geometría real de cadera y piernas de la Visible Human Female (Universidad de Denver, CC BY 4.0)
y la alinea con el cuerpo HuBMAP (misma mujer) mediante una transformación de semejanza (giro+escala+traslación).

Datos: https://doi.org/10.56902/COB.vh.2022.0  (carpeta "Final 3D STL Models" con Left/ y Right/)
Uso: python scripts/du_import.py <carpeta-stl> <dump-dir> <salida-dir>
Salida: <salida-dir>/du.bin (float32 xyz por vértice) + du.tri.bin (uint32) + du.json (piezas) + du_transform.json
"""
import glob
import json
import os
import re
import struct
import sys

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from female_common import Dump, catalogs  # noqa: E402

SRC, DUMP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)


def read_stl(f):
    b = open(f, "rb").read()
    if b[:5] == b"solid" and b"facet" in b[:400]:
        v = np.array([list(map(float, ln.split()[1:4])) for ln in b.decode().splitlines() if ln.strip().startswith("vertex")])
    else:
        n = struct.unpack("<I", b[80:84])[0]
        a = np.frombuffer(b[84:84 + n * 50], dtype=np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")]))
        v = a["v"].reshape(-1, 3).astype(float)
    # soldar vértices repetidos (STL guarda cada triángulo suelto)
    q = np.round(v, 4)
    uniq, inv = np.unique(q, axis=0, return_inverse=True)
    return uniq, inv.reshape(-1, 3).astype(np.uint32)


parts = []
for f in sorted(glob.glob(os.path.join(SRC, "*", "VHF_*_*.stl"))):
    m = re.match(r"VHF_(Left|Right)_(Bone|Muscle|Cartilage|Ligament)_(\w+?)_smooth\.stl", os.path.basename(f))
    if not m:
        continue
    v, t = read_stl(f)
    parts.append(dict(side=m[1], kind=m[2], name=m[3], v=v, t=t))
print("piezas leídas:", len(parts))

# --- correspondencias con HuBMAP (huesos comunes) ---------------------------------------------
_, fcat = catalogs()
fe = Dump(DUMP, "f-esqueletico")


def hub(pred):
    arr = [fe.get(n) for n in fe.names() if n in fcat and pred(fcat[n]["en"])]
    return np.concatenate(arr) if arr else None


def ends(v, up):
    t = v @ up; lo, hi = np.quantile(t, [0.04, 0.96])
    return v[t <= lo].mean(0), v[t >= hi].mean(0)


UP_DU, UP_H = np.array([0, 0, 1.0]), np.array([0, 1.0, 0])


def umeyama(A, B):
    """Semejanza B ≈ s R A + t (mínimos cuadrados, rotación propia)."""
    ma, mb = A.mean(0), B.mean(0); a, b = A - ma, B - mb
    U, S, Vt = np.linalg.svd(b.T @ a / len(A))
    d = np.sign(np.linalg.det(U @ Vt)); D = np.diag([1, 1, d])
    R = U @ D @ Vt; s = np.trace(np.diag(S) @ D) / (a ** 2).sum(1).mean()
    return s, R, mb - s * R @ ma


best = None
for mirror in (False, True):  # ¿"Left" de Denver = x>0 o x<0 en HuBMAP?
    A, B = [], []
    for side in ("Left", "Right"):
        hs = (1 if side == "Left" else -1) * (-1 if mirror else 1)
        for bn, hn in (("Femur", "femur"), ("Tibia", "tibia"), ("Fibula", "fibula"), ("Patella", "patella")):
            d = next(p for p in parts if p["side"] == side and p["name"] == bn)["v"]
            h = hub(lambda en, hn=hn: en.lower().startswith(hn)); h = h[np.sign(h[:, 0]) == hs]
            A += [d.mean(0), *ends(d, UP_DU)]; B += [h.mean(0), *ends(h, UP_H)]
    s, R, t = umeyama(np.array(A), np.array(B))
    res = np.linalg.norm((s * (R @ np.array(A).T).T + t) - np.array(B), axis=1).mean()
    print(f"espejo={mirror}: escala {s:.5f}, residuo medio {res * 1000:.1f} mm")
    if best is None or res < best[0]:
        best = (res, s, R, t)
_, s, R, t = best

# --- ajuste por hueso ----------------------------------------------------------------------------
# HuBMAP colocó las piernas más separadas (postura estándar) que el cadáver; por eso cada hueso común se
# ajusta por separado (rígido, escala global fija) y luego todo se deforma suavemente entre ellos.
from scipy.interpolate import RBFInterpolator

G = lambda v: s * (R @ v.T).T + t  # transformación global


def rigid(A, B):
    ma, mb = A.mean(0), B.mean(0)
    U, _, Vt = np.linalg.svd((B - mb).T @ (A - ma))
    D = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    Rr = U @ D @ Vt
    return Rr, mb - Rr @ ma


def icp(src, dst, iters=40, trim=0.85):
    tree = cKDTree(dst); Rr, tt = np.eye(3), np.zeros(3)
    for _ in range(iters):
        X = src @ Rr.T + tt
        d, i = tree.query(X); keep = d <= np.quantile(d, trim)
        R2, t2 = rigid(X[keep], dst[i[keep]])
        Rr, tt = R2 @ Rr, R2 @ tt + t2
    d, _ = tree.query(src @ Rr.T + tt)
    return Rr, tt, d


PAIRS = []  # (lado, nombre DU, predicado HuBMAP)
for side in ("Left", "Right"):
    for dn, hn in (("Femur", "femur"), ("Tibia", "tibia"), ("Fibula", "fibula"), ("Patella", "patella"), ("Pelvis", "ilium")):
        PAIRS.append((side, dn, hn))
PAIRS += [(None, "Sacrum", "sacrum"), (None, "Coccyx", "coccyx")]
SIDE_X = {"Left": 1, "Right": -1}
land_src, land_dst, fits = [], [], {}
rng = np.random.default_rng(0)
for side, dn, hn in PAIRS:
    cands = [p for p in parts if p["name"] == dn and (side is None or p["side"] == side)]
    if not cands:
        continue
    d = cands[0]["v"]
    h = hub(lambda en, hn=hn: en.lower().startswith(hn))
    if h is None:
        print("sin pareja HuBMAP:", dn); continue
    if side:
        h = h[np.sign(h[:, 0]) == SIDE_X[side]]
    X = G(d)
    # pelvis: HuBMAP sólo tiene el ilion -> ICP desde HuBMAP hacia el coxal completo de Denver (parcial)
    if dn == "Pelvis":
        Rinv, tinv, dist = icp(h[::3], X[::5])
        Rr = Rinv.T; tt = -Rinv.T @ tinv
    else:
        Rr, tt, dist = icp(X[::5], h)
    fits[(side, dn)] = (Rr, tt)
    print(f"{dn:8s} {side or '':5s} ajuste: mediana {np.median(dist) * 1000:5.1f} mm, p90 {np.quantile(dist, 0.9) * 1000:5.1f} mm")
    k = rng.choice(len(X), size=min(90, len(X)), replace=False)
    land_src.append(X[k]); land_dst.append(X[k] @ Rr.T + tt)

# pies: el cadáver tiene los pies en punta; la piel HuBMAP los tiene apoyados. Cada pie sigue a su tibia y
# después gira alrededor del astrágalo para que la línea talón-dedos coincida con la del pie de la piel.
FOOT = {"Talus", "Calcaneous", "Navicular", "Cuboid", "MedialCuneiform", "IntermediateCuneiform", "LateralCuneiform", "Phalanges"}
fskin = Dump(DUMP, "f-piel").all


def rodrigues(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b; sn = np.linalg.norm(v)
    if sn < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / sn ** 2)


# objetivo: los huesos del pie ya colocados dentro de la piel femenina en el paso anterior (BodyParts3D ajustado)
mcat, _ = catalogs()
FOOT_RE = re.compile(r"talus|calcaneus|navicular|cuboid|cuneiform|metatars|phalanx of .*(toe|hallux)|of (left|right) foot", re.I)
for side in ("Left", "Right"):
    Rr, tt = fits[(side, "Tibia")]
    tgt = [fe.get(n) for n in fe.names() if n in fcat and FOOT_RE.search(fcat[n]["en"]) and side.lower() in fcat[n]["en"].lower()]
    tgt = np.concatenate(tgt)
    tgt = tgt[np.sign(tgt[:, 0]) == SIDE_X[side]]
    src_parts = [p for p in parts if p["side"] == side and p["name"] in FOOT]
    Xall = np.concatenate([G(p["v"])[::4] for p in src_parts]) @ Rr.T + tt
    R2, t2, dist = icp(Xall, tgt, iters=60, trim=0.8)
    ang = np.degrees(np.arccos(np.clip((np.trace(R2) - 1) / 2, -1, 1)))
    print(f"pie {side}: {len(tgt)} puntos objetivo, giro extra {ang:.0f}°, mediana {np.median(dist) * 1000:.1f} mm")
    for p in src_parts:
        X = G(p["v"]); k = rng.choice(len(X), size=min(40, len(X)), replace=False)
        Y = (X[k] @ Rr.T + tt) @ R2.T + t2
        land_src.append(X[k]); land_dst.append(Y)
S_, D_ = np.vstack(land_src), np.vstack(land_dst)
warp = RBFInterpolator(S_, D_, kernel="thin_plate_spline", smoothing=1e-6)
print("puntos de referencia:", len(S_))

# --- volcado ------------------------------------------------------------------------------------
idx, chunks, tris, off = [], [], [], 0
for p in parts:
    w = warp(G(p["v"])).astype(np.float32)
    chunks.append(w.tobytes()); tris.append((p["t"] + off).astype(np.uint32).tobytes())
    idx.append(dict(side=p["side"], kind=p["kind"], name=p["name"], off=off, n=len(w), ntri=len(p["t"])))
    off += len(w)
open(os.path.join(OUT, "du.bin"), "wb").write(b"".join(chunks))
open(os.path.join(OUT, "du.tri.bin"), "wb").write(b"".join(tris))
json.dump(idx, open(os.path.join(OUT, "du.json"), "w"))
json.dump(dict(scale=s, R=R.tolist(), t=t.tolist()), open(os.path.join(OUT, "du_transform.json"), "w"))
print("vértices:", off, "triángulos:", sum(e["ntri"] for e in idx))
