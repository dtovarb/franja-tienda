# nevrado: prototipo de tienda de ropa personalizada

Prototipo funcional de una tienda streetwear con editor de prendas (Fabric.js), carrito en el navegador y exportación de archivos para producción. **Sin backend**: todo corre en el navegador y los datos quedan solo en ese navegador.

> Productos, precios, stock, contacto e imágenes son de **demostración**. No se procesan pagos ni se crean pedidos reales.

## Cómo ejecutarlo

Necesitás un servidor estático (los módulos ES no funcionan abriendo el HTML con `file://`). Cualquiera de estas opciones, desde esta carpeta:

```bash
python3 -m http.server 8080        # Python 3 (sin instalar nada)
# o
npx serve -l 8080 .                # Node.js
```

Abrí <http://localhost:8080>.

**Dependencias de ejecución:** ninguna para instalar. Todo está incluido en el proyecto:

| Recurso | Versión | Dónde |
|---|---|---|
| Fabric.js | 5.3.0 (MIT) | `vendor/fabric/fabric.min.js` (local, sin CDN) |
| Fuentes Archivo, Space Grotesk, Space Mono, Anton, Archivo Black, Bebas Neue, Permanent Marker | OFL 1.1 | `assets/fonts/` (local, licencias en `assets/fonts/licenses/`) |

Se eligió servir Fabric.js y las fuentes localmente para que el editor funcione sin depender de servicios externos y para que el texto exportado use exactamente las mismas tipografías que se ven en pantalla.

Navegadores: Chrome/Edge, Firefox y Safari recientes (usa módulos ES, IndexedDB, `<dialog>` y `crypto.subtle`, que requiere `localhost` o HTTPS).

## Pruebas automatizadas

```bash
python3 -m http.server 8080 &                 # servidor
python3 tests/make-fixtures.py                # genera imágenes de prueba (requiere Pillow)
npm i -D playwright && npx playwright install chromium   # si no lo tenés
node tests/e2e.mjs http://localhost:8080
```

Recorre el flujo completo en escritorio (1440×900), móvil táctil (390×844) y tablet (820×1180). Resultados en `tests/results.json` y capturas en `tests/screenshots/`.

## Panel de la tienda (demo)

`admin.html` (enlace en el pie: «Panel de la tienda (demo)») administra diseños de la tienda, productos (precio, visibilidad, destacados, colores, recargos y stock por talle) y los pedidos de prueba del checkout. **No tiene login y guarda todo en el navegador**: es para probar el circuito, no para usar con la tienda publicada. «Restablecer datos de demostración» vuelve al estado inicial.

## Fotos de prendas

El frente de remeras, remeras oversize, buzo canguro, buzo cuello redondo, gorra y tote usa fotos (`assets/img/prendas/`). La espalda y el buzo con capucha sin bolsillo siguen ilustrados porque no hay foto.

**Las fotos actuales son de referencia y de terceros: hay que reemplazarlas por fotos propias antes de publicar la tienda.** Para cambiar una foto:

1. Sacá la foto de frente, con la prenda centrada y fondo liso (mejor si todas tienen la misma luz y el mismo fondo).
2. Cargala en la lista `JOBS` de `tools/preparar-fotos.py` con el contorno de la prenda en píxeles (izquierda, derecha y borde superior).
3. Corré `python3 tools/preparar-fotos.py <carpeta-fotos> assets/img/prendas --debug control.png` y revisá en `control.png` que el recuadro del área de impresión caiga sobre el pecho.

El script lleva la foto al escenario de 1000 × 1200 sin mover las áreas de impresión y genera los mapas de luz (`-sombra.png`, `-brillo.png`) que hacen que la estampa tome los pliegues de la tela. Los colores de `GARMENT_COLORS` salen de la tela de cada foto.

## Preguntas frecuentes y opiniones

`preguntas.html` responde cómo trabaja la tienda; lo que todavía no está decidido (plazos, envíos, pagos, cambios) está marcado «A definir». Las opiniones (`assets/js/data/reviews.js`) son **simuladas** y se muestran siempre como «Opiniones de ejemplo»; cuando haya reales se cargan con la misma estructura desde el backend. No se publican como datos estructurados para buscadores.

## Estructura

```
index.html  catalogo.html  producto.html  disenos.html  editor.html  carrito.html  preguntas.html  admin.html
assets/
  css/   tokens.css (variables de marca)  fonts.css  base.css  pages.css  editor.css  admin.css
  js/
    data/     catalog.js (productos demo, colores de prenda, talles, stock)
              garments.js (mockups SVG y áreas imprimibles por tipo de prenda)
              art.js (gráficas de demostración)  reviews.js (opiniones de ejemplo)
    core/     cart.js  designs.js  pricing.js  storage.js  asset-store.js  ui.js  format.js
              store-designs.js (diseños de la tienda)  orders.js (pedidos de prueba)
    pages/    home.js  catalog.js  product.js  designs.js  cart.js  admin.js  components.js
    editor/   main.js (estado, canvas, caras, historial, atajos)
              props.js  layers.js  product-panel.js (paneles)
              upload.js (validación de archivos)  serialize.js (JSON editable)
              export.js (vista previa, impresión, JSON, ZIP)  zip.js (ZIP, PNG DPI)
              finalize.js (flujo «Finalizar diseño»)  history.js  config.js
  designs/ (SVG de los diseños de la tienda)  fonts/  img/prendas/ (fotos y mapas de luz)
vendor/fabric/
tools/    preparar-fotos.py (normaliza fotos de prendas)
tests/    e2e.mjs  make-fixtures.py  fixtures/  screenshots/
docs/     ARQUITECTURA.md
RESUMEN.md   ← funciones, pruebas, limitaciones y próximos pasos
```

Más detalle técnico (modelo de datos, decisiones y plan de backend) en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
