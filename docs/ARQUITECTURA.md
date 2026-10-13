# Arquitectura

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| HTML + CSS + JS vanilla con **módulos ES**, una página por pantalla | Sin build ni framework, como pidió el brief. Los módulos separan datos, lógica y vistas y se pueden migrar tal cual a un bundler. |
| **Fabric.js 5.3.0 local** | API estable y documentada; v6 cambia a ESM y promesas, sin ventaja para este alcance. Local para no depender de un CDN. |
| **Espacio lógico fijo de 1000 × 1200 unidades** por prenda | Mockup, guías y canvas comparten el mismo sistema de coordenadas. El editor solo cambia el zoom según la pantalla, así el área imprimible nunca se desalinea ni depende de píxeles de pantalla. |
| `cmPerUnit` por tipo de prenda | Convierte el espacio lógico en medidas físicas (talle M de referencia). Las medidas en cm del panel, el DPI efectivo y el tamaño del archivo de impresión salen de ahí. |
| Guías en un **SVG superpuesto**, fuera de Fabric | No forman parte del JSON ni de ninguna exportación. |
| Originales en **IndexedDB**, identificados por **SHA-256** | localStorage no soporta binarios grandes. El hash sirve de id, deduplica y permite verificar integridad. El Blob guardado es el `File` original, sin recomprimir. |
| JSON editable con `src: "asset:<sha256>"` | El diseño no embebe binarios: se reconstruye resolviendo los originales aparte, igual que lo haría un backend con almacenamiento de objetos. |
| Exportación desde un `StaticCanvas` fuera de pantalla | La resolución de exportación no depende de la del editor; se renderiza con caché desactivada y a la escala física pedida. |
| `NUM_FRACTION_DIGITS = 6` | Fabric redondea por defecto a 2 decimales; una escala 0.0896 pasaba a 0.09 y alteraba el tamaño impreso. Detectado por las pruebas. |
| Precio calculado en un único módulo (`pricing.js`) | Selector, editor, resumen y carrito usan la misma función: talle, caras adicionales y técnica se suman igual en todas partes. El carrito recalcula desde el catálogo en vez de confiar en el importe guardado. |

## Los cuatro elementos de un diseño

| Elemento | En el prototipo | En producción |
|---|---|---|
| **Archivo original** | IndexedDB, Blob sin modificar + SHA-256 | Bucket privado (S3/GCS/R2), clave por hash, URL firmada de corta duración |
| **Diseño editable** | `nevrado.design/v1`: JSON de Fabric por cara + metadatos de área física + lista de assets | Tabla `designs` (JSONB) versionada |
| **Vista previa** | PNG 1200×1440 generado en el navegador | Generado en el servidor al confirmar (no confiar en el del cliente) y guardado con el pedido |
| **Archivo de impresión** | PNG transparente del área (o recortado al contenido), 150/200/300 DPI, con chunk `pHYs` | Render en servidor (p. ej. node-canvas/Fabric en Node o Skia) desde el JSON + originales, por técnica |

Esquema del JSON editable (resumido):

```json
{
  "schema": "nevrado.design/v1",
  "product": { "id": "remera-clasica", "sku": "DEMO-TEE-01", "type": "tee" },
  "variant": { "colorId": "negro", "sizeId": "L", "qty": 2 },
  "faces": {
    "front": {
      "printArea": { "x": 332, "y": 250, "w": 336, "h": 448 },
      "physical": { "widthCm": 30.2, "heightCm": 40.3, "cmPerUnit": 0.09 },
      "fabric": { "version": "5.3.0", "objects": [
        { "type": "image", "src": "asset:9f2c…", "assetId": "9f2c…", "srcWidth": 3000, "left": 500, "top": 474, "scaleX": 0.0896, "…": "…" },
        { "type": "i-text", "text": "nevrado", "fontFamily": "Archivo Black", "…": "…" }
      ] }
    }
  },
  "assets": [ { "id": "9f2c…", "filename": "grafica.png", "mime": "image/png", "bytes": 50029, "widthPx": 3000, "path": "originals/…" } ]
}
```

## Persistencia del prototipo (qué es local)

| Dato | Dónde | Limitación |
|---|---|---|
| Carrito (`nevrado.cart.v1`) | localStorage | ~5 MB, solo este navegador, se borra con los datos del sitio |
| Diseños (`nevrado.designs.v1`) | localStorage | Ídem. Autoguardado de borradores cada cambio |
| Originales | IndexedDB `nevrado-assets` | Cuota del navegador; no hay limpieza automática de originales huérfanos |

Ninguna pantalla presenta esto como guardado en un servidor: la interfaz dice «guardado en este navegador».

## Plan de backend

### Modelo de datos (PostgreSQL sugerido)

```
users(id, email, password_hash | oauth, role[customer|staff|admin], created_at)
garment_types(id, name, faces jsonb, cm_per_unit)                 -- tee, oversize, hoodie, tote…
products(id, sku, garment_type_id, name, description, base_price, active)
colors(id, name, hex)            product_colors(product_id, color_id)
sizes(id, label, sort)           product_sizes(product_id, size_id, surcharge)
variants(id, product_id, color_id, size_id, sku, stock)          -- stock real por variante
print_areas(garment_type_id, face, x, y, w, h, max_w_cm, max_h_cm)
techniques(id, name, min_dpi, ideal_dpi, surcharge_per_face, active)
assets(id uuid, sha256, owner_user_id, storage_key, mime, bytes, width_px, height_px, is_vector, created_at)
designs(id, owner_user_id, product_id, variant_id, doc jsonb, version, status[draft|final], created_at)
design_assets(design_id, asset_id)
carts(id, user_id | session_id)  cart_items(id, cart_id, variant_id, qty, design_id)
orders(id, user_id, status, subtotal, shipping, total, currency, payment_status, created_at)
order_items(id, order_id, variant_id, qty, unit_price, design_id, design_version,
            preview_asset_id, print_asset_ids jsonb, production_status)
production_events(id, order_item_id, status, note, staff_user_id, created_at)
```

Cada `order_item` congela la versión del diseño, sus originales, vista previa y exportaciones: el taller imprime exactamente lo que el cliente aprobó.

### API (REST)

```
GET    /api/products                     catálogo (reemplaza data/catalog.js)
POST   /api/assets/upload-url            URL firmada de subida (PUT directo al bucket)
POST   /api/assets/:id/complete          valida tipo real, hash, tamaño; sanea/rechaza SVG en servidor
GET    /api/designs/:id   PUT /api/designs/:id   POST /api/designs
GET    /api/cart   POST /api/cart/items   PATCH/DELETE /api/cart/items/:id
POST   /api/checkout                     recalcula precios y stock, crea orden pendiente, crea pago
POST   /api/payments/webhook             confirma pago (Mercado Pago / Stripe)
GET    /api/orders  GET /api/orders/:id
Admin: CRUD productos/variantes/técnicas, cola de producción, cambio de estado,
       GET /api/admin/order-items/:id/files → URLs firmadas temporales a originales e impresión
```

### Seguridad

- Bucket **privado**; acceso solo con URLs firmadas que expiran, emitidas tras verificar permisos (cliente dueño o staff).
- Validación de archivos repetida en el servidor (el navegador es solo una primera barrera): magic bytes, límites, SVG saneado o rechazado, escaneo antivirus opcional.
- Credenciales (DB, bucket, pasarela de pago) solo en variables de entorno del backend.
- Precios y stock siempre recalculados en el servidor; el total del cliente es informativo.
- Webhooks de pago verificados por firma; idempotencia en la creación de órdenes.
