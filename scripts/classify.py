"""Une BodyParts3D + traducciones de Z-Anatomy en un catálogo único.

Uso: python -I scripts/classify.py <data-raw> <salida parts.json>
Lee las cabeceras de cada OBJ de BodyParts3D, asigna un sistema corporal
(por ancestro FMA y, si no hay, por palabras clave) y busca el nombre en
español y latín en Translations0.txt de Z-Anatomy.
"""
import collections
import json
import os
import re
import sys

raw, out = sys.argv[1], sys.argv[2]
bp = os.path.join(raw, "bp3d")
objdir = os.path.join(bp, "obj_isa", "isa_BP3D_4.0_obj_99")

# --- jerarquía FMA part_of ---------------------------------------------
parents = collections.defaultdict(set)
for line in open(os.path.join(bp, "partof_inclusion_relation_list.txt"), encoding="utf-8").read().splitlines()[1:]:
    p, _pn, c, _cn = line.split("\t")
    parents[c].add(p)


def ancestors(fma):
    seen, stack = set(), [fma]
    while stack:
        n = stack.pop()
        for p in parents.get(n, ()):
            if p not in seen:
                seen.add(p)
                stack.append(p)
    return seen


# Sistema por ancestro FMA (orden = prioridad)
FMA_SYSTEM = [
    ("FMA7161", "cardiovascular"), ("FMA228642", "cardiovascular"),
    ("FMA7157", "nervioso"),
    ("FMA7158", "respiratorio"),
    ("FMA7152", "digestivo"),
    ("FMA7159", "urogenital"), ("FMA7160", "urogenital"),
    ("FMA9668", "endocrino"),
    ("FMA74657", "piel"), ("FMA72979", "piel"),
    ("FMA23881", "esqueletico"),
]

# Palabras clave sobre el nombre en inglés (orden = prioridad)
KEYWORDS = [
    ("cardiovascular", r"arter|vein|venous|aort|palmar arch|plantar arch|heart|atri|ventric|cardiac|coronary|sinus of|vena|valve|trunk of|arch of"),
    ("nervioso", r"nerve|brain|cerebr|cerebell|spinal cord|ganglion|plexus|gyrus|lobe of|thalam|medulla|pons|midbrain|hippocamp|nucleus|ventricle of brain|cortex"),
    ("muscular", r"muscle|musculature|interossei|lumbrical|levatores|intertransversarii|interspinales|rotatores|tendinous ring|linea alba|raphe|tendon|\bhead of .*(biceps|triceps|quadriceps)|aponeurosis|diaphragm|belly of|part of .*muscle"),
    ("articular", r"ligament|cartilage|meniscus|disc|disk|joint|capsule|labrum|fascia|retinaculum|membrane|bursa"),
    ("esqueletico", r"bone|vertebra|rib\b|costal|sternum|skull|cranium|mandible|maxilla|femur|tibia|fibula|patella|humerus|radius|ulna|scapula|clavicle|pelvis|sacrum|coccyx|phalan|carpal|tarsal|metacarp|metatars|calcane|talus|tooth|teeth|incisor|molar|canine|premolar|hyoid|ossicle|atlas|axis|ilium|ischium|pubis|hip bone|navicular|cuboid|cuneiform|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|sesamoid"),
    ("respiratorio", r"lung|bronch|trache|laryn|pharyn|nasal|pleura"),
    ("digestivo", r"stomach|intestin|colon|rectum|liver|gallbladder|pancrea|esophag|duoden|jejun|ileum|cecum|appendix|tongue|gingiva|salivary|parotid|anus|anal"),
    ("urogenital", r"kidney|ureter|bladder|urethra|prostate|testis|ovary|uter|vagin|penis|renal"),
    ("endocrino", r"thyroid|adrenal|pituitary|pineal|parathyroid"),
    ("piel", r"skin|hair"),
    ("ojo_oido", r"vitreous"),
    ("digestivo", r"sublingual|lip"),
    ("respiratorio", r"epiglottis|conus elasticus"),
    ("urogenital", r"deferent|epididym|seminal"),
    ("esqueletico", r"xiphoid"),
    ("otros", r"spleen|thymus|lymph"),
    ("ojo_oido", r"eye|lens|retina|cornea|iris|ear\b|cochlea|tympan"),
]

SYSTEM_LABELS = {
    "esqueletico": "Sistema esquelético",
    "muscular": "Sistema muscular",
    "articular": "Articulaciones y ligamentos",
    "cardiovascular": "Sistema cardiovascular",
    "nervioso": "Sistema nervioso",
    "respiratorio": "Sistema respiratorio",
    "digestivo": "Sistema digestivo",
    "urogenital": "Sistema urinario y genital",
    "endocrino": "Sistema endocrino",
    "ojo_oido": "Órganos de los sentidos",
    "piel": "Piel",
    "otros": "Otros órganos",
}

# --- jerarquía FMA is_a (tipo de tejido) ----------------------------------
isa_par = collections.defaultdict(set)
isa_nm = {}
for line in open(os.path.join(bp, "isa_inclusion_relation_list.txt"), encoding="utf-8").read().splitlines()[1:]:
    p, pn, c, cn = line.split("\t")
    isa_par[c].add(p)
    isa_nm[p], isa_nm[c] = pn, cn
isa_el = collections.defaultdict(set)
for line in open(os.path.join(bp, "isa_element_parts.txt"), encoding="utf-8").read().splitlines()[1:]:
    c, n, e = line.split("\t")
    isa_el[e].add(c)
    isa_nm[c] = n


def isa_ancestor_names(element_id):
    seen, stack = set(isa_el.get(element_id, ())), list(isa_el.get(element_id, ()))
    while stack:
        n = stack.pop()
        for p in isa_par.get(n, ()):
            if p not in seen:
                seen.add(p)
                stack.append(p)
    return [isa_nm.get(n, "").lower() for n in seen]


ISA_RULES = [
    ("muscular", r"^muscle organ$|muscle organ|^tendon"),
    ("cardiovascular", r"vascular tree|^artery$|^vein$|cardiac|heart|valve"),
    ("esqueletico", r"^bone organ$|^tooth$|bone organ"),
    ("articular", r"cartilage organ|ligament|joint|meniscus|intervertebral disk"),
    ("nervioso", r"neuraxis|neural tree|nerve|brain|ganglion"),
    ("ojo_oido", r"eyeball|eye|lacrimal|ear"),
]

# --- traducciones Z-Anatomy ----------------------------------------------
tr = {}
lines = open(os.path.join(raw, "za", "Translations0.txt"), encoding="utf-8").read().splitlines()
for line in lines[1:]:
    cols = line.split(";")
    if len(cols) >= 4 and cols[0].strip():
        tr.setdefault(cols[0].strip().lower(), {"la": cols[1].strip(), "es": cols[3].strip()})

# traducciones complementarias (términos que Z-Anatomy no tiene), ver data-raw/traducciones_es.json
extra_path = os.path.join(raw, "traducciones_es.json")
extra = json.load(open(extra_path, encoding="utf-8")) if os.path.exists(extra_path) else {}
extra = {k.lower().strip(): v for k, v in extra.items()}

SIDE = re.compile(r"^(left|right) ")
SIDE_ES = {"left": "izq.", "right": "der."}


def norm(s):
    s = s.lower().strip()
    s = s.replace("muscle", "").replace("  ", " ").strip()
    return s


def translate(en):
    key = en.lower().strip()
    side = None
    m = SIDE.match(key)
    if m:
        side = m.group(1)
        key = key[m.end():]
    cands = [key, key.replace(" muscle", ""), key + " muscle", key.replace("bone", "").strip(),
             re.sub(r"\bof (the )?", "of ", key)]
    hit = next((tr[c] for c in cands if c in tr), None)
    if not hit:
        if key in extra:
            return extra[key], None, side
        return None, None, side
    return hit["es"], hit["la"], side


# --- recorrer OBJ -----------------------------------------------------------
HDR = {
    "File ID": "id", "Representation ID": "rep", "Concept ID": "fma",
    "English name": "en", "Bounds(mm)": "bounds", "Volume(cm3)": "vol",
}
parts = []
for fn in sorted(os.listdir(objdir)):
    if not fn.endswith(".obj"):
        continue
    meta = {}
    with open(os.path.join(objdir, fn), encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not line.startswith("#"):
                break
            if ":" in line:
                k, v = line[1:].split(":", 1)
                k = k.strip()
                if k in HDR:
                    meta[HDR[k]] = v.strip()
    eid = meta.get("id") or fn[:-4]
    meta["id"] = eid
    if not meta.get("en") or not meta.get("fma"):
        # cabecera vacía: usar el concepto más específico de isa_element_parts
        cs = sorted(isa_el.get(eid, ()))
        if cs:
            meta["fma"] = meta.get("fma") or cs[0]
            meta["en"] = meta.get("en") or isa_nm.get(cs[0], "")
    en = meta.get("en", "")
    en = en[:1].upper() + en[1:]
    low = en.lower()
    # 1) tipo de tejido por el árbol is_a (lo más fiable)
    isa_names = isa_ancestor_names(meta.get("id", fn[:-4]))
    system = next((s for s, rx in ISA_RULES if any(re.search(rx, n) for n in isa_names)), None)
    # 2) sistema por el árbol part_of
    if system is None:
        anc = ancestors(meta.get("fma", ""))
        system = next((s for f, s in FMA_SYSTEM if f in anc or f == meta.get("fma")), None)
    # 3) palabras clave del nombre
    if system is None:
        system = next((s for s, rx in KEYWORDS if re.search(rx, low)), None)
    system = system or "otros"
    es, la, side = translate(en)
    if es and side:
        es = f"{es} ({SIDE_ES[side]})"
    nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", meta.get("bounds", ""))]
    parts.append({
        "id": meta.get("id", fn[:-4]),
        "fma": meta.get("fma"),
        "en": en,
        "es": es,
        "la": la or None,
        "system": system,
        "vol": float(meta["vol"]) if meta.get("vol") else None,
        "bounds": nums if len(nums) == 6 else None,
    })

# quitar duplicados exactos (mismo nombre y mismos límites)
seen, uniq = set(), []
for p in parts:
    key = (p["en"].lower(), tuple(round(x, 1) for x in (p["bounds"] or [])))
    if key in seen:
        continue
    seen.add(key)
    uniq.append(p)
parts = uniq

counts = collections.Counter(p["system"] for p in parts)
translated = sum(1 for p in parts if p["es"])
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({"systems": SYSTEM_LABELS, "parts": parts}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
print("piezas:", len(parts), "| con nombre en español:", translated)
for s, n in counts.most_common():
    print(f"  {s:15s} {n}")
