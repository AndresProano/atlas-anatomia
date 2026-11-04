"""Catálogo de órganos de referencia 3D de HuBMAP (Human Reference Atlas, CC BY 4.0).

Uso: python -I scripts/hubmap.py <reference-organs.json> <sizes.json> <salida hubmap.json>
Los GLB no se copian: el visor los carga bajo demanda desde cdn.humanatlas.io (permite CORS).
"""
import json
import sys

src, sizes_path, out = sys.argv[1:4]
organs = json.load(open(src, encoding="utf-8"))
sizes = json.load(open(sizes_path, encoding="utf-8"))

ES = {
    "adipose": "Tejido adiposo", "blood vasculature": "Vasculatura sanguínea", "brain": "Encéfalo",
    "epiploic appendage of transverse colon": "Apéndice epiploico del colon transverso",
    "left eye": "Ojo izquierdo", "right eye": "Ojo derecho",
    "left fallopian tube": "Trompa uterina izquierda", "right fallopian tube": "Trompa uterina derecha",
    "heart": "Corazón", "intervertebral disk": "Discos intervertebrales",
    "left kidney": "Riñón izquierdo", "right kidney": "Riñón derecho",
    "left knee": "Rodilla izquierda", "right knee": "Rodilla derecha",
    "large intestine": "Intestino grueso", "larynx": "Laringe", "liver": "Hígado", "lung": "Pulmones",
    "lymph node": "Ganglio linfático", "main bronchus": "Bronquios principales",
    "left mammary gland": "Glándula mamaria izquierda", "right mammary gland": "Glándula mamaria derecha",
    "manubrium": "Manubrio del esternón", "mouth": "Boca", "omentum": "Omento",
    "left ovary": "Ovario izquierdo", "right ovary": "Ovario derecho",
    "left palatine tonsil": "Amígdala palatina izquierda", "right palatine tonsil": "Amígdala palatina derecha",
    "pancreas": "Páncreas", "pelvis": "Pelvis", "placenta full term": "Placenta a término",
    "prostate": "Próstata", "left renal pelvis": "Pelvis renal izquierda", "right renal pelvis": "Pelvis renal derecha",
    "skin": "Piel", "small intestine": "Intestino delgado", "spinal cord": "Médula espinal", "spleen": "Bazo",
    "sternum": "Esternón", "thymus": "Timo", "trachea": "Tráquea",
    "left ureter": "Uréter izquierdo", "right ureter": "Uréter derecho",
    "urinary bladder": "Vejiga urinaria", "uterus": "Útero",
}

items = []
for o in organs:
    url = o["object"]["file"]
    label = o["label"]
    items.append({
        "id": url.rsplit("/", 1)[-1][:-4],
        "en": label[:1].upper() + label[1:],
        "es": ES.get(label.lower(), label),
        "sex": {"Female": "F", "Male": "M"}.get(o.get("sex"), "?"),
        "url": url,
        "bytes": sizes.get(url, 0),
        "uberon": o.get("representation_of", "").rsplit("/", 1)[-1],
        "dims_mm": [round(o.get(k, 0), 1) for k in ("x_dimension", "y_dimension", "z_dimension")],
    })
items.sort(key=lambda x: (x["es"], x["sex"]))
missing = sorted({i["en"] for i in items if i["es"] == i["en"]})
json.dump(items, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("órganos:", len(items), "| sin traducción:", missing)
