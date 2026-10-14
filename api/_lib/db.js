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

/** Tope de cada consulta (o transacción) contra Postgres. */
const QUERY_TIMEOUT_MS = 15_000;

/** Corta una promesa que tarda más de `ms` y avisa con `onTimeout`. */
export function withTimeout(promise, ms, onTimeout = () => {}) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      console.error(`Postgres: consulta cortada después de ${ms} ms; se reabren las conexiones.`);
      onTimeout();
      reject(new DbUnavailable("La base de datos no respondió a tiempo."));
    }, ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

export async function openDb(config) {
  if (config.databaseUrl) {
    const { default: postgres } = await import("postgres");
    // prepare:false: compatible con el pooler de Supabase (modo transacción).
    // En Vercel la función se congela entre pedidos: una conexión puede
    // quedar muerta sin que el driver se entere y la consulta esperaría para
    // siempre. Por eso cada consulta tiene un tope; si se pasa, se descartan
    // las conexiones y la siguiente consulta abre otras.
    const open = () =>
      postgres(cleanUrl(config.databaseUrl), {
        prepare: false,
        max: Number(process.env.PG_MAX_CONNECTIONS || 3),
        idle_timeout: 20,
        max_lifetime: 60 * 5,
        connect_timeout: 10,
        onnotice: () => {},
      });
    let sql = open();
    const limit = Number(process.env.PG_QUERY_TIMEOUT_MS || QUERY_TIMEOUT_MS);
    const guarded = (run, ms = limit) => {
      const used = sql;
      return withTimeout(run(used), ms, () => {
        if (sql === used) sql = open();
        used.end({ timeout: 0 }).catch(() => {});
      });
    };
    const wrap = (s) => ({ query: (text, params = []) => s.unsafe(text, params) });
    return {
      kind: "postgres",
      query: (text, params = []) => guarded((s) => s.unsafe(text, params)),
      tx: (fn) => guarded((s) => s.begin((t) => fn(wrap(t))), limit * 2),
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
  // Camino rápido: si ya está todo aplicado no se toma el candado. Así una
  // instancia trabada no bloquea a las demás en cada arranque.
  const pending = async (q) => {
    const done = new Set((await q.query("select id from schema_migrations")).map((r) => r.id));
    return [...MIGRATIONS.map((m) => m.id), "datos_iniciales"].some((id) => !done.has(id));
  };
  if (!(await pending(db).catch(() => true))) return;

  await db.tx(async (q) => {
    // Si algo se traba, Postgres corta en vez de dejar el candado tomado.
    await q.query("set local lock_timeout = '10s'");
    await q.query("set local idle_in_transaction_session_timeout = '30s'");
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
