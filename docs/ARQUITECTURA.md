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

## Persistencia en modo demostración (qué es local)

| Dato | Dónde | Limitación |
|---|---|---|
| Carrito (`nevrado.cart.v1`) | localStorage | ~5 MB, solo este navegador, se borra con los datos del sitio |
| Diseños (`nevrado.designs.v1`) | localStorage | Ídem. Autoguardado de borradores cada cambio |
| Originales | IndexedDB `nevrado-assets` | Cuota del navegador; no hay limpieza automática de originales huérfanos |
| Catálogo editado en el panel (`nevrado.catalog.v1`) | localStorage | Si no existe se usa la semilla de `data/catalog.js` |
| Diseños de la tienda (`nevrado.store-designs.v1`) | localStorage + IndexedDB para los archivos subidos | Esquema `nevrado.store-design/v1`; los de la semilla viven en `assets/designs/` |
| Pedidos de prueba (`nevrado.orders.v1`) | localStorage | Los crea el checkout demo; no hay cobro |

Ninguna pantalla presenta esto como guardado en un servidor: la interfaz dice «guardado en este navegador». Con servidor, el carrito y los borradores siguen en el navegador hasta confirmar el pedido; catálogo, diseños de la tienda y pedidos pasan a la base.

## Backend

Implementado en `api/` (función de Vercel + Supabase + Mercado Pago). Modelo de datos, endpoints, estados de pedido, puesta en producción y seguridad: **[SERVIDOR.md](SERVIDOR.md)**.

Diferencias con el plan original: los diseños se congelan dentro de cada `order_item` (jsonb) en lugar de una tabla `designs` aparte, el carrito sigue en el navegador hasta confirmar el pedido, y el stock es por talle (como en el panel).

### Seguridad

- Bucket **privado**; acceso solo con URLs firmadas que expiran, emitidas tras verificar permisos (cliente dueño o staff).
- Validación de archivos repetida en el servidor (el navegador es solo una primera barrera): magic bytes, límites, SVG saneado o rechazado, escaneo antivirus opcional.
- Credenciales (DB, bucket, pasarela de pago) solo en variables de entorno del backend.
- Precios y stock siempre recalculados en el servidor; el total del cliente es informativo.
- Webhooks de pago verificados por firma; idempotencia en la creación de órdenes.
