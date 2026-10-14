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

1. La clienta completa sus datos y dirección. El envío se cotiza por código postal y por el peso del pedido (`POST /api/shipping/quote`, ver «Envíos» abajo) y ella elige la opción.
2. El navegador prepara los archivos de cada prenda: los **originales** tal como se subieron, la **vista previa** y el **archivo de impresión** (PNG transparente a 300 DPI) de cada cara estampada.
3. Pide URLs firmadas (`POST /api/uploads`) y sube cada archivo **directo al balde privado**, sin pasar por la función.
4. Manda el pedido (`POST /api/orders`). El servidor no confía en nada de lo que llega:
   - saca las caras estampadas y los diseños de la tienda del propio diseño;
   - recalcula los precios con la misma regla del sitio (`priceWith` en `assets/js/core/pricing.js`) y los datos de la base;
   - controla color, talle y stock;
   - lee cada archivo del balde y comprueba hash SHA-256, tamaño y tipo real. Rechaza los SVG con código o recursos externos;
   - vuelve a cotizar el envío y cobra la opción que eligió la clienta.
5. Crea el pedido en `pendiente_pago` y, si Mercado Pago está activo, la preferencia de pago. La clienta paga en Mercado Pago y vuelve a `pedido.html`.
6. Mercado Pago avisa a `POST /api/webhooks/mercadopago`. El servidor verifica la firma, **vuelve a pedir el pago a la API** y solo marca «Pagado» si el importe coincide.

La clienta sigue su pedido en `pedido.html?id=…&t=…`. El `t` es un token propio del pedido (HMAC del id): sin él no se ve nada. «Mis pedidos» lista los hechos desde ese navegador.

### Estados

`pendiente_pago` → `pagado` → `produccion` → `despachado` → `entregado`, y `cancelado` **solo desde `pendiente_pago` o `pagado`** (la política de la tienda: se cancela antes de producción). El servidor no deja saltar pasos. Cada cambio queda en el historial del pedido con quién lo hizo.

## Mails

Con `RESEND_API_KEY` configurada, la tienda manda mails con [Resend](https://resend.com) (`api/_lib/mails.js`):

- **Comprobante de compra** a la clienta cuando el pedido pasa a «Pagado» (aviso de Mercado Pago o cambio a mano en el panel): número de pedido, prendas, subtotal, envío, total, operación de Mercado Pago, dirección y el enlace para seguir el pedido. Aclara que no es una factura.
- **Pedido recibido** a la clienta cuando no hay cobro online («cobro a coordinar»).
- **Aviso a la dueña** (`OWNER_EMAILS`) en esos mismos dos momentos, con enlace al panel.

Cada mail sale una sola vez por pedido: queda registrado en la tabla `order_emails` y va con `Idempotency-Key` a Resend, así los avisos repetidos de Mercado Pago no lo duplican. Si Resend falla, el pedido sigue igual, el error queda en el historial del pedido y el próximo aviso lo reintenta. Sin `RESEND_API_KEY` no se manda nada.

El remitente (`MAIL_FROM`, por defecto `nevrado <pedidos@nevrado.com>`) tiene que ser de un dominio verificado en Resend.

## Panel (`admin.html`)

Con servidor pide mail y contraseña. Tiene cuatro pestañas:

- **Diseños**: alta, edición, publicar/ocultar y baja de los diseños de la tienda (el archivo va al balde público).
- **Productos**: precio, visibilidad, destacados, colores, recargos y stock por talle.
- **Pedidos**: datos de la clienta y envío, vista previa, descarga del original, la vista previa, el archivo de impresión y el diseño editable (enlaces firmados de 15 minutos), cambio de estado con nota (por ejemplo, el número de seguimiento) y enlace para mandarle a la clienta.
- **Envíos**: tabla por rango de código postal. Define el envío gratis (CP 5000) y es el respaldo si las empresas de correo no responden. Las dos zonas pagas tienen **importes de ejemplo** y el panel las marca así.

## Envíos

Solo a domicilio (la tienda no tiene retiro), en `api/_lib/shipping.js` y `api/_lib/carriers.js`:

1. Si la tabla del panel da $0 para ese código postal (centro de Córdoba Capital), es la única opción.
2. Si no, se cotiza **en vivo** con las empresas configuradas y la clienta elige entre las opciones a domicilio, de la más barata a la más cara:
   - **Correo Argentino**, API MiCorreo: `POST /token` (usuario y contraseña de la API) y `POST /rates` con el CP de origen (`SHIPPING_ORIGIN_CP`, 5000 por defecto), el de destino y el paquete. Devuelve Paq.ar Clásico y Expreso.
   - **Andreani**, API de tarifas `GET /v1/tarifas` con número de contrato y de cliente. Andreani da estos datos solo a clientes con contrato.
3. Si ninguna está configurada o ninguna responde (8 segundos), se usa la tabla del panel.

El paquete se arma con un peso y medidas aproximados por tipo de prenda (`PARCEL_BY_TYPE` en `carriers.js`: remera 250 g, buzo canguro 750 g, etc., más 60 g de embalaje). Conviene pesar las prendas reales y ajustar esos números.

Las pruebas usan respuestas simuladas con el formato de cada API. Con las credenciales reales hay que hacer una cotización de prueba antes de abrir la tienda.

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
5. **Correo Argentino.** Pedir las credenciales de la API en el formulario de <https://www.correoargentino.com.ar/MiCorreo/public/primeros-pasos> y cargar `MICORREO_USER`, `MICORREO_PASSWORD` y `MICORREO_CUSTOMER_ID` (o, en lugar del último, el mail y la contraseña de la cuenta MiCorreo en `MICORREO_ACCOUNT_EMAIL` y `MICORREO_ACCOUNT_PASSWORD`).
6. **Andreani** (si hay contrato): `ANDREANI_CONTRATO`, `ANDREANI_CLIENTE` y, si te dieron usuario de la API, `ANDREANI_USER` y `ANDREANI_PASSWORD`.
7. **Mails** (opcional): verificar el dominio en Resend, cargar `RESEND_API_KEY` y, si hace falta, `MAIL_FROM` y `MAIL_REPLY_TO`.
8. Volver a desplegar. `https://<dominio>/api/health` tiene que mostrar `"ready": true`.

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
| `SHIPPING_ORIGIN_CP` | Código postal desde donde se despacha (5000 por defecto). |
| `MICORREO_USER`, `MICORREO_PASSWORD`, `MICORREO_CUSTOMER_ID` | Cotización con Correo Argentino. |
| `ANDREANI_CONTRATO`, `ANDREANI_CLIENTE`, `ANDREANI_USER`, `ANDREANI_PASSWORD` | Cotización con Andreani. |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | Mails de los pedidos (Resend). Respuestas de las clientas a `MAIL_REPLY_TO` si está. |
| `PUBLIC_URL` | Dirección pública, si no es la del pedido (para los enlaces de vuelta de Mercado Pago). |

`.env.example` tiene la lista para el servidor local.

## Seguridad

- Balde de pedidos **privado**; los archivos se ven solo con enlaces firmados que vencen, emitidos por el panel.
- Las tablas tienen RLS activado y sin políticas: la API REST pública de Supabase no puede leerlas. Todo pasa por este servidor.
- Sesión del panel en cookie `HttpOnly`, `SameSite=Strict`, 12 horas; las acciones que cambian datos además exigen que el `Origin` sea el de la tienda. Freno a los intentos de contraseña.
- Precios, stock y envío siempre recalculados en el servidor; los pedidos repetidos por un reintento no se duplican (`idempotencyKey`).
- Pendiente para más adelante: limpiar archivos subidos que nunca llegaron a un pedido.

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
