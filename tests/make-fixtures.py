"""Genera archivos de prueba para tests/e2e.mjs (requiere Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).parent / "fixtures"
out.mkdir(exist_ok=True)

# PNG grande con transparencia (alta resolución)
img = Image.new("RGBA", (3000, 3000), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
colors = [(213, 45, 0), (255, 154, 86), (255, 255, 255), (211, 98, 164), (165, 0, 98)]
for i, c in enumerate(colors):
    d.rectangle([300, 300 + i * 480, 2700, 300 + (i + 1) * 480 - 40], fill=c + (255,))
d.ellipse([1100, 1100, 1900, 1900], fill=(18, 18, 18, 255))
img.save(out / "grafica-alta.png")

# PNG chico (baja resolución para el tamaño de impresión)
small = img.resize((320, 320))
small.save(out / "grafica-baja.png")

# JPG
jpg = Image.new("RGB", (2400, 1600), (245, 245, 243))
d = ImageDraw.Draw(jpg)
d.rectangle([200, 200, 2200, 1400], outline=(165, 0, 98), width=40)
d.polygon([(1200, 300), (2000, 1300), (400, 1300)], fill=(213, 45, 0))
jpg.save(out / "foto.jpg", quality=92)

# SVG válido sin width/height (solo viewBox)
(out / "logo.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">'
    '<rect width="200" height="100" rx="12" fill="#A50062"/>'
    '<circle cx="50" cy="50" r="30" fill="#FF9A56"/></svg>'
)

# SVG malicioso (debe rechazarse)
(out / "malicioso.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
    '<script>alert(1)</script><rect width="100" height="100"/></svg>'
)

# Archivo de texto disfrazado de PNG (debe rechazarse)
(out / "falso.png").write_text("esto no es una imagen")

# Formato no admitido
(out / "documento.gif").write_bytes(b"GIF89a\x01\x00\x01\x00\x00\x00\x00;")
print("fixtures OK:", sorted(p.name for p in out.iterdir()))
