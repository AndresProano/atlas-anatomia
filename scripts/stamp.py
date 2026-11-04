"""Sella los archivos de web/ con una versión (?v=<hash>) para que los navegadores no usen copias viejas.

Uso: python -I scripts/stamp.py   (publish.sh lo corre antes de publicar)
El hash sale del contenido de web/ sin los sellos, así que no cambia si nada cambió.
"""
import hashlib
import os
import re

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
STAMP = re.compile(r"\?v=[0-9a-z]+")
IMPORT = re.compile(r"""(from\s+'\./[\w-]+\.js)(\?v=[0-9a-z]+)?(')""")

h = hashlib.sha1()
for d, _, files in sorted(os.walk(WEB)):
    for f in sorted(files):
        p = os.path.join(d, f)
        data = open(p, "rb").read()
        if f.endswith((".js", ".html", ".css")):
            data = STAMP.sub("", data.decode("utf-8")).encode("utf-8")
            data = re.sub(rb"window\.ATLAS_V = '[0-9a-z]+'", b"", data)
        h.update(f.encode() + data)
v = h.hexdigest()[:8]

changed = 0
for f in os.listdir(os.path.join(WEB, "js")):
    p = os.path.join(WEB, "js", f)
    s = open(p, encoding="utf-8").read()
    n = IMPORT.sub(lambda m: f"{m.group(1)}?v={v}{m.group(3)}", s)
    if n != s:
        open(p, "w", encoding="utf-8", newline="").write(n)
        changed += 1

p = os.path.join(WEB, "index.html")
s = open(p, encoding="utf-8").read()
n = re.sub(r'href="styles\.css(\?v=[0-9a-z]+)?"', f'href="styles.css?v={v}"', s)
n = re.sub(r'src="js/main\.js(\?v=[0-9a-z]+)?"', f'src="js/main.js?v={v}"', n)
n = re.sub(r"window\.ATLAS_V = '[0-9a-z]+'", f"window.ATLAS_V = '{v}'", n)
if n != s:
    open(p, "w", encoding="utf-8", newline="").write(n)
    changed += 1
print(f"versión {v} · archivos actualizados: {changed}")
