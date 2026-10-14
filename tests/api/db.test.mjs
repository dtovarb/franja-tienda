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
