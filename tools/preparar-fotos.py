"""Normaliza las fotos de prendas al escenario lógico 1000x1200 de la tienda.
Uso: python3 -I build.py <carpeta_fotos> <carpeta_salida> [--debug <png>]"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
DEBUG = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--debug" else None
W, H = 1000, 1200

AREAS = {
  "tee": (332, 250, 336, 448), "oversize": (320, 270, 360, 470), "hoodie": (350, 470, 300, 280),
  "crewneck": (330, 330, 340, 440), "cap": (360, 500, 280, 190), "tote": (280, 470, 440, 540),
}
# bbox de referencia de la prenda vectorial: (cx, ancho, top)
REF = {"tee": (500, 860, 120), "oversize": (500, 890, 130), "hoodie": (500, 784, 52),
       "crewneck": (500, 784, 200), "tote": (500, 640, 340)}

# fotos: archivo, bbox en la foto (x0, x1, top) o "center" (cx, cy, w) para gorras; ajustes opcionales
TEES = {"blanco": ("678c8f25-descarga_11.jpg", (37, 704, 15)),
        "negro": ("d1adedbf-descarga_12.jpg", (40, 692, 18)),
        "arena": ("11af7b29-983825481302129358.jpg", (33, 700, 15)),
        "grafito": ("x1-reichstadt.jpg", (64, 666, 238)),
        "rosa-palo": ("t-rosapalo.png", (47, 458, 47)),
        "nude": ("t-nude.png", (43, 448, 49)),
        "marron-claro": ("t-marron.png", (49, 457, 56)),
        "gris": ("t-gris.png", (43, 447, 57))}
JOBS = []
for t in ("tee", "oversize"):
    for c, (f, bb) in TEES.items():
        JOBS.append((t, c, f, bb, {}))
for c, f, bb in [("marino", "09bff9fb-904308800196153010.jpg", (39, 690, 197)),
                 ("blanco", "26a6c653-1134273856169010771.jpg", (28, 669, 135)),
                 ("bordo", "6d8c58de-1040683426398614524.jpg", (30, 676, 127)),
                 ("marron", "6e87cee2-419749627778383093.jpg", (16, 401, 150)),
                 ("rosa", "74815543-Professionals_sweatshirt_without_logo_available_.jpg", (52, 690, 108)),
                 ("negro", "ae0c2b30-descarga_17.jpg", (30, 700, 134)),
                 ("rojo", "ea97156a-948570740237745833.jpg", (33, 699, 127))]:
    JOBS.append(("crewneck", c, f, bb, {}))
JOBS += [("hoodie", "blanco", "2e8d6f71-descarga_14.jpg", (33, 711, 160), {"dy": 130}),
         ("hoodie", "negro", "x4-virtuoso2.jpg", (63, 671, 29), {"dy": 190}),
         ("tote", "crudo", "3bc0477d-descarga_15.jpg", (60, 597, 453), {}),
         ("tote", "negro", "0093bcdf-descarga_16.jpg", (142, 607, 291), {}),
         ("cap", "naranja", "0ec842de-Classic_Cap.jpg", ("center", 368, 335, 251), {}),
         ("cap", "verde", "3d572a91-Lift_Down_Classic_Cap.jpg", ("center", 371, 328, 246), {}),
         ("cap", "azul", "x2-washed-cap.jpg", ("center", 358, 314, 269), {}),
         ("cap", "celeste", "x3-tide.jpg", ("center", 328, 410, 239), {})]

# Retoques: marcas de terceros (etiquetas, marcas de agua) -> rectángulos a cubrir
RETOUCH = {
  "ea97156a-948570740237745833.jpg": [(358, 160, 386, 193)],
  "6e87cee2-419749627778383093.jpg": [(398, 455, 429, 615)],
  "x4-virtuoso2.jpg": [(322, 114, 408, 170)],
  "2e8d6f71-descarga_14.jpg": [(350, 236, 380, 266)],
  "74815543-Professionals_sweatshirt_without_logo_available_.jpg": [(330, 55, 450, 95)],
}

def retouch(im, rects):
    a = np.asarray(im).astype(float)
    for (x0, y0, x1, y1) in rects:
        h, w = y1 - y0, x1 - x0
        # interpolación entre los bordes (izq/der y arriba/abajo) + grano
        m = 4
        if x1 >= a.shape[1] - 1:  # pegado al borde derecho: fondo liso
            bgc = np.median(a[30:100, x0 - 40:x0 - 10].reshape(-1, 3), 0)
            L = R = np.tile(bgc, (h, 1))
        else:
            L = a[y0:y1, max(0, x0 - m):x0].mean(1) if x0 >= 1 else a[y0:y1, x1:x1 + m].mean(1)
            R = a[y0:y1, x1:x1 + m].mean(1)
        T = a[max(0, y0 - m):y0, x0:x1].mean(0)
        B = a[y1:y1 + m, x0:x1].mean(0)
        if x1 >= a.shape[1] - 1:
            T = B = np.tile(bgc, (w, 1))
        tx = np.linspace(0, 1, w)[None, :, None]
        ty = np.linspace(0, 1, h)[:, None, None]
        horiz = L[:, None, :] * (1 - tx) + R[:, None, :] * tx
        vert = T[None, :, :] * (1 - ty) + B[None, :, :] * ty
        fill = (horiz + vert) / 2
        rng = np.random.default_rng(1)
        fill += rng.normal(0, 2.5, fill.shape)
        a[y0:y1, x0:x1] = fill
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # suavizar la zona retocada
    blur = out.filter(ImageFilter.GaussianBlur(2))
    mask = Image.new("L", out.size, 0)
    d = ImageDraw.Draw(mask)
    for (x0, y0, x1, y1) in rects:
        d.rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    return Image.composite(blur, out, mask)

def padded(im, P=700):
    a = np.asarray(im)
    p = np.pad(a, ((P, P), (P, P), (0, 0)), mode="edge")
    big = Image.fromarray(p).filter(ImageFilter.GaussianBlur(30))
    # lejos de la foto, el relleno se funde con el color del fondo (sin manchas de la prenda)
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bgc = np.median(border, 0)
    hh, ww = p.shape[:2]
    yy = np.arange(hh)[:, None]; xx = np.arange(ww)[None, :]
    dist = np.maximum(np.maximum(P - yy, yy - (P + im.height - 1)), np.maximum(P - xx, xx - (P + im.width - 1)))
    t = np.clip(dist / 120, 0, 1)[..., None] ** 0.7
    big = Image.fromarray((np.asarray(big).astype(float) * (1 - t) + bgc * t).astype(np.uint8))
    mask = Image.new("L", big.size, 0)
    ImageDraw.Draw(mask).rectangle((P + 6, P + 6, P + im.width - 7, P + im.height - 7), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(5))
    big.paste(Image.fromarray(p), (0, 0), mask)
    return big, P

meta = {}
dbg = []
os.makedirs(OUT, exist_ok=True)
for (t, c, f, bb, adj) in JOBS:
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    if f in RETOUCH:
        im = retouch(im, RETOUCH[f])
    ax, ay, aw, ah = AREAS[t]
    if bb[0] == "center":
        _, cx, cy, w = bb
        s = aw / w
        sx, sy, dx, dy = cx, cy, ax + aw / 2, ay + ah / 2
    else:
        x0, x1, top = bb
        rcx, rw, rtop = REF[t]
        s = rw / (x1 - x0)
        sx, sy, dx, dy = (x0 + x1) / 2, top, rcx, rtop
    s *= adj.get("s", 1)
    dy += adj.get("dy", 0)
    big, P = padded(im)
    a_, c_ = 1 / s, sx + P - dx / s
    e_, f_ = 1 / s, sy + P - dy / s
    photo = big.transform((W, H), Image.AFFINE, (a_, 0, c_, 0, e_, f_), resample=Image.BICUBIC)
    name = f"{t}-{c}"
    photo.save(os.path.join(OUT, name + ".jpg"), quality=82, optimize=True, progressive=True)

    # mapas de luz para la estampa: sólo dentro del área imprimible
    g = np.asarray(photo.convert("L").filter(ImageFilter.GaussianBlur(1.2))).astype(float)
    region = g[ay:ay + ah, ax:ax + aw]
    med = float(np.median(region))
    rgb = np.asarray(photo).astype(float)[ay:ay + ah, ax:ax + aw].reshape(-1, 3)
    hexcol = "#%02x%02x%02x" % tuple(int(v) for v in np.median(rgb, 0))
    dark = med < 70
    ratio = np.clip(g / max(med, 1), 0, 1.5)
    shade = np.clip(ratio, 0, 1) ** (0.55 if dark else 0.9)
    shade = np.clip(shade, 0.5, 1)
    light = np.clip((g - med) / max(255 - med, 1), 0, 1) * (0.9 if dark else 0.5)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rectangle((ax - 30, ay - 30, ax + aw + 30, ay + ah + 30), fill=255)
    mk = np.asarray(mask.filter(ImageFilter.GaussianBlur(14))).astype(float) / 255
    shade = 1 - (1 - shade) * mk
    light = light * mk
    Image.fromarray((shade * 255).astype(np.uint8)).resize((500, 600), Image.BILINEAR).save(os.path.join(OUT, name + "-sombra.png"), optimize=True)
    Image.fromarray((light * 255).astype(np.uint8)).resize((500, 600), Image.BILINEAR).save(os.path.join(OUT, name + "-brillo.png"), optimize=True)
    meta[name] = {"type": t, "color": c, "hex": hexcol, "median": round(med), "source": f}
    if DEBUG:
        d = photo.copy()
        dr = ImageDraw.Draw(d)
        dr.rectangle((ax, ay, ax + aw, ay + ah), outline=(255, 0, 200), width=5)
        dr.text((20, 20), name + " " + hexcol, fill=(255, 0, 200))
        dbg.append(d.resize((250, 300)))
json.dump(meta, open(os.path.join(OUT, "_meta.json"), "w"), indent=1)
if DEBUG:
    cols = 8
    rows = (len(dbg) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 250, rows * 300), "white")
    for i, d in enumerate(dbg):
        sheet.paste(d, ((i % cols) * 250, (i // cols) * 300))
    sheet.save(DEBUG)
print(json.dumps(meta, indent=0))
