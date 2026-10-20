"""Recalcula los mapas de luz (-sombra.png y -brillo.png) de cada foto de prenda
a partir de la foto ya normalizada, cubriendo las zonas de estampa del cuerpo
de la prenda (frente y logos, en todos los talles).

Uso:
  node tools/zonas-de-estampa.mjs > /tmp/zonas.json
  python3 -I tools/mapas-de-luz.py assets/img/prendas /tmp/zonas.json

Va después de tools/preparar-fotos.py, o cada vez que cambien las zonas en
assets/js/data/garments.js."""
import sys, os, json, glob
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

DIR, ZONAS = sys.argv[1], json.load(open(sys.argv[2]))
W, H = 1000, 1200
M = 30  # margen alrededor de cada zona, para que la sombra no corte en seco

for path in sorted(glob.glob(os.path.join(DIR, "*.jpg"))):
    name = os.path.basename(path)[:-4]
    t = name.split("-")[0]
    if t not in ZONAS:
        continue
    photo = Image.open(path).convert("RGB")
    if photo.size != (W, H):
        photo = photo.resize((W, H), Image.BICUBIC)
    g = np.asarray(photo.convert("L").filter(ImageFilter.GaussianBlur(1.2))).astype(float)
    # el tono de referencia sale del frente, como en preparar-fotos.py
    ax, ay, aw, ah = ZONAS[t]["front"]
    med = float(np.median(g[ay:ay + ah, ax:ax + aw]))
    dark = med < 70
    ratio = np.clip(g / max(med, 1), 0, 1.5)
    shade = np.clip(np.clip(ratio, 0, 1) ** (0.55 if dark else 0.9), 0.5, 1)
    light = np.clip((g - med) / max(255 - med, 1), 0, 1) * (0.9 if dark else 0.5)
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    for (x, y, w, h) in ZONAS[t]["zones"]:
        d.rectangle((x - M, y - M, x + w + M, y + h + M), fill=255)
    mk = np.asarray(mask.filter(ImageFilter.GaussianBlur(14))).astype(float) / 255
    shade = 1 - (1 - shade) * mk
    light = light * mk
    Image.fromarray((shade * 255).astype(np.uint8)).resize((500, 600), Image.BILINEAR).save(os.path.join(DIR, name + "-sombra.png"), optimize=True)
    Image.fromarray((light * 255).astype(np.uint8)).resize((500, 600), Image.BILINEAR).save(os.path.join(DIR, name + "-brillo.png"), optimize=True)
    print(name, round(med))
