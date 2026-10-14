/**
 * Acceso a Postgres con una interfaz mínima común:
 *   db.query(sql, params) → filas
 *   db.tx(async (q) => …)  → transacción (q tiene la misma forma que db)
 *
 * Producción: `postgres` (Supabase). Desarrollo y pruebas: PGlite, un
 * Postgres real compilado a WebAssembly que guarda en disco (o en memoria).
 * Las columnas jsonb se escriben con JSON.stringify(...) y `$n::text::jsonb` (así ningún driver lo vuelve a codificar).
 */
import { MIGRATIONS } from "./migrations.js";
import { seedData } from "./seed.js";

export class DbUnavailable extends Error {}

export async function openDb(config) {
  if (config.databaseUrl) {
    const { default: postgres } = await import("postgres");
    // prepare:false: compatible con el pooler de Supabase (modo transacción).
    const sql = postgres(cleanUrl(config.databaseUrl), { prepare: false, max: Number(process.env.PG_MAX_CONNECTIONS || 3), idle_timeout: 20, onnotice: () => {} });
    const wrap = (s) => ({ query: (text, params = []) => s.unsafe(text, params) });
    return {
      kind: "postgres",
      ...wrap(sql),
      tx: (fn) => sql.begin((s) => fn(wrap(s))),
      close: () => sql.end({ timeout: 5 }),
    };
  }
  if (config.localDbDir !== null && config.localDbDir !== undefined) {
    const { PGlite } = await import("@electric-sql/pglite");
    if (config.localDbDir !== "memory") {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(config.localDbDir, { recursive: true });
    }
    const pg = config.localDbDir === "memory" ? new PGlite() : new PGlite(config.localDbDir);
    await pg.waitReady;
    const wrap = (s) => ({ query: async (text, params = []) => (await s.query(text, params)).rows });
    // PGlite atiende una consulta por vez; las transacciones se encolan.
    return {
      kind: "pglite",
      ...wrap(pg),
      tx: (fn) => pg.transaction((t) => fn(wrap(t))),
      close: () => pg.close(),
    };
  }
  throw new DbUnavailable("No hay base de datos configurada (DATABASE_URL).");
}

/**
 * La URL que crea la integración de Supabase en Vercel trae parámetros
 * propios (p. ej. `supa=base-pooler.x`) que `postgres` mandaría al servidor
 * como parámetros de conexión, y Postgres los rechaza. Se deja solo sslmode.
 */
export function cleanUrl(raw) {
  const u = new URL(raw);
  const ssl = u.searchParams.get("sslmode");
  u.search = "";
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  if (ssl || !local) u.searchParams.set("sslmode", ssl || "require");
  return u.toString();
}

/** Aplica las migraciones pendientes y carga los datos iniciales una sola vez. */
export async function migrate(db) {
  await db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock(424242)");
    await q.query("create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await q.query("select id from schema_migrations")).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      // PGlite no acepta varias sentencias con parámetros; acá no hay parámetros.
      for (const stmt of splitSql(m.sql)) await q.query(stmt);
      await q.query("insert into schema_migrations (id) values ($1)", [m.id]);
    }
    if (!done.has("datos_iniciales")) {
      await seedData(q);
      await q.query("insert into schema_migrations (id) values ('datos_iniciales')");
    }
  });
}

function splitSql(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}
