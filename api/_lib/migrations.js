/**
 * Esquema de la base de datos (PostgreSQL).
 *
 * El servidor aplica las migraciones pendientes solo, al arrancar, y anota
 * cada una en `schema_migrations` (con un candado, por si arrancan dos
 * funciones a la vez). No hace falta correr SQL a mano en Supabase.
 *
 * Nunca se edita una migración ya publicada: los cambios van en una nueva.
 */
import { GARMENTS } from "../../assets/js/data/garments.js";

const sqlText = (v) => `'${String(v).replaceAll("'", "''")}'`;

export const MIGRATIONS = [
  {
    id: "0001_inicial",
    sql: `
create table if not exists garment_colors (
  id text primary key,
  name text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0
);

create table if not exists products (
  id text primary key,
  sku text not null unique,
  type text not null,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  base_price int not null check (base_price > 0),
  faces jsonb not null default '["front","back"]',
  included_faces int not null default 1 check (included_faces >= 0),
  featured boolean not null default false,
  active boolean not null default true,
  badge text,
  demo_art text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_colors (
  product_id text not null references products(id) on delete cascade,
  color_id text not null references garment_colors(id),
  sort int not null default 0,
  primary key (product_id, color_id)
);

create table if not exists product_sizes (
  product_id text not null references products(id) on delete cascade,
  size_id text not null,
  label text not null,
  surcharge int not null default 0 check (surcharge >= 0),
  stock text not null default 'ok' check (stock in ('ok','low','out')),
  sort int not null default 0,
  primary key (product_id, size_id)
);

-- Archivos: originales de las clientas, vistas previas, archivos de impresión
-- y diseños de la tienda. Identificados por su SHA-256: el mismo archivo se
-- guarda una sola vez.
create table if not exists assets (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  bucket text not null,
  storage_key text not null,
  mime text not null,
  bytes int not null check (bytes > 0),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists store_designs (
  id text primary key,
  name text not null,
  description text not null default '',
  price int not null default 0 check (price >= 0),
  status text not null default 'published' check (status in ('published','draft')),
  product_ids jsonb not null default '[]',
  source jsonb not null,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id uuid primary key,
  number int not null unique default nextval('order_number_seq'),
  status text not null default 'pendiente_pago'
    check (status in ('pendiente_pago','pagado','produccion','despachado','entregado','cancelado')),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente','aprobado','en_proceso','rechazado','devuelto','sin_configurar')),
  customer jsonb not null,
  shipping jsonb not null,
  subtotal int not null,
  shipping_cost int not null,
  total int not null,
  currency text not null default 'ARS',
  mp_preference_id text,
  mp_payment_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  position int not null,
  product_id text not null,
  product_name text not null,
  product_type text not null,
  color_id text not null,
  size_id text not null,
  qty int not null check (qty between 1 and 50),
  printed_faces jsonb not null,
  store_design_ids jsonb not null default '[]',
  unit_price int not null,
  price_lines jsonb not null,
  design jsonb not null,
  files jsonb not null
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,
  from_status text,
  to_status text,
  note text,
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id, created_at);

create table if not exists reviews (
  id text primary key,
  product_id text not null,
  author text not null,
  city text,
  rating int not null check (rating between 1 and 5),
  title text not null,
  body text not null,
  size text,
  color_id text,
  date date not null,
  verified_purchase boolean not null default false,
  demo boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists shipping_rates (
  id text primary key,
  name text not null,
  cp_from int not null check (cp_from between 1000 and 9999),
  cp_to int not null check (cp_to between 1000 and 9999 and cp_to >= cp_from),
  price int not null check (price >= 0),
  example boolean not null default false,
  sort int not null default 0
);

-- Cuentas locales del panel. Solo se usan cuando no hay Supabase Auth
-- (desarrollo y pruebas). En producción el login lo resuelve Supabase.
create table if not exists staff_users (
  email text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
`,
  },
  {
    // Supabase expone las tablas de "public" por su API REST con la clave
    // anónima. La tienda no usa esa API: todo pasa por este servidor. RLS
    // activado y sin políticas = esa puerta queda cerrada.
    id: "0002_rls",
    sql: `
alter table garment_colors enable row level security;
alter table products enable row level security;
alter table product_colors enable row level security;
alter table product_sizes enable row level security;
alter table assets enable row level security;
alter table store_designs enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table reviews enable row level security;
alter table shipping_rates enable row level security;
alter table staff_users enable row level security;
alter table webhook_events enable row level security;
`,
  },
  {
    // Mails de los pedidos: uno por pedido y tipo (ver api/_lib/mails.js).
    id: "0003_mails",
    sql: `
create table if not exists order_emails (
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,
  recipients text not null,
  status text not null check (status in ('enviando','enviado','error')),
  attempts int not null default 1,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, kind)
);
alter table order_emails enable row level security;
`,
  },
  {
    // Botón de arrepentimiento (Res. SCI 424/2020). Ver api/_lib/regret.js.
    id: "0004_arrepentimiento",
    sql: `
create table if not exists regret_requests (
  code text primary key,
  name text not null,
  email text not null,
  phone text,
  order_number int,
  order_id uuid references orders(id) on delete set null,
  details text,
  status text not null default 'recibido' check (status in ('recibido','resuelto')),
  mail_customer text,
  mail_owner text,
  created_at timestamptz not null default now()
);
alter table regret_requests enable row level security;
`,
  },
  {
    // Zonas de estampa: logos de pecho y abajo, mangas y etiqueta interior
    // (ver GARMENTS en assets/js/data/garments.js), y el recargo de cada una,
    // editable en el panel. Las zonas sin fila usan DEFAULT_ZONE_PRICES.
    id: "0005_zonas",
    sql: `
create table if not exists zone_prices (
  zone text primary key,
  price int not null check (price >= 0),
  updated_at timestamptz not null default now()
);
alter table zone_prices enable row level security;
${Object.values(GARMENTS)
  .map((g) => `update products set faces = ${sqlText(JSON.stringify(Object.keys(g.faces)))}::jsonb where type = ${sqlText(g.id)};`)
  .join("\n")}
`,
  },
  {
    // La remera clásica se vende de S a XL (sin XXL desde el 18/10/2026).
    id: "0006_remera_sin_xxl",
    sql: `
delete from product_sizes where product_id = 'remera-clasica' and size_id = 'XXL';
`,
  },
  {
    // Colecciones de diseños: la tienda filtra Diseños por colección y el
    // panel las crea y las borra. Un diseño está en una colección o en
    // ninguna; al borrar la colección sus diseños quedan sin colección.
    id: "0007_colecciones",
    sql: `
create table if not exists design_collections (
  id text primary key,
  name text not null,
  description text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table design_collections enable row level security;
alter table store_designs add column if not exists collection_id text references design_collections(id) on delete set null;
`,
  },
  {
    // Ajustes del sitio que se editan desde el panel (por ahora, el cintillo
    // de anuncios) y la foto opcional de cada diseño puesto en una persona,
    // que la tienda muestra al pasar el mouse por la tarjeta.
    id: "0008_cintillo_y_fotos",
    sql: `
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
alter table store_designs add column if not exists model_photo jsonb;
`,
  },
  {
    // Desde el 19/10/2026 el centro de Córdoba Capital ya no tiene envío
    // gratis fijo (el envío gratis pasa a ser una promo del panel). Se borra
    // esa zona solo si sigue como la cargó el sistema, y el CP 5000 vuelve a
    // la zona de la provincia.
    id: "0009_sin_envio_gratis_cordoba",
    sql: `
delete from shipping_rates where id = 'cordoba-centro' and cp_from = 5000 and cp_to = 5000 and price = 0;
update shipping_rates set cp_from = 5000 where id = 'cordoba-provincia' and cp_from = 5001;
`,
  },
  {
    // Sin recargo por talle: todos los talles de todas las prendas cuestan lo
    // mismo (pedido de la tienda, 20/10/2026). El panel sigue permitiendo
    // cargar un recargo si algún día hace falta.
    id: "0010_sin_recargo_por_talle",
    sql: `
update product_sizes set surcharge = 0 where surcharge <> 0;
`,
  },
  {
    // Envío gratis por zona (pedido de la tienda, 21/10/2026): cada fila de
    // la tabla de envíos tiene su botón de envío gratis y guarda su precio
    // para cuando se apague. Las zonas que ya estaban en $0 quedan marcadas.
    id: "0011_envio_gratis_por_zona",
    sql: `
alter table shipping_rates add column if not exists free boolean not null default false;
update shipping_rates set free = true where price = 0 and not free;
`,
  },
];
