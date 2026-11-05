"""Ajuste hombre -> mujer: puntos de referencia emparejados + deformación suave (thin-plate spline).

El cuerpo femenino (HuBMAP / Visible Human Female) no trae cráneo, costillas, cintura escapular, brazos,
manos, pies ni la mayoría de los músculos. Se toman de BodyParts3D (hombre) y se deforman para encajar en
ella usando:
  * huesos que ambos tienen (vértebras, sacro, esternón, coxales, fémur, tibia, peroné, rótula)
  * secciones de la piel a alturas/fracciones equivalentes (tronco, cuello, cabeza, muslos, piernas, brazos)
    desplazadas hacia dentro por el grosor de la grasa subcutánea
  * puntos de pies y hombros

Uso: python -I scripts/female_fit.py <dump-dir> <out-dir>
Salida: <out-dir>/landmarks.npz y <out-dir>/<glb>.warped.bin (mismo orden que el volcado) por cada GLB masculino.
"""
import os
import re
import sys

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from female_common import Dump, catalogs, find, inside_grid  # noqa: E402

D, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
mcat, fcat = catalogs()
M = {k: Dump(D, k) for k in ["piel", "esqueletico", "muscular", "articular"]}
F = {k: Dump(D, k) for k in ["f-piel", "f-esqueletico", "f-reproductor"]}

src, dst, tag = [], [], []


def add(a, b, t):
    if a is None or b is None:
        return
    src.append(np.asarray(a, float)); dst.append(np.asarray(b, float)); tag.append(t)


def mbone(pred):
    return find(mcat, M["esqueletico"], pred)


def fbone(pred):
    return find(fcat, F["f-esqueletico"], pred)


def ends(v, axis=1, frac=0.06):
    """Centroides de los extremos de un hueso (por el eje más largo si axis=None)."""
    if axis is None:
        c = v.mean(0); u = np.linalg.svd(v - c, full_matrices=False)[2][0]
        t = (v - c) @ u
    else:
        t = v[:, axis]
    lo, hi = np.quantile(t, [frac, 1 - frac])
    a, b = v[t <= lo].mean(0), v[t >= hi].mean(0)
    return (a, b) if a[1] < b[1] else (b, a)  # (inferior, superior)


# ---------------------------------------------------------------- huesos comunes
ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]
vert_m, vert_f = {}, {}
for i in range(7):
    nm = {0: "Atlas", 1: "Axis"}.get(i, f"{ORD[i].capitalize()} cervical vertebra")
    vert_m[f"C{i+1}"] = mbone(lambda p, nm=nm: p["en"] == nm)
    vert_f[f"C{i+1}"] = fbone(lambda p, i=i: p["en"] == f"Cervical vertebra {i+1}")
for i in range(12):
    vert_m[f"T{i+1}"] = mbone(lambda p, i=i: p["en"] == f"{ORD[i].capitalize()} thoracic vertebra")
    vert_f[f"T{i+1}"] = fbone(lambda p, i=i: p["en"] == f"Thoracic vertebra {i+1}")
for i in range(5):
    vert_m[f"L{i+1}"] = mbone(lambda p, i=i: p["en"] == f"{ORD[i].capitalize()} lumbar vertebra")
for i in range(6):
    vert_f[f"L{i+1}"] = fbone(lambda p, i=i: p["en"] == f"Lumbar vertebra {i+1}")
# ella tiene 6 lumbares: L1..L5 del hombre se reparten proporcionalmente sobre L1..L6
fl = np.array([vert_f[f"L{i+1}"].mean(0) for i in range(6)])
for i in range(5):
    vert_f[f"L{i+1}m"] = None
lum_f = [fl[0] + (fl[5] - fl[0]) * (i / 4) for i in range(5)]
for k in [f"C{i+1}" for i in range(7)] + [f"T{i+1}" for i in range(12)]:
    a, b = vert_m[k], vert_f[k]
    add(a.mean(0), b.mean(0), "vert")
    # frente/atrás del cuerpo vertebral: orienta cada vértebra
    for frac in (0.1, 0.9):
        add(np.quantile(a, frac, axis=0) * [0, 0, 1] + a.mean(0) * [1, 1, 0], np.quantile(b, frac, axis=0) * [0, 0, 1] + b.mean(0) * [1, 1, 0], "vert")
for i in range(5):
    add(vert_m[f"L{i+1}"].mean(0), lum_f[i], "vert")
spine_y_m = {k: v.mean(0)[1] for k, v in vert_m.items() if v is not None}
spine_y_f = {k: v.mean(0)[1] for k, v in vert_f.items() if v is not None and not k.endswith("m")}
for i in range(5):
    spine_y_f[f"L{i+1}"] = lum_f[i][1]

for nm_m, nm_f in [("Sacrum", "Sacrum"), ("Coccyx", "Coccyx"), ("Body of sternum", "Sternum"), ("Manubrium", "Manubrium")]:
    a, b = mbone(lambda p: p["en"] == nm_m), fbone(lambda p: p["en"].split(" (")[0] == nm_f)
    if a is None or b is None:
        print("falta", nm_m, nm_f); continue
    add(a.mean(0), b.mean(0), "tronco")
    lo_a, hi_a = ends(a); lo_b, hi_b = ends(b)
    add(lo_a, lo_b, "tronco"); add(hi_a, hi_b, "tronco")

# pelvis real (opcional): salida de scripts/du_import.py en data-raw/du-vhf/aligned
DU_DIR = os.environ.get("DU_ALIGNED", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data-raw", "du-vhf", "aligned"))
DU_PELVIS = None
if os.path.exists(os.path.join(DU_DIR, "du.json")):
    import json as _json
    _idx = _json.load(open(os.path.join(DU_DIR, "du.json")))
    _V = np.fromfile(os.path.join(DU_DIR, "du.bin"), dtype=np.float32).reshape(-1, 3).astype(float)
    DU_PELVIS = np.concatenate([_V[e["off"]:e["off"] + e["n"]][::3] for e in _idx if e["kind"] == "Bone" and e["name"] == "Pelvis"])
    print("usando la pelvis real de Denver:", len(DU_PELVIS), "puntos")
for side, sgn in (("Left", 1), ("Right", -1)):
    sd = "(left)" if side == "Left" else "(right)"
    # BodyParts3D: "Left" del cuerpo = x>0? se decide por el signo real de los datos
    hip_m = mbone(lambda p: p["en"] == f"{side} hip bone")
    s = np.sign(hip_m.mean(0)[0])
    # el lado se decide por la posición real (x), no por el nombre
    hip_f = fbone(lambda p: p["en"].startswith("Ilium"))
    hip_f = hip_f[np.sign(hip_f[:, 0]) == s]
    # si está la pelvis real de Denver (completa, con pubis) se usa en lugar del ilion de HuBMAP
    if DU_PELVIS is not None:
        hip_f = DU_PELVIS[np.sign(DU_PELVIS[:, 0]) == s]
        extremes = ((0, 0.98 if s > 0 else 0.02), (0, 0.02 if s > 0 else 0.98), (1, 0.02), (1, 0.98), (2, 0.02), (2, 0.98))
    else:
        # sin ella, el extremo medial NO: el coxal de HuBMAP no llega a la sínfisis del pubis
        extremes = ((0, 0.98 if s > 0 else 0.02), (1, 0.02), (1, 0.98), (2, 0.02), (2, 0.98))
    for k, q in extremes:
        pa = hip_m[np.argmin(np.abs(hip_m[:, k] - np.quantile(hip_m[:, k], q)))]
        pb = hip_f[np.argmin(np.abs(hip_f[:, k] - np.quantile(hip_f[:, k], q)))]
        add(pa, pb, "pelvis")
    for bn in ("femur", "tibia", "fibula", "patella"):
        a = mbone(lambda p: p["en"] == f"{side} {bn}")
        b = fbone(lambda p: p["en"].lower().startswith(bn))
        if a is None or b is None:
            print("falta", side, bn); continue
        b = b[np.sign(b[:, 0]) == s]
        add(a.mean(0), b.mean(0), "pierna")
        if bn != "patella":
            lo_a, hi_a = ends(a); lo_b, hi_b = ends(b)
            add(lo_a, lo_b, "pierna"); add(hi_a, hi_b, "pierna")

# ---------------------------------------------------------------- piel
skin_m = M["piel"].get(next(n for n in M["piel"].names() if mcat.get(n, {}).get("en") == "Skin"))
skin_f = F["f-piel"].all
FAT_M = 0.006   # grasa subcutánea aproximada (m)
FAT_F = {"tronco": 0.016, "cuello": 0.008, "cabeza": 0.004, "muslo": 0.016, "pierna": 0.010, "brazo": 0.010, "mano": 0.003}


def ring(pts, center, axis, ref, n_ang=12, band=0.006, skip=None):
    """Puntos exteriores de una sección: por cada sector angular, el más alejado del centro."""
    axis = axis / np.linalg.norm(axis)
    u = ref - axis * (ref @ axis); u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    d = pts - center
    sel = np.abs(d @ axis) < band
    if sel.sum() < n_ang * 2:
        return None
    d = d[sel]; p = pts[sel]
    ang = np.arctan2(d @ v, d @ u)
    rad = np.linalg.norm(d - np.outer(d @ axis, axis), axis=1)
    out = []
    for k in range(n_ang):
        a0 = -np.pi + 2 * np.pi * k / n_ang
        m = (ang >= a0) & (ang < a0 + 2 * np.pi / n_ang)
        if skip is not None and skip(a0 + np.pi / n_ang):
            out.append(None); continue
        if m.sum() == 0:
            out.append(None); continue
        i = np.argmax(np.where(m, rad, -1))
        dirr = d[i] - axis * (d[i] @ axis); dirr /= np.linalg.norm(dirr)
        out.append((p[i], dirr))
    return out


def add_rings(rm, rf, region, fat_m=FAT_M):
    if rm is None or rf is None:
        return 0
    k = 0
    for a, b in zip(rm, rf):
        if a is None or b is None:
            continue
        add(a[0] - a[1] * fat_m, b[0] - b[1] * FAT_F[region], region); k += 1
    return k


Z = np.array([0, 0, 1.0]); Y = np.array([0, 1.0, 0])


def torso_limits(skin, ys, lo=0.10, hi=0.26, gap=0.014):
    """Media anchura del tronco a cada altura (por lado), cortando donde empieza el hueco tronco-brazo.
    Por encima de la axila (sin hueco) se mantiene la última anchura medida."""
    out = {}
    for sgn in (1, -1):
        last = None
        for y in sorted(ys):
            sl = skin[np.abs(skin[:, 1] - y) < 0.008]
            x = np.sort(np.abs(sl[np.sign(sl[:, 0]) == sgn][:, 0]))
            lim = None
            for i in np.where(np.diff(x) > gap)[0]:
                if lo < x[i] < hi:
                    lim = x[i] + 0.003; break
            if lim is None:
                lim = last if last is not None else hi
            else:
                last = lim
            out[(sgn, round(y, 4))] = lim
    return out


def clip_torso(sl, lims, y):
    keep = np.array([abs(px) <= lims[(1 if px >= 0 else -1, round(y, 4))] for px in sl[:, 0]])
    return sl[keep] if len(sl) else sl

# tronco: secciones horizontales a la altura de cada vértebra (T4..L5) y del sacro
ribs_m = mbone(lambda p: re.search(r"\brib\b", p["en"]) is not None)
breast = F["f-reproductor"].all if F["f-reproductor"] is not None else None
mam = find(fcat, F["f-reproductor"], lambda p: "mammary" in p["en"].lower() or "areola" in p["en"].lower() or "nipple" in p["en"].lower() or p["en"].startswith("Fat"))
mam_y = (mam[:, 1].min(), mam[:, 1].max()) if mam is not None else (9, 9)
n_trunk = 0
levels = [f"T{i}" for i in range(4, 13)] + [f"L{i}" for i in range(1, 6)]
LIM_M = torso_limits(skin_m, [spine_y_m[k] for k in levels])
LIM_F = torso_limits(skin_f, [spine_y_f[k] for k in levels])
for k in levels:
    ym, yf = spine_y_m[k], spine_y_f[k]
    # solo el tronco: se corta donde empieza el hueco con el brazo
    sm = clip_torso(skin_m[np.abs(skin_m[:, 1] - ym) < 0.006], LIM_M, ym)
    sf = clip_torso(skin_f[np.abs(skin_f[:, 1] - yf) < 0.006], LIM_F, yf)
    if len(sm) < 30 or len(sf) < 30:
        continue
    cm = np.array([0, ym, (sm[:, 2].min() + sm[:, 2].max()) / 2]); cf = np.array([0, yf, (sf[:, 2].min() + sf[:, 2].max()) / 2])
    in_breast = mam_y[0] - 0.02 < yf < mam_y[1] + 0.02
    skip = (lambda a: abs(a) < np.radians(65)) if in_breast else None  # delante de las mamas: no seguir la piel
    rm = ring(np.vstack([sm, sm]), cm, Y, Z, 12, 0.006)
    rf = ring(np.vstack([sf, sf]), cf, Y, Z, 12, 0.006, skip)
    n_trunk += add_rings(rm, rf, "tronco")

# cuello (C2..C6) y cabeza (de C1 a la coronilla)
for k in ["C2", "C3", "C4", "C5", "C6"]:
    ym, yf = spine_y_m[k], spine_y_f[k]
    sm = skin_m[(np.abs(skin_m[:, 1] - ym) < 0.006) & (np.abs(skin_m[:, 0]) < 0.08)]
    sf = skin_f[(np.abs(skin_f[:, 1] - yf) < 0.006) & (np.abs(skin_f[:, 0]) < 0.08)]
    if len(sm) < 20 or len(sf) < 20:
        continue
    add_rings(ring(sm, sm.mean(0), Y, Z, 10), ring(sf, sf.mean(0), Y, Z, 10), "cuello")
top_m, top_f = skin_m[:, 1].max(), skin_f[:, 1].max()
c1m, c1f = vert_m["C1"].mean(0), vert_f["C1"].mean(0)
for fr in np.linspace(0.05, 0.95, 10):
    ym = c1m[1] + (top_m - c1m[1]) * fr; yf = c1f[1] + (top_f - c1f[1]) * fr
    sm = skin_m[(np.abs(skin_m[:, 1] - ym) < 0.005) & (np.abs(skin_m[:, 0]) < 0.12)]
    sf = skin_f[(np.abs(skin_f[:, 1] - yf) < 0.005) & (np.abs(skin_f[:, 0]) < 0.12)]
    if len(sm) < 20 or len(sf) < 20:
        continue
    cm = np.array([0, ym, (sm[:, 2].min() + sm[:, 2].max()) / 2]); cf = np.array([0, yf, (sf[:, 2].min() + sf[:, 2].max()) / 2])
    add_rings(ring(sm, cm, Y, Z, 12), ring(sf, cf, Y, Z, 12), "cabeza")
add(skin_m[np.argmax(skin_m[:, 1])] - Y * 0.004, skin_f[np.argmax(skin_f[:, 1])] - Y * 0.004, "cabeza")

# muslos y piernas: secciones a fracciones del fémur y de la tibia
for side in ("Left", "Right"):
    for bn, region, fracs in (("femur", "muslo", np.linspace(0.15, 0.9, 7)), ("tibia", "pierna", np.linspace(0.1, 0.92, 7))):
        a = mbone(lambda p: p["en"] == f"{side} {bn}")
        s = np.sign(a.mean(0)[0])
        b = fbone(lambda p: p["en"].lower().startswith(bn)); b = b[np.sign(b[:, 0]) == s]
        (alo, ahi), (blo, bhi) = ends(a), ends(b)
        for fr in fracs:
            pm = ahi + (alo - ahi) * fr; pf = bhi + (blo - bhi) * fr
            sm = skin_m[(np.sign(skin_m[:, 0]) == s) & (np.abs(skin_m[:, 1] - pm[1]) < 0.006)]
            sf = skin_f[(np.sign(skin_f[:, 0]) == s) & (np.abs(skin_f[:, 1] - pf[1]) < 0.006)]
            sm = sm[np.linalg.norm((sm - pm)[:, [0, 2]], axis=1) < 0.13]
            sf = sf[np.linalg.norm((sf - pf)[:, [0, 2]], axis=1) < 0.16]
            if len(sm) < 20 or len(sf) < 20:
                continue
            add_rings(ring(sm, np.r_[sm[:, 0].mean(), pm[1], sm[:, 2].mean()], Y, Z, 10),
                      ring(sf, np.r_[sf[:, 0].mean(), pf[1], sf[:, 2].mean()], Y, Z, 10), region)

# pies: talón, punta, borde lateral y medial, dorso
for side in ("Left", "Right"):
    s = np.sign(mbone(lambda p: p["en"] == f"{side} femur").mean(0)[0])
    fm = skin_m[(np.sign(skin_m[:, 0]) == s) & (skin_m[:, 1] < 0.09)]
    ff = skin_f[(np.sign(skin_f[:, 0]) == s) & (skin_f[:, 1] < 0.09)]
    for arr_m, arr_f in ((fm, ff),):
        for key in (lambda q: q[:, 2], lambda q: -q[:, 2], lambda q: np.abs(q[:, 0]) * (q[:, 1] < 0.03), lambda q: -np.abs(q[:, 0]) + 9 * (q[:, 1] > 0.03)):
            add(arr_m[np.argmax(key(arr_m))], arr_f[np.argmax(key(arr_f))], "pie")
        # dorso del pie a media longitud
        for fr in (0.35, 0.6, 0.8):
            zm = arr_m[:, 2].min() + (arr_m[:, 2].max() - arr_m[:, 2].min()) * fr
            zf = arr_f[:, 2].min() + (arr_f[:, 2].max() - arr_f[:, 2].min()) * fr
            qm = arr_m[np.abs(arr_m[:, 2] - zm) < 0.006]; qf = arr_f[np.abs(arr_f[:, 2] - zf) < 0.006]
            if len(qm) and len(qf):
                add(qm[np.argmax(qm[:, 1])], qf[np.argmax(qf[:, 1])], "pie")
                add(qm[np.argmin(np.abs(qm[:, 0]))], qf[np.argmin(np.abs(qf[:, 0]))], "pie")
                add(qm[np.argmax(np.abs(qm[:, 0]))], qf[np.argmax(np.abs(qf[:, 0]))], "pie")

# ---------------------------------------------------------------- primera pasada (sin brazos)
S1, D1 = np.vstack(src), np.vstack(dst)
print("puntos sin brazos:", len(S1), "| tronco:", n_trunk)
tps1 = RBFInterpolator(S1, D1, kernel="thin_plate_spline", smoothing=1e-5)

# ---------------------------------------------------------------- brazos
# El brazo del hombre cuelga; el de ella está abierto. Se articula el brazo masculino en tres segmentos
# (brazo, antebrazo, mano) con rotaciones en hombro, codo y muñeca hacia las articulaciones de ella, y
# luego la deformación suave corrige el resto con secciones de piel.
def rodrigues(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b; sn = np.linalg.norm(v)
    if sn < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / sn ** 2)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


bone_parts = [(n, mcat[n]) for n in M["esqueletico"].names() if n in mcat]
ARM_RE = re.compile(r"humerus|radius|ulna|capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid|triquetral|metacarpal|finger|thumb|hand", re.I)
YS = np.arange(0.80, 1.46, 0.01)
LIMF_M = torso_limits(skin_m, YS, lo=0.09, hi=0.24, gap=0.010)
LIMF_F = torso_limits(skin_f, YS, lo=0.09, hi=0.24, gap=0.010)


def lim_at(L, sgn, y):
    k = np.clip(np.round((y - YS[0]) / 0.01).astype(int), 0, len(YS) - 1)
    tab = np.array([L[(sgn, round(v, 4))] for v in YS])
    return tab[k]


def centerline(pts, a, b, n=40):
    """Centroides de rodajas de pts a lo largo del segmento a->b."""
    ax = (b - a) / np.linalg.norm(b - a); L = np.linalg.norm(b - a)
    t = (pts - a) @ ax
    out = []
    for f in np.linspace(0.04, 0.99, n):
        m = np.abs(t - f * L) < 0.012
        if m.sum() >= 6:
            out.append(pts[m].mean(0))
    return np.array(out)


def along(poly, frac):
    """Punto a una fracción de la longitud de una polilínea."""
    seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); cum = np.r_[0, np.cumsum(seg)]
    T = frac * cum[-1]; i = min(np.searchsorted(cum, T) - 1, len(seg) - 1); i = max(i, 0)
    return poly[i] + (poly[i + 1] - poly[i]) * ((T - cum[i]) / max(seg[i], 1e-9))


ARMS = []
for side in ("Left", "Right"):
    hum = mbone(lambda p: p["en"] == f"{side} humerus")
    s_ = np.sign(hum.mean(0)[0])
    arm_pts = np.vstack([M["esqueletico"].get(n) for n, p in bone_parts if ARM_RE.search(p["en"]) and side.lower() in p["en"].lower()])
    rad = mbone(lambda p: p["en"] == f"{side} radius"); uln = mbone(lambda p: p["en"] == f"{side} ulna")
    sh_m = hum[hum[:, 1] > hum[:, 1].max() - 0.035].mean(0); sh_m[0] -= s_ * 0.012
    el_m = hum[hum[:, 1] < hum[:, 1].min() + 0.03].mean(0)
    wr_m = np.vstack([rad[rad[:, 1] < rad[:, 1].min() + 0.02], uln[uln[:, 1] < uln[:, 1].min() + 0.02]]).mean(0)
    tp_m = arm_pts[np.argmin(arm_pts[:, 1])]
    joints_m = np.array([sh_m, el_m, wr_m, tp_m])
    Lm = np.linalg.norm(np.diff(joints_m, axis=0), axis=1)
    # ella: hombro por el tronco, punta = lo más lejano de la mano; codo y muñeca por la línea media de la piel del brazo
    sh_f = tps1(sh_m[None])[0]
    side_f = skin_f[np.sign(skin_f[:, 0]) == s_]
    side_m = skin_m[np.sign(skin_m[:, 0]) == s_]
    # hombro de ella desde su piel: misma distancia piel->articulación que en él (lateral y por arriba)
    lat = lambda S, y: np.abs(S[(S[:, 1] > y - 0.03) & (S[:, 1] < y + 0.01)][:, 0]).max()
    top = lambda S, x: S[np.abs(np.abs(S[:, 0]) - abs(x)) < 0.02][:, 1].max()
    sh_f[0] = s_ * (lat(side_f, sh_f[1]) - (lat(side_m, sh_m[1]) - abs(sh_m[0])))
    sh_f[1] = top(side_f, sh_f[0]) - (top(side_m, sh_m[0]) - sh_m[1])
    hand_zone = side_f[np.abs(side_f[:, 0]) > 0.28]  # la mano abierta (no el pie)
    tp_f = hand_zone[np.argmax(np.linalg.norm(hand_zone - sh_f, axis=1))]
    below = side_f[:, 1] < 1.16
    armf_mask = (np.abs(side_f[:, 0]) > lim_at(LIMF_F, s_, side_f[:, 1]) + 0.004) & below
    arm_f = side_f[armf_mask]
    cl = centerline(arm_f, sh_f, tp_f)
    poly_f = np.vstack([sh_f, cl, tp_f])
    fr = np.cumsum(Lm) / Lm.sum()
    el_f, wr_f = along(poly_f, fr[0]), along(poly_f, fr[1])
    joints_f = np.array([sh_f, el_f, wr_f, tp_f])
    # rotaciones encadenadas
    R1 = rodrigues(el_m - sh_m, el_f - sh_f)
    R2 = rodrigues(R1 @ (wr_m - el_m), wr_f - el_f) @ R1
    R3 = rodrigues(R2 @ (tp_m - wr_m), tp_f - wr_f) @ R2
    e1 = sh_m + R1 @ (el_m - sh_m); w1 = e1 + R2 @ (wr_m - el_m)
    ang = lambda R: np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))
    print(f"brazo {side}: giro hombro {ang(R1):.0f}°, antebrazo {ang(R2):.0f}°, mano {ang(R3):.0f}°; codo F {np.round(el_f, 3)}")
    ARMS.append(dict(arm_tree=cKDTree(arm_pts), side=side, s=s_, jm=joints_m, jf=joints_f, R=(R1, R2, R3), piv=(sh_m, el_m, wr_m), at=(sh_m, e1, w1), Lm=Lm, arm_f=arm_f))
ARM_Y_M = 1.19  # altura aproximada de la axila (hombre)
LEGTRUNK_TREE = cKDTree(np.vstack([M['esqueletico'].get(n) for n, p in bone_parts if not ARM_RE.search(p['en'])]))


def arm_membership(P, A):
    """0 = tronco, 1 = brazo. Debajo de la axila: más allá del borde del tronco; arriba: lateral al hombro."""
    s_, sh = A["s"], A["jm"][0]
    ax = np.abs(P[:, 0])
    gapb = smooth(-0.004, 0.008, ax - lim_at(LIMF_M, s_, P[:, 1]))
    da, _ = A["arm_tree"].query(P); dt, _ = LEGTRUNK_TREE.query(P)
    boneb = 1 / (1 + np.exp(-(dt - da) / 0.004))
    kb = smooth(1.08, 1.15, P[:, 1])  # abajo (antebrazo, mano junto al muslo): por hueso más cercano
    low = (1 - kb) * boneb + kb * gapb
    high = smooth(np.abs(sh[0]) - 0.07, np.abs(sh[0]) - 0.01, ax) * smooth(sh[1] + 0.05, sh[1] + 0.0, P[:, 1])
    k = smooth(ARM_Y_M - 0.03, ARM_Y_M + 0.03, P[:, 1])
    m = (1 - k) * low + k * high
    m[np.sign(P[:, 0]) != s_] = 0
    return m


def arm_param(P, A):
    """Posición a lo largo del brazo masculino (0 hombro ... 3 punta) por proyección a la polilínea."""
    jm = A["jm"]; best = np.full(len(P), np.inf); par = np.zeros(len(P))
    for i in range(3):
        a, b = jm[i], jm[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((P - a) @ ab) / L2, 0, 1)
        d = np.linalg.norm(P - (a + np.outer(t, ab)), axis=1)
        m = d < best; best[m] = d[m]; par[m] = i + t[m]
    return par


ARM_PART = re.compile(r"humerus|radius|ulna|capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid|triquetral|metacarp|finger|thumb|\bhand\b|brachii|brachialis|brachioradialis|anconeus|pronator|supinator|palmaris|carpi|digitorum|digiti minimi|pollicis|indicis|lumbrical|interosse|coracobrachialis|wrist|palmar", re.I)
NOT_ARM = re.compile(r"foot|toe|hallucis|digitorum (longus|brevis)|plantar|fibular|peroneus|\bleg\b", re.I)
SHOULDER_PART = re.compile(r"pectoralis major|latissimus|teres (major|minor)|infraspinatus|supraspinatus|subscapularis|deltoid", re.I)


def part_membership(base):
    """Pertenencia al brazo por pieza: brazo entero, tronco entero, o mezcla (músculos del hombro)."""
    dm = M[base]; P = dm.all; m = np.zeros(len(P)); side_of = np.zeros(len(P))
    hum = {A["side"]: cKDTree(mbone(lambda p, sd=A["side"]: p["en"] == f"{sd} humerus")) for A in ARMS}
    for e in dm.idx:
        cat = mcat.get(e["name"])
        if not cat:
            continue
        sl = slice(e["off"], e["off"] + e["n"]); en = cat["en"]
        if ARM_PART.search(en) and not NOT_ARM.search(en):
            m[sl] = 1
        elif SHOULDER_PART.search(en):
            for A in ARMS:
                Q = P[sl]; d, _ = hum[A["side"]].query(Q)
                mm = smooth(0.05, 0.005, d) * (np.sign(Q[:, 0]) == A["s"])
                m[sl] = np.maximum(m[sl], mm)
    return m


def pose(P, mem=None):
    P = np.asarray(P, float); out = P.copy()
    for A in ARMS:
        m = arm_membership(P, A) if mem is None else mem * (np.sign(P[:, 0]) == A["s"])
        idx = np.where(m > 0)[0]
        if not len(idx):
            continue
        Q = P[idx]; par = arm_param(Q, A)
        # pesos por segmento con mezcla de ±(~2 cm) en codo y muñeca
        bl = [0.07 / A["Lm"][0], 0.025 / A["Lm"][1]]
        w2 = smooth(1 - bl[0], 1 + bl[0], par); w3 = smooth(2 - bl[1], 2 + bl[1], par)
        W = np.stack([1 - w2, w2 - w3, w3], 1)
        moved = np.zeros_like(Q)
        for k in range(3):
            R, piv, at = A["R"][k], A["piv"][k], A["at"][k]
            moved += W[:, k:k + 1] * ((Q - piv) @ R.T + at)
        out[idx] = Q + m[idx, None] * (moved - Q)
    return out


# los puntos de tronco, piernas y cabeza NO se rotan (son tronco por definición)
skin_mp = pose(skin_m)
for A in ARMS:
    side, s_ = A["side"], A["s"]
    jm_p = pose(A["jm"]); jf = A["jf"]
    for a, b in zip(jm_p, jf):
        add(a, b, "brazo")
    mem = arm_membership(skin_m, A)
    gap_ok = np.abs(skin_m[:, 0]) > lim_at(LIMF_M, A["s"], skin_m[:, 1]) + 0.004  # fuera del borde del tronco/cadera
    arm_m = skin_mp[(mem > 0.9) & gap_ok & (skin_m[:, 1] < 1.16)]
    arm_f = A["arm_f"]
    n_arm = 0
    for seg in range(3):
        a_m, b_m, a_f, b_f = jm_p[seg], jm_p[seg + 1], jf[seg], jf[seg + 1]
        axm = (b_m - a_m) / np.linalg.norm(b_m - a_m); axf = (b_f - a_f) / np.linalg.norm(b_f - a_f)
        fracs = np.linspace(0.25, 0.9, 4) if seg == 0 else np.linspace(0.1, 0.9, 5)
        for f in fracs:
            pm = a_m + (b_m - a_m) * f; pf = a_f + (b_f - a_f) * f
            region = "mano" if seg == 2 else "brazo"
            R_MAX = 0.06 if region == "mano" else 0.075

            def slab(S, p0, ax):
                d = S - p0; t = d @ ax; r = np.linalg.norm(d - np.outer(t, ax), axis=1)
                return S[(np.abs(t) < 0.01) & (r < R_MAX)]
            cm_ = slab(arm_m, pm, axm); cf_ = slab(arm_f, pf, axf)
            if len(cm_) < 12 or len(cf_) < 12:
                continue
            rm = ring(cm_, cm_.mean(0), axm, Z, 8, 0.01); rf = ring(cf_, cf_.mean(0), axf, Z, 8, 0.01)
            n_arm += add_rings(rm, rf, region, fat_m=0.003 if region == "mano" else FAT_M)
    print(f"brazo {side}: {n_arm} puntos de sección")
    sh_m, sh_f = jm_p[0], jf[0]
    top_m_sh = skin_mp[np.linalg.norm((skin_mp - sh_m)[:, [0, 2]], axis=1) < 0.03]
    top_f_sh = skin_f[np.linalg.norm((skin_f - sh_f)[:, [0, 2]], axis=1) < 0.03]
    if len(top_m_sh) and len(top_f_sh):
        add(top_m_sh[np.argmax(top_m_sh[:, 1])] - Y * FAT_M, top_f_sh[np.argmax(top_f_sh[:, 1])] - Y * 0.01, "hombro")

S, Dd = np.vstack(src), np.vstack(dst)
tags = np.array([t for t, s_ in zip(tag, src) for _ in range(np.atleast_2d(s_).shape[0])])
# quitar duplicados exactos (rompen el sistema)
_, keep = np.unique(np.round(S, 5), axis=0, return_index=True)
S, Dd, tags = S[np.sort(keep)], Dd[np.sort(keep)], tags[np.sort(keep)]
print("puntos totales:", len(S), {t: int((tags == t).sum()) for t in sorted(set(tags))})
np.savez(os.path.join(OUT, "landmarks.npz"), src=S, dst=Dd, tags=tags)
tps = RBFInterpolator(S, Dd, kernel="thin_plate_spline", smoothing=1e-5)
res = np.linalg.norm(tps(S) - Dd, axis=1)
print("residuo en puntos: media %.4f m, máx %.4f m" % (res.mean(), res.max()))

import pickle
from scipy import ndimage

# ---------------------------------------------------------------- limpieza final: nada fuera de la piel
VOX = 0.003
INSIDE, LO, SHAPE = inside_grid(D, VOX)
SAFE = ndimage.binary_erosion(INSIDE, iterations=1)  # al menos ~3 mm bajo la piel
_, NEAR = ndimage.distance_transform_edt(~SAFE, return_indices=True)


def push_inside(W, dm, sigma=0.01):
    """Lleva hacia dentro los vértices que quedan fuera de la piel; el desplazamiento se reparte de forma
    suave por la pieza (decae en ~sigma) para que la pieza se mueva entera y no se aplaste."""
    W = W.copy()
    q = np.clip(np.floor((W - LO) / VOX).astype(int), 0, SHAPE - 1)
    out = ~SAFE[q[:, 0], q[:, 1], q[:, 2]]
    tgt = np.stack([NEAR[k][q[:, 0], q[:, 1], q[:, 2]] for k in range(3)], 1) * VOX + LO + VOX / 2
    disp = np.where(out[:, None], tgt - W, 0)
    moved = 0
    for e in dm.idx:
        sl = slice(e["off"], e["off"] + e["n"])
        o = out[sl]
        if not o.any():
            continue
        Pp, D_ = W[sl], disp[sl][o]; src_ = Pp[o]
        d2 = ((Pp[:, None, :] - src_[None, :, :]) ** 2).sum(-1) if len(src_) * len(Pp) < 4e7 else None
        if d2 is None:
            W[sl][o] += D_; continue
        w = np.exp(-d2 / sigma ** 2)
        amp = w.max(1); avg = (w @ D_) / np.maximum(w.sum(1), 1e-12)[:, None]
        W[sl] = Pp + amp[:, None] * avg
        moved += int(o.sum())
    print(f"  {dm.idx and len(W)} vértices; {int(out.sum())} fuera de la piel -> empujados hacia dentro")
    return W

DEBUG = os.environ.get("FIT_DEBUG")
for base in ["esqueletico", "muscular", "articular"]:
    Pp = pose(M[base].all, part_membership(base))
    if DEBUG:
        np.save(os.path.join(OUT, base + ".posed.npy"), Pp)
    W = push_inside(tps(Pp), M[base]).astype(np.float32)
    W.tofile(os.path.join(OUT, base + ".warped.bin"))
    print("deformado", base, len(W))
