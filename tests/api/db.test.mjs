import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout, DbUnavailable, openDb, migrate } from "../../api/_lib/db.js";

test("una consulta trabada se corta y avisa", async () => {
  let cut = false;
  await assert.rejects(withTimeout(new Promise(() => {}), 50, () => (cut = true)), DbUnavailable);
  assert.equal(cut, true);
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});

test("migrar dos veces no vuelve a tomar el candado", async () => {
  const db = await openDb({ localDbDir: "memory" });
  await migrate(db);
  const seen = [];
  const spy = { ...db, query: (t, p) => (seen.push(t), db.query(t, p)), tx: () => assert.fail("no debería abrir transacción") };
  await migrate(spy);
  assert.deepEqual(seen, ["select id from schema_migrations"]);
  await db.close();
});

test("la migración 0009 saca el envío gratis fijo del centro de Córdoba", async () => {
  const db = await openDb({ localDbDir: "memory" });
  await migrate(db);
  // Así quedó la tabla en la base real con los datos iniciales viejos.
  await db.query("update shipping_rates set cp_from = 5001 where id = 'cordoba-provincia'");
  await db.query("insert into shipping_rates (id, name, cp_from, cp_to, price, example, sort) values ('cordoba-centro', 'Córdoba Capital, centro', 5000, 5000, 0, false, -1)");
  await db.query("delete from schema_migrations where id = '0009_sin_envio_gratis_cordoba'");
  await migrate(db);
  const rows = await db.query("select id, cp_from, cp_to, price from shipping_rates order by sort, id");
  assert.deepEqual(rows.map((r) => r.id), ["cordoba-provincia", "resto-del-pais"]);
  assert.equal(rows[0].cp_from, 5000);
  await db.close();
});
