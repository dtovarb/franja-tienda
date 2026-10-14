/**
 * Esquema de la base de datos (PostgreSQL).
 *
 * El servidor aplica las migraciones pendientes solo, al arrancar, y anota
 * cada una en `schema_migrations`. Las mismas sentencias están copiadas en
 * supabase/migrations/ para quien prefiera correrlas a mano.
 *
 * Nunca se edita una migración ya publicada: los cambios van en una nueva.
 */
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
];
