# Servidor de la tienda

La tienda tiene dos modos con el mismo sitio:

- **Con servidor**: catálogo en la base, pedidos reales con sus archivos, panel con login y cobro con Mercado Pago.
- **Demostración** (sin servidor, como la vista previa): todo en el navegador, sin cobros. Es lo que pasa si la API no responde o todavía no está configurada.

Cada página pregunta `GET /api/health` al cargar (`assets/js/core/api.js`) y elige el modo sola.

## Piezas

| Pieza | Producción | Desarrollo y pruebas |
|---|---|---|
| API | Una función de Vercel: `api/index.js` (todo `/api/*` se reescribe ahí, ver `vercel.json`) | `npm run dev` (sirve sitio + API en el puerto 3000) |
| Base de datos | Postgres de Supabase | PGlite (Postgres en WebAssembly) en `.data/db` |
| Archivos | Supabase Storage: balde privado `pedidos` y público `disenos` | Carpeta `.data/archivos` |
| Login del panel | Supabase Auth + lista `OWNER_EMAILS` | Cuentas locales (`npm run usuaria -- mail`) |
| Pagos | Mercado Pago, Checkout Pro | Sin cobro (el pedido queda «cobro a coordinar») |

El código del servidor está en `api/_lib/`. Las tablas se crean solas la primera vez que arranca (`api/_lib/migrations.js`) y se cargan los datos iniciales del prototipo: catálogo, colores, diseños de la tienda, opiniones de ejemplo y tarifas de envío.

## Cómo es un pedido

1. La clienta completa sus datos y dirección. El envío se cotiza por código postal (`POST /api/shipping/quote`).
2. El navegador prepara los archivos de cada prenda: los **originales** tal como se subieron, la **vista previa** y el **archivo de impresión** (PNG transparente a 300 DPI) de cada cara estampada.
3. Pide URLs firmadas (`POST /api/uploads`) y sube cada archivo **directo al balde privado**, sin pasar por la función.
4. Manda el pedido (`POST /api/orders`). El servidor no confía en nada de lo que llega:
   - saca las caras estampadas y los diseños de la tienda del propio diseño;
   - recalcula los precios con la misma regla del sitio (`priceWith` en `assets/js/core/pricing.js`) y los datos de la base;
   - controla color, talle y stock;
   - lee cada archivo del balde y comprueba hash SHA-256, tamaño y tipo real. Rechaza los SVG con código o recursos externos;
   - cotiza el envío.
5. Crea el pedido en `pendiente_pago` y, si Mercado Pago está activo, la preferencia de pago. La clienta paga en Mercado Pago y vuelve a `pedido.html`.
6. Mercado Pago avisa a `POST /api/webhooks/mercadopago`. El servidor verifica la firma, **vuelve a pedir el pago a la API** y solo marca «Pagado» si el importe coincide.

La clienta sigue su pedido en `pedido.html?id=…&t=…`. El `t` es un token propio del pedido (HMAC del id): sin él no se ve nada. «Mis pedidos» lista los hechos desde ese navegador.

### Estados

`pendiente_pago` → `pagado` → `produccion` → `despachado` → `entregado`, y `cancelado` **solo desde `pendiente_pago` o `pagado`** (la política de la tienda: se cancela antes de producción). El servidor no deja saltar pasos. Cada cambio queda en el historial del pedido con quién lo hizo.

## Panel (`admin.html`)

Con servidor pide mail y contraseña. Tiene cuatro pestañas:

- **Diseños**: alta, edición, publicar/ocultar y baja de los diseños de la tienda (el archivo va al balde público).
- **Productos**: precio, visibilidad, destacados, colores, recargos y stock por talle.
- **Pedidos**: datos de la clienta y envío, vista previa, descarga del original, la vista previa, el archivo de impresión y el diseño editable (enlaces firmados de 15 minutos), cambio de estado con nota (por ejemplo, el número de seguimiento) y enlace para mandarle a la clienta.
- **Envíos**: tarifas por rango de código postal. **Solo el CP 5000 gratis es una regla real; las otras dos zonas tienen importes de ejemplo** y el panel las marca así hasta que se cambien.

## Ponerlo en producción

Hace falta, una sola vez:

1. **Base, archivos y login (Supabase).** En Vercel, en el proyecto de la tienda: *Storage → Create Database → Supabase* (o *Integrations → Supabase*), y conectarla al proyecto. La integración carga sola `POSTGRES_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
2. **Cuenta del panel.** En Supabase: *Authentication → Users → Add user*, con el mail y la contraseña de la dueña. Conviene apagar el registro público: *Authentication → Sign In / Providers → Allow new users to sign up* desactivado.
3. **Variables en Vercel** (*Settings → Environment Variables*):
   - `OWNER_EMAILS`: el o los mails que pueden entrar al panel, separados por coma.
   - `SESSION_SECRET` (recomendado): una frase larga al azar. Si falta se deriva de la clave de servicio.
4. **Mercado Pago.** En *Tus integraciones* crear una aplicación de Checkout Pro y cargar en Vercel:
   - `MP_ACCESS_TOKEN`: el Access Token (primero el de prueba, después el de producción).
   - En *Webhooks*, la URL `https://<dominio>/api/webhooks/mercadopago` con el evento *Pagos*, y su clave secreta en `MP_WEBHOOK_SECRET`.
5. Volver a desplegar. `https://<dominio>/api/health` tiene que mostrar `"ready": true`.

Mientras falte el paso 1, el sitio publicado sigue en modo demostración. Mientras falte el 4, los pedidos se registran como «cobro a coordinar».

Ninguna clave se escribe en el código ni en el chat: van solo en las variables de entorno.

### Variables

| Variable | Para qué |
|---|---|
| `DATABASE_URL` o `POSTGRES_URL` | Conexión a Postgres. La URL de la integración se limpia antes de usarla (`cleanUrl`). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Almacenamiento de archivos (solo en el servidor). |
| `SUPABASE_ANON_KEY` | Login del panel. |
| `OWNER_EMAILS` | Quién entra al panel. Vacío = nadie (con Supabase). |
| `SESSION_SECRET` | Firma de la sesión del panel y de los enlaces de pedido. **Si se cambia, los enlaces viejos de las clientas dejan de andar.** |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mercado Pago. |
| `PUBLIC_URL` | Dirección pública, si no es la del pedido (para los enlaces de vuelta de Mercado Pago). |

`.env.example` tiene la lista para el servidor local.

## Seguridad

- Balde de pedidos **privado**; los archivos se ven solo con enlaces firmados que vencen, emitidos por el panel.
- Las tablas tienen RLS activado y sin políticas: la API REST pública de Supabase no puede leerlas. Todo pasa por este servidor.
- Sesión del panel en cookie `HttpOnly`, `SameSite=Strict`, 12 horas; las acciones que cambian datos además exigen que el `Origin` sea el de la tienda. Freno a los intentos de contraseña.
- Precios, stock y envío siempre recalculados en el servidor; los pedidos repetidos por un reintento no se duplican (`idempotencyKey`).
- Pendiente para más adelante: limpiar archivos subidos que nunca llegaron a un pedido, y avisos por mail.

## Desarrollo

```bash
npm install
npm run usuaria -- tu@mail.com     # cuenta local del panel
npm run dev                        # http://localhost:3000
```

Pruebas:

```bash
npm test                           # API: PGlite en memoria, Supabase y Mercado Pago simulados
node tests/e2e-servidor.mjs        # navegador con servidor: login, checkout, archivos, producción
node tests/e2e.mjs                 # navegador en modo demostración (servidor estático en :8080)
```

`TEST_DATABASE_URL=postgres://… npm test` corre las pruebas de la API contra un Postgres real, con el mismo driver que producción.
