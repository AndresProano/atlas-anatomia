"""Mujer «de atlas»: el cuerpo completo de BodyParts3D (limpio y coherente) con proporciones femeninas medias,
pelvis femenina real (Visible Human Female, Univ. de Denver) y órganos femeninos de HuBMAP.

Pasos
  1. Escala global a estatura femenina media.
  2. Pelvis femenina real (Denver) colocada sobre la masculina (ICP rígido con escala fija).
  3. Puntos de referencia: huesos (escala global), hombros más estrechos, fémures que entran en los acetábulos
     de la pelvis nueva, piel con cintura más estrecha y caderas/glúteos más llenos.
  4. Deformación suave (thin-plate spline) de TODAS las piezas masculinas.
  5. Añadidos: pelvis/sacro/cóccix de Denver, útero/ovarios/trompas/vagina y mamas de HuBMAP.
  6. Piel: cubre las mamas y se alisa la zona genital masculina.

Uso: python scripts/textbook_female.py <dump-dir> <du-aligned-dir> <salida-dir>
  <dump-dir>: volcado (female-dump.mjs) de models/<sistema>.glb masculinos, models/f-reproductor.glb,
              models/f-piel.glb y el f-esqueletico.glb ORIGINAL de HuBMAP.
"""
import json
import os
import re
import sys

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from female_common import Dump, catalogs  # noqa: E402

D, DU, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1)
mcat, fcat = catalogs()
SYSTEMS = ["piel", "esqueletico", "muscular", "articular", "cardiovascular", "nervioso", "respiratorio",
           "digestivo", "urogenital", "endocrino", "ojo_oido", "otros"]
M = {s: Dump(D, s) for s in SYSTEMS}
X = np.array([1.0, 0, 0]); Y = np.array([0, 1.0, 0]); Z = np.array([0, 0, 1.0])

# ------------------------------------------------------------------ proporciones (ANSUR II, medias)
# estatura M 175.6 / F 162.9 cm; anchura biacromial relativa a la estatura F/M = 0.958
H_M = M["piel"].all[:, 1].max()
S = 0.928                       # estatura femenina / masculina
SHOULDER = 0.958                # anchura de hombros (relativa, tras la escala global)
RIBS = 0.97                     # anchura del tórax (relativa)
H_F = H_M * S
print(f"estatura: hombre {H_M:.3f} m -> mujer {H_F:.3f} m")

REMOVE = re.compile(r"penis|testis|epididymis|deferent duct|seminal vesicle|prostate|^Urethra$|Pubic hair|Hair of head|hip bone$|^Sacrum$", re.I)


def cat_en(n):
    return mcat.get(n, {}).get("en", "")


def mparts(sysname, pred):
    dm = M[sysname]
    arr = [dm.get(n) for n in dm.names() if n in mcat and pred(cat_en(n))]
    return np.concatenate(arr) if arr else None


def umeyama(A, B, with_scale=True):
    ma, mb = A.mean(0), B.mean(0); a, b = A - ma, B - mb
    U, Sg, Vt = np.linalg.svd(b.T @ a / len(A))
    d = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ d @ Vt
    s = np.trace(np.diag(Sg) @ d) / (a ** 2).sum(1).mean() if with_scale else 1.0
    return s, R, mb - s * R @ ma


# ------------------------------------------------------------------ 2. pelvis femenina real
du_idx = json.load(open(os.path.join(DU, "du.json")))
du_V = np.fromfile(os.path.join(DU, "du.bin"), dtype=np.float32).reshape(-1, 3).astype(float)
du_T = np.fromfile(os.path.join(DU, "du.tri.bin"), dtype=np.uint32).reshape(-1, 3)


def du_part(e):
    return du_V[e["off"]:e["off"] + e["n"]]


PELVIS_KEYS = {("Bone", "Pelvis"), ("Bone", "Sacrum"), ("Bone", "Coccyx"), ("Cartilage", "PelvisAcetabulum")}
du_pel = [e for e in du_idx if (e["kind"], e["name"]) in PELVIS_KEYS]
P_du = np.concatenate([du_part(e) for e in du_pel if e["kind"] == "Bone"])
f_skin = Dump(D, "f-piel").all
s_p = H_F / f_skin[:, 1].max()  # la mujer real (HuBMAP/Denver) -> estatura de la mujer de atlas
P_m = S * np.concatenate([mparts("esqueletico", lambda en: en.endswith("hip bone") or en == "Sacrum")])
# la pelvis de la Visible Human es grande para una mujer media: se ajusta a una anchura entre crestas ilíacas
# un 3.5 % mayor que la masculina (en adultos la anchura biilíaca es casi igual en ambos sexos)
_pel_only = np.concatenate([du_part(e) for e in du_pel if e["name"] == "Pelvis"])
_hip_only = S * mparts("esqueletico", lambda en: en.endswith("hip bone"))
PELVIS_WIDTH = 1.035
s_p *= PELVIS_WIDTH * np.ptp(_hip_only[:, 0]) / (s_p * np.ptp(_pel_only[:, 0]))
print(f"escala de la pelvis femenina: {s_p:.3f}")
def sphere_center(P):
    A_ = np.c_[2 * P, np.ones(len(P))]; b_ = (P ** 2).sum(1)
    return np.linalg.lstsq(A_, b_, rcond=None)[0][:3]


def femur_head(side):
    fem = mparts("esqueletico", lambda en: en == f"{side} femur")
    top = fem[fem[:, 1] > fem[:, 1].max() - 0.06]
    return sphere_center(top[np.abs(top[:, 0]) < np.quantile(np.abs(top[:, 0]), 0.35)])


def symphysis(P):
    front = P[P[:, 2] > np.quantile(P[:, 2], 0.85)]
    return front[np.argsort(np.abs(front[:, 0]))[:40]].mean(0)


# colocación por articulaciones: acetábulos sobre las cabezas femorales, sacro y sínfisis del pubis
acet_du = {e["side"]: sphere_center(du_part(e)) for e in du_pel if e["name"] == "PelvisAcetabulum"}
heads = {sd: femur_head(sd) for sd in ("Left", "Right")}
sac_du = np.concatenate([du_part(e) for e in du_pel if e["name"] == "Sacrum"]).mean(0)
sac_m = mparts("esqueletico", lambda en: en == "Sacrum").mean(0)
hip_m = mparts("esqueletico", lambda en: en.endswith("hip bone"))
src_pts, dst_pts = [], []
for sd in ("Left", "Right"):
    du_sd = [k for k in acet_du if np.sign(acet_du[k][0]) == np.sign(heads[sd][0])][0]
    src_pts += [s_p * acet_du[du_sd]] * 3; dst_pts += [S * heads[sd]] * 3
src_pts += [s_p * sac_du, s_p * symphysis(np.concatenate([du_part(e) for e in du_pel if e["name"] == "Pelvis"]))]
dst_pts += [S * sac_m, S * symphysis(hip_m)]
_, R_p, t_p = umeyama(np.array(src_pts), np.array(dst_pts), with_scale=False)
T_pel = lambda v: (s_p * np.asarray(v)) @ R_p.T + t_p
d, _ = cKDTree(P_m).query(T_pel(P_du[::4]))
def app_angle(hip_pts, sym):
    """Inclinación del plano pélvico anterior (EIAS + sínfisis) respecto a la vertical, en grados (+ = hacia delante)."""
    up = hip_pts[hip_pts[:, 1] > np.quantile(hip_pts[:, 1], 0.6)]
    asis = []
    for sg in (1, -1):
        h = up[np.sign(up[:, 0]) == sg]; asis.append(h[np.argmax(h[:, 2])])
    a = (asis[0] + asis[1]) / 2
    v = a - sym
    return np.degrees(np.arctan2(v[2], v[1])), a, asis


_pel_f = T_pel(np.concatenate([du_part(e) for e in du_pel if e["name"] == "Pelvis"]))
ang_m, _, _ = app_angle(hip_m * S, symphysis(hip_m * S))
ang_f, _, _ = app_angle(_pel_f, symphysis(_pel_f))
print(f"plano pélvico anterior: hombre {ang_m:.1f}°, mujer colocada {ang_f:.1f}°")
# corregir la inclinación: giro alrededor del eje que une los acetábulos (no mueve las caderas)
_ac = [T_pel(c[None])[0] for c in acet_du.values()]
_axis = (_ac[0] - _ac[1]) / np.linalg.norm(_ac[0] - _ac[1]); _piv = (_ac[0] + _ac[1]) / 2


def _rot(theta):
    K = np.array([[0, -_axis[2], _axis[1]], [_axis[2], 0, -_axis[0]], [-_axis[1], _axis[0], 0]])
    return np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * K @ K


def _tilt(theta):
    Rt = _rot(theta); P = (_pel_f - _piv) @ Rt.T + _piv
    return app_angle(P, symphysis(P))[0]


lo, hi = -0.6, 0.6
for _ in range(50):  # bisección sobre el ángulo
    mid = (lo + hi) / 2
    if (_tilt(mid) - ang_m) * (_tilt(lo) - ang_m) <= 0:
        hi = mid
    else:
        lo = mid
_Rt = _rot((lo + hi) / 2)
R_p, t_p = _Rt @ R_p, _Rt @ (t_p - _piv) + _piv
_pel_f = T_pel(np.concatenate([du_part(e) for e in du_pel if e["name"] == "Pelvis"]))
print(f"  -> corregida: giro {np.degrees((lo + hi) / 2):.1f}°, inclinación {app_angle(_pel_f, symphysis(_pel_f))[0]:.1f}°")
print(f"pelvis femenina colocada: escala {s_p:.3f}, distancia media a la masculina {np.mean(d) * 1000:.1f} mm")

src, dst, tags = [], [], []


def add(a, b, t):
    a = np.atleast_2d(a); b = np.atleast_2d(b)
    src.append(a); dst.append(b); tags.extend([t] * len(a))


def sample(v, n):
    return v[rng.choice(len(v), size=min(n, len(v)), replace=False)]


# ------------------------------------------------------------------ 3. puntos de referencia
bones = [(n, cat_en(n)) for n in M["esqueletico"].names() if n in mcat]
ARM_RE = re.compile(r"humerus|radius|ulna|capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid|triquetral|metacarpal|finger|thumb|hand", re.I)
SHOULDER_RE = re.compile(r"clavicle|scapula", re.I)
RIB_RE = re.compile(r"\brib\b|sternum|manubrium|xiphoid", re.I)
hum = {sd: mparts("esqueletico", lambda en, sd=sd: en == f"{sd} humerus") for sd in ("Left", "Right")}
sh_x = {sd: abs(h[h[:, 1] > h[:, 1].max() - 0.035].mean(0)[0]) for sd, h in hum.items()}
sh_c = {sd: h[h[:, 1] > h[:, 1].max() - 0.035].mean(0) for sd, h in hum.items()}
ARM_ABD = np.radians(4.0)  # brazos algo más separados del cuerpo (caderas más anchas)


def arm_target(P, side):
    """Brazo: escala global, hombro hacia dentro y ligera abducción alrededor del hombro."""
    sg = 1 if side == "Left" else -1
    c = sh_c[side] * S
    shift = -sg * (1 - SHOULDER) * sh_x[side] * S
    Q = np.asarray(P) * S
    a = sg * ARM_ABD
    Rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    return (Q - c) @ Rz.T + c + np.array([shift, 0, 0])


def girdle_target(P, side):
    sg = 1 if side == "Left" else -1
    Q = np.asarray(P) * S
    f = np.clip(np.abs(P[:, 0]) / sh_x[side], 0, 1)
    Q[:, 0] -= sg * (1 - SHOULDER) * sh_x[side] * S * f
    return Q


for n, en in bones:
    v = M["esqueletico"].get(n)
    if REMOVE.search(en) or en.endswith("femur"):
        continue
    k = 40 if len(v) > 2000 else 14
    p = sample(v, k)
    side = "Left" if "left" in en.lower() else ("Right" if "right" in en.lower() else None)
    if ARM_RE.search(en) and side:
        add(p, arm_target(p, side), "brazo")
    elif SHOULDER_RE.search(en) and side:
        add(p, girdle_target(p, side), "hombro")
    elif RIB_RE.search(en):
        q = p * S; q[:, 0] *= RIBS
        add(p, q, "torax")
    else:
        add(p, p * S, "hueso")

# pelvis masculina -> pelvis femenina: ICP no rígido simétrico (también las zonas más abiertas de ella,
# como las crestas ilíacas, tiran de la pelvis masculina para que los músculos que se insertan las sigan)
P_f_full = T_pel(P_du)
pm_dense = mparts("esqueletico", lambda en: en.endswith("hip bone") or en == "Sacrum")
pm_s = sample(pm_dense, 700); pf_s = sample(P_f_full, 900)
tree_f = cKDTree(P_f_full)
g = lambda v: np.asarray(v) * S
for it in range(5):
    G_dense = g(pm_dense); tree_g = cKDTree(G_dense)
    _, i1 = tree_f.query(g(pm_s))                 # de él hacia ella
    _, j2 = tree_g.query(pf_s)                    # de ella hacia él
    A_ = np.vstack([pm_s, pm_dense[j2]]); B_ = np.vstack([P_f_full[i1], pf_s])
    g = RBFInterpolator(A_, B_, kernel="thin_plate_spline", smoothing=1e-3)
    dd, _ = tree_f.query(g(pm_s))
    print(f"  pelvis ICP no rígido {it + 1}: distancia media {dd.mean() * 1000:.1f} mm")
add(A_, B_, "pelvis")

# fémur: la cabeza entra en el acetábulo femenino; la rodilla queda donde estaba (ángulo Q femenino)
acet = {k: T_pel(c[None])[0] for k, c in acet_du.items()}
for side in ("Left", "Right"):
    fem = mparts("esqueletico", lambda en, sd=side: en == f"{sd} femur")
    sg = np.sign(fem.mean(0)[0])
    head = femur_head(side)
    du_side = [k for k, c in acet.items() if np.sign(c[0]) == sg][0]
    delta = acet[du_side] - head * S
    y0, y1 = fem[:, 1].min(), fem[:, 1].max()
    p = sample(fem, 80)
    w = np.clip((p[:, 1] - y0) / (y1 - y0), 0, 1) ** 1.5
    add(p, p * S + w[:, None] * delta, "fémur")
    print(f"fémur {side}: la cabeza se desplaza {np.round(delta * 1000, 1)} mm")

# piel: cintura más estrecha, caderas y glúteos más llenos; brazos con su transformación
skin_id = next(n for n in M["piel"].names() if cat_en(n) == "Skin")
skin = M["piel"].get(skin_id)
gen = mparts("urogenital", lambda en: re.search(r"penis|testis|epididymis", en, re.I) is not None)
gen_tree = cKDTree(gen)
dg, _ = gen_tree.query(skin)
GENITAL = dg < 0.025
arm_bone_tree = {sd: cKDTree(np.concatenate([M["esqueletico"].get(n) for n, en in bones if ARM_RE.search(en) and sd.lower() in en.lower()])) for sd in ("Left", "Right")}
trunk_bone_tree = cKDTree(np.concatenate([M["esqueletico"].get(n) for n, en in bones if not ARM_RE.search(en)]))
dt, _ = trunk_bone_tree.query(skin)
yn = skin[:, 1] / H_M


def bump(c, sg):
    return np.exp(-0.5 * ((yn - c) / sg) ** 2)


cand = np.where(~GENITAL)[0]
pick = rng.choice(cand, size=1800, replace=False)
for i in pick:
    p = skin[i]
    side = "Left" if p[0] > 0 else "Right"
    da, _ = arm_bone_tree[side].query(p)
    if da < dt[i]:
        add(p, arm_target(p[None], side)[0], "piel-brazo")
        continue
    q = p * S
    # anchura relativa a la mitad del cuerpo a esa altura (lateral = cerca del borde)
    lat = np.clip((abs(p[0]) - 0.06) / 0.12, 0, 1)
    back = np.clip(-(p[2] + 0.02) / 0.10, 0, 1)
    b = lambda c, sg: np.exp(-0.5 * ((yn[i] - c) / sg) ** 2)
    hips = 0.024 * b(0.515, 0.05) * lat          # caderas (trocánter)
    glute = 0.020 * b(0.53, 0.045) * back        # glúteos
    waist = -0.014 * b(0.615, 0.035) * lat       # cintura
    thigh = 0.010 * b(0.44, 0.06) * lat          # muslo superior
    q[0] += np.sign(p[0]) * (hips + waist + thigh)
    q[2] -= glute
    add(p, q, "piel")

Sx, Dx = np.vstack(src), np.vstack(dst)
_, keep = np.unique(np.round(Sx, 5), axis=0, return_index=True)
keep = np.sort(keep); Sx, Dx = Sx[keep], Dx[keep]
tg = np.array(tags)[keep]
print("puntos de referencia:", len(Sx), {t: int((tg == t).sum()) for t in sorted(set(tg))})
tps = RBFInterpolator(Sx, Dx, kernel="thin_plate_spline", smoothing=1e-5)
print("residuo máx en puntos: %.2f mm" % (np.linalg.norm(tps(Sx) - Dx, axis=1).max() * 1000))

# ------------------------------------------------------------------ 4. deformar todo el cuerpo masculino
W = {}
for s_ in SYSTEMS:
    W[s_] = tps(M[s_].all)
    print("deformado", s_, len(W[s_]))

# ------------------------------------------------------------------ 5. añadidos femeninos
extras = []  # dict(id, system, en, es, la, from, pos, tri)
du_names = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "du_names.json")))
maleByEn = {p["en"].lower(): p for p in mcat.values()}
for e in du_pel:
    spec = du_names[e["kind"]][e["name"]]
    side = e["side"].lower(); Side = e["side"]
    fill = lambda s_: s_.replace("{side}", side).replace("{Side}", Side) if s_ else s_
    m = maleByEn.get(fill(spec.get("match", "")).lower()) if spec.get("match") else None
    sfx = "" if spec.get("single") else f" ({'izq.' if side == 'left' else 'der.'})"
    tri = du_T[e.get("tri_off", 0):0]  # (se rellena abajo)
    extras.append(dict(id=f"DU-{'' if spec.get('single') else Side[0] + '-'}{e['kind'][0]}-{e['name']}",
                       system="esqueletico" if e["kind"] == "Bone" else "articular",
                       en=m["en"] if m else fill(spec["en"]), es=m["es"] if m else (spec["es"] + sfx),
                       la=m["la"] if m else spec.get("la"), src="Visible Human Female (Univ. de Denver)",
                       pos=T_pel(du_part(e)), du=e))

# órganos de HuBMAP: el marco de Denver alineado ES el de HuBMAP, así que la misma transformación vale
rep = Dump(D, "f-reproductor")
BREAST = re.compile(r"areola|nipple|lactiferous|mammary|^fat|suspensory ligaments", re.I)
internal, breast = [], []
for e in rep.idx:
    p = fcat.get(e["name"])
    if not p:
        continue
    (breast if BREAST.search(p["en"]) else internal).append(e)
for e in internal:
    p = fcat[e["name"]]
    extras.append(dict(id=e["name"], system="reproductor", en=p["en"], es=p["es"], la=p["la"], src="HuBMAP",
                       pos=T_pel(rep.all[e["off"]:e["off"] + e["n"]]), hub=e))

# mamas: semejanza tórax HuBMAP -> tórax de la mujer de atlas (esternón + vértebras torácicas)
hub_e = Dump(D, "f-esqueletico")
def hub_bone(pred):
    a = [hub_e.get(n) for n in hub_e.names() if n in fcat and pred(fcat[n]["en"])]
    return np.concatenate(a) if a else None
ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]
A_, B_ = [], []
for i in range(1, 10):
    h = hub_bone(lambda en, i=i: en == f"Thoracic vertebra {i}")
    m = mparts("esqueletico", lambda en, i=i: en == f"{ORD[i - 1].capitalize()} thoracic vertebra")
    A_.append(h.mean(0)); B_.append(tps(m.mean(0)[None])[0])
for hn, mn in (("Sternum", "Body of sternum"), ("Manubrium", "Manubrium")):
    h = hub_bone(lambda en, hn=hn: en.split(" (")[0] == hn); m = mparts("esqueletico", lambda en, mn=mn: en == mn)
    for q in (0.05, 0.5, 0.95):
        A_.append(np.quantile(h, q, axis=0)); B_.append(tps(np.quantile(m, q, axis=0)[None])[0])
s_c, R_c, t_c = umeyama(np.array(A_), np.array(B_))
BREAST_SCALE = 0.88  # mama de una mujer joven/promedio (la de la Visible Human es grande y caída)
bpos = {e["name"]: (s_c * rep.all[e["off"]:e["off"] + e["n"]]) @ R_c.T + t_c for e in breast}
# escalar cada mama alrededor de su base y apoyarla sobre la pared torácica (músculos + costillas)
chest = np.vstack([W["muscular"], W["esqueletico"]])
for sg in (1, -1):
    names_side = [n for n in bpos if np.sign(bpos[n].mean(0)[0]) == sg]
    allb = np.vstack([bpos[n] for n in names_side])
    base = np.array([allb[:, 0].mean(), allb[:, 1].mean(), allb[:, 2].min()])
    for n in names_side:
        bpos[n] = (bpos[n] - base) * BREAST_SCALE + base
    allb = np.vstack([bpos[n] for n in names_side])
    # pezón a ~72 % de la estatura (media femenina)
    nip = [n for n in names_side if fcat[n]["en"].lower().startswith("nipple")]
    if nip:
        dy = float(np.clip(0.72 * H_F - np.vstack([bpos[n] for n in nip])[:, 1].mean(), -0.06, 0.02))
        for n in names_side:
            bpos[n] = bpos[n] + np.array([0, dy, 0])
        print(f"mama {'izq' if sg > 0 else 'der'}: bajada {-dy * 1000:.0f} mm")
    allb = np.vstack([bpos[n] for n in names_side])
    # pared torácica delante de la mama: z máxima de músculo/costilla en la misma (x, y)
    region = chest[(np.abs(chest[:, 0] - allb[:, 0].mean()) < 0.09) & (np.abs(chest[:, 1] - allb[:, 1].mean()) < 0.09)]
    tr = cKDTree(region[:, :2])
    _, j = tr.query(allb[:, :2], k=8)
    wall = region[j, 2].max(1)
    dz = max(0.0, np.max(wall + 0.004 - allb[:, 2]))
    dz = min(dz, 0.06)
    for n in names_side:
        bpos[n] = bpos[n] + np.array([0, 0, dz])
    print(f"mama {'izq' if sg > 0 else 'der'}: adelantada {dz * 1000:.0f} mm sobre la pared torácica")
for e in breast:
    p = fcat[e["name"]]
    extras.append(dict(id=e["name"], system="reproductor", en=p["en"], es=p["es"], la=p["la"], src="HuBMAP",
                       pos=bpos[e["name"]], hub=e))

# ------------------------------------------------------------------ 6. piel: cubrir mamas, alisar genitales
sk = W["piel"]; e_sk = next(e for e in M["piel"].idx if e["name"] == skin_id)
sl = slice(e_sk["off"], e_sk["off"] + e_sk["n"])
SK = sk[sl].copy()
tri_sk = np.fromfile(os.path.join(D, "piel.tri.bin"), dtype=np.uint32).reshape(-1, 3)
tri_sk = tri_sk[(tri_sk >= e_sk["off"]).all(1) & (tri_sk < e_sk["off"] + e_sk["n"]).all(1)] - e_sk["off"]
nbr = [set() for _ in range(len(SK))]
for a, b, c in tri_sk:
    nbr[a] |= {b, c}; nbr[b] |= {a, c}; nbr[c] |= {a, b}
nbr = [np.array(sorted(s_), dtype=int) for s_ in nbr]


def laplace(P, movable, iters, fixed_target=None):
    P = P.copy(); mv = np.where(movable)[0]
    for _ in range(iters):
        avg = np.array([P[nbr[i]].mean(0) if len(nbr[i]) else P[i] for i in mv])
        P[mv] = avg
    return P


# genitales: membrana lisa (los vértices de la zona se relajan hacia sus vecinos con el borde fijo)
gmask = GENITAL[sl] if GENITAL.shape[0] == SK.shape[0] else GENITAL
SK = laplace(SK, gmask, 200)
# caderas: suavizar la banda lateral donde la cadera ensanchada se encuentra con la mano (evita pliegues)
yn_sk = M["piel"].all[sl][:, 1] / H_M
band = (yn_sk > 0.40) & (yn_sk < 0.64) & (np.abs(M["piel"].all[sl][:, 0]) > 0.09)
not_arm = np.ones(len(SK), bool)
for sd, sg in (("Left", 1), ("Right", -1)):
    da_, _ = arm_bone_tree[sd].query(M["piel"].all[sl])
    not_arm &= ~((da_ < dt) & (np.sign(M["piel"].all[sl][:, 0]) == sg))
SK = laplace(SK, band & not_arm, 12)
# mamas: la piel delantera se empuja por delante de la mama más cercana (+4 mm) y se suaviza
allbreast = np.vstack([e["pos"] for e in extras if e["system"] == "reproductor" and e["id"] in bpos])
btr = cKDTree(allbreast[:, :2])
front = SK[:, 2] > 0.0
dd, j = btr.query(SK[:, :2], k=6)
near = front & (dd[:, 0] < 0.012)
need = allbreast[j, 2].max(1) + 0.004
push = np.where(near, np.maximum(0, need - SK[:, 2]), 0)
disp = np.zeros_like(SK); disp[:, 2] = push
moved = push > 0
for _ in range(25):  # repartir el empuje para que no quede un escalón
    avg = np.array([disp[nbr[i]].mean(0) if len(nbr[i]) else disp[i] for i in range(len(SK))])
    disp = np.where(moved[:, None], np.maximum(disp, avg), avg)
SK = SK + disp
print(f"piel: {int(gmask.sum())} vértices genitales alisados, {int(moved.sum())} empujados por las mamas")
sk = sk.copy(); sk[sl] = SK; W["piel"] = sk

# ------------------------------------------------------------------ salida
for s_ in SYSTEMS:
    W[s_].astype(np.float32).tofile(os.path.join(OUT, s_ + ".warped.bin"))
meta, chunks, tris, off = [], [], [], 0
hub_tri = np.fromfile(os.path.join(D, "f-reproductor.tri.bin"), dtype=np.uint32).reshape(-1, 3)
du_tri_off = np.cumsum([0] + [e["ntri"] for e in du_idx])
du_tri_by = {(e["side"], e["kind"], e["name"]): (du_tri_off[k], e) for k, e in enumerate(du_idx)}
for ex in extras:
    if "du" in ex:
        e = ex["du"]; t0, _ = du_tri_by[(e["side"], e["kind"], e["name"])]
        tri = du_T[t0:t0 + e["ntri"]] - e["off"]
    else:
        e = ex["hub"]
        tri = hub_tri[(hub_tri >= e["off"]).all(1) & (hub_tri < e["off"] + e["n"]).all(1)] - e["off"]
    pos = ex["pos"].astype(np.float32)
    chunks.append(pos.tobytes()); tris.append(tri.astype(np.uint32).tobytes())
    meta.append(dict(id=ex["id"], system=ex["system"], en=ex["en"], es=ex["es"], la=ex["la"], src=ex["src"],
                     off=off, n=len(pos), ntri=len(tri), simplify=("du" in ex)))
    off += len(pos)
open(os.path.join(OUT, "extras.bin"), "wb").write(b"".join(chunks))
open(os.path.join(OUT, "extras.tri.bin"), "wb").write(b"".join(tris))
json.dump(dict(remove=REMOVE.pattern, extras=meta), open(os.path.join(OUT, "extras.json"), "w"), ensure_ascii=False)
print("añadidos:", len(meta))
