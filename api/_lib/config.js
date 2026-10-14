/**
 * Configuración del servidor, leída de variables de entorno.
 *
 * Producción (Vercel + Supabase + Mercado Pago):
 *   DATABASE_URL o POSTGRES_URL   conexión a Postgres (la integración de
 *                                 Supabase en Vercel crea POSTGRES_URL sola)
 *   SUPABASE_URL                  https://<proyecto>.supabase.co
 *   SUPABASE_ANON_KEY             para el login (Supabase Auth)
 *   SUPABASE_SERVICE_ROLE_KEY     para el almacenamiento privado de archivos
 *   OWNER_EMAILS                  mails con acceso al panel, separados por coma
 *   SESSION_SECRET                firma de la sesión del panel (opcional: si
 *                                 falta se deriva de la clave de servicio)
 *   MP_ACCESS_TOKEN               Mercado Pago (Checkout Pro)
 *   MP_WEBHOOK_SECRET             firma de las notificaciones de Mercado Pago
 *   PUBLIC_URL                    dirección pública de la tienda (opcional)
 *   SHIPPING_ORIGIN_CP            CP desde donde se despacha (por defecto 5000)
 *   MICORREO_USER, MICORREO_PASSWORD, MICORREO_CUSTOMER_ID
 *                                 Correo Argentino (API MiCorreo). En lugar del
 *                                 customerId sirven MICORREO_ACCOUNT_EMAIL y
 *                                 MICORREO_ACCOUNT_PASSWORD (cuenta MiCorreo).
 *   ANDREANI_CONTRATO, ANDREANI_CLIENTE (+ ANDREANI_USER, ANDREANI_PASSWORD)
 *                                 Andreani, para clientes con contrato.
 *
 * Sin DATABASE_URL, fuera de Vercel, se usa una base local (PGlite) en
 * .data/db y los archivos van a .data/archivos: sirve para desarrollar y
 * probar sin ninguna cuenta. En Vercel sin base configurada la API responde
 * "sin configurar" y la tienda sigue en modo demostración.
 */
const env = process.env;

export function readConfig(overrides = {}) {
  const e = { ...env, ...overrides };
  const databaseUrl = e.DATABASE_URL || e.POSTGRES_URL || null;
  const onVercel = !!e.VERCEL;
  const supabaseUrl = (e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "") || null;
  return {
    onVercel,
    databaseUrl,
    // Base local solo si no hay URL y no estamos en Vercel (ahí el disco no persiste).
    localDbDir: databaseUrl || onVercel ? null : e.LOCAL_DB_DIR ?? ".data/db",
    localFilesDir: e.LOCAL_FILES_DIR || ".data/archivos",
    supabaseUrl,
    supabaseAnonKey: e.SUPABASE_ANON_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    supabaseServiceKey: e.SUPABASE_SERVICE_ROLE_KEY || null,
    ownerEmails: (e.OWNER_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    sessionSecret: e.SESSION_SECRET || e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_JWT_SECRET || (onVercel ? null : "solo-desarrollo-local"),
    mpAccessToken: e.MP_ACCESS_TOKEN || null,
    mpWebhookSecret: e.MP_WEBHOOK_SECRET || null,
    mpApi: e.MP_API_URL || "https://api.mercadopago.com",
    publicUrl: (e.PUBLIC_URL || "").replace(/\/$/, "") || null,
    originPostalCode: e.SHIPPING_ORIGIN_CP || "5000",
    micorreo: {
      api: (e.MICORREO_API_URL || "https://api.correoargentino.com.ar/micorreo/v1").replace(/\/$/, ""),
      user: e.MICORREO_USER || null,
      password: e.MICORREO_PASSWORD || null,
      customerId: e.MICORREO_CUSTOMER_ID || null,
      accountEmail: e.MICORREO_ACCOUNT_EMAIL || null,
      accountPassword: e.MICORREO_ACCOUNT_PASSWORD || null,
    },
    andreani: {
      api: (e.ANDREANI_API_URL || "https://apis.andreani.com").replace(/\/$/, ""),
      contract: e.ANDREANI_CONTRATO || null,
      client: e.ANDREANI_CLIENTE || null,
      user: e.ANDREANI_USER || null,
      password: e.ANDREANI_PASSWORD || null,
      originBranch: e.ANDREANI_SUCURSAL_ORIGEN || null,
    },
  };
}
