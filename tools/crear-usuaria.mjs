/**
 * Crea (o cambia la contraseña de) una cuenta LOCAL del panel.
 * Solo para el servidor local; en producción las cuentas son de Supabase Auth.
 *
 *   npm run usuaria -- tu@mail.com
 */
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const { readConfig } = await import("../api/_lib/config.js");
const { openDb, migrate } = await import("../api/_lib/db.js");
const { hashPassword } = await import("../api/_lib/auth.js");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Uso: npm run usuaria -- tu@mail.com");
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = process.env.CLAVE || (await rl.question("Contraseña (mínimo 10 caracteres): "));
rl.close();
if (password.length < 10) {
  console.error("La contraseña tiene que tener al menos 10 caracteres.");
  process.exit(1);
}
const db = await openDb(readConfig());
await migrate(db);
await db.query(
  "insert into staff_users (email, password_hash) values ($1,$2) on conflict (email) do update set password_hash = excluded.password_hash",
  [email, await hashPassword(password)]
);
await db.close();
console.log(`Listo: ${email} puede entrar al panel del servidor local.`);
