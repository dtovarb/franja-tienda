/**
 * Mails de los pedidos con Resend SIMULADO: comprobante al pagar, aviso a la
 * dueña, pedido recibido sin cobro online, sin duplicados y con reintento.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../api/_lib/app.js";

const BASE = "http://localhost:3000";
const sha = (b) => createHash("sha256").update(b).digest("hex");
let tmp, png, sent, payments, failNext;

async function fakeFetch(url, opts = {}) {
  url = String(url);
  if (url === "https://resend.test/emails") {
    assert.equal(opts.headers.authorization, "Bearer re_prueba");
    if (failNext) {
      failNext = false;
      return Response.json({ message: "caído" }, { status: 500 });
    }
    sent.push({ ...JSON.parse(opts.body), key: opts.headers["idempotency-key"] });
    return Response.json({ id: `mail-${sent.length}` });
  }
  if (url.startsWith("https://mp.test/checkout/preferences")) return Response.json({ id: "pref", init_point: "https://mp.test/pagar" });
  const m = url.match(/^https:\/\/mp\.test\/v1\/payments\/(\w+)$/);
  if (m) return Response.json(payments[m[1]]);
  throw new Error(`fetch inesperado: ${url}`);
}

function makeApp(dir, extra = {}) {
  return createApp(
    {
      LOCAL_DB_DIR: "memory",
      LOCAL_FILES_DIR: dir,
      SESSION_SECRET: "secreto-de-prueba",
      OWNER_EMAILS: "duena@nevrado.test",
      RESEND_API_KEY: "re_prueba",
      RESEND_API_URL: "https://resend.test",
      PUBLIC_URL: "https://www.nevrado.com",
      ...extra,
    },
    { fetchImpl: fakeFetch }
  );
}

const call = (app, method, p, { body, headers = {} } = {}) =>
  app.handle(
    new Request(BASE + p, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: BASE, ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  );

async function order(app) {
  const files = [];
  for (const [role, extra] of [["original", { name: "foto.png" }], ["preview", { face: "front" }], ["print", { face: "front", dpi: 300 }]]) {
    const bytes = Buffer.concat([png, Buffer.from(role)]);
    const f = { role, sha256: sha(bytes), mime: "image/png", bytes: bytes.byteLength, ...extra };
    const { uploads } = await (await call(app, "POST", "/api/uploads", { body: { files: [f] } })).json();
    const t = uploads[0].target;
    await app.handle(new Request(BASE + t.url, { method: t.method, headers: t.headers, body: bytes }));
    files.push(f);
  }
  const design = { faces: { front: [{ type: "image", assetId: files[0].sha256 }] } };
  const r = await call(app, "POST", "/api/orders", {
    body: {
      customer: { name: "Flor <b>Prueba</b>", email: "flor@example.com", phone: "3515551234" },
      shipping: { street: "Colón", number: "50", city: "Córdoba", province: "Córdoba", postalCode: "5000", notes: "Timbre 2" },
      items: [{ productId: "remera-clasica", colorId: "rosa-palo", sizeId: "M", qty: 2, design, files }],
    },
  });
  const body = await r.json();
  assert.equal(r.status, 201, JSON.stringify(body));
  return body;
}

const hook = (app, dataId) => {
  const ts = "1700000000";
  const reqId = `req-${dataId}`;
  const sig = createHmac("sha256", "firma-mp").update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex");
  return call(app, "POST", `/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, {
    body: { type: "payment", data: { id: dataId } },
    headers: { "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": reqId },
  });
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "nevrado-mails-"));
  png = await readFile(new URL("../../assets/img/favicon-32.png", import.meta.url));
});
after(() => rm(tmp, { recursive: true, force: true }));

test("con Mercado Pago: nada al crear; comprobante y aviso al pagar, una sola vez", async () => {
  sent = [];
  payments = {};
  const app = makeApp(path.join(tmp, "mp"), { MP_ACCESS_TOKEN: "TEST", MP_WEBHOOK_SECRET: "firma-mp", MP_API_URL: "https://mp.test" });
  const { order: o, token } = await order(app);
  assert.equal(sent.length, 0);
  assert.equal((await (await call(app, "GET", "/api/health")).json()).services.mail, "resend");

  payments["900"] = { id: 900, status: "approved", external_reference: o.id, transaction_amount: o.total, currency_id: "ARS" };
  await hook(app, "900");
  assert.equal(sent.length, 2);
  const [receipt, owner] = sent;
  assert.deepEqual(receipt.to, ["flor@example.com"]);
  assert.equal(receipt.from, "nevrado <pedidos@nevrado.com>");
  assert.equal(receipt.subject, `Tu compra en nevrado · pedido #${o.number}`);
  assert.equal(receipt.key, `nevrado-${o.id}-comprobante`);
  assert.ok(receipt.html.includes(`https://www.nevrado.com/pedido.html?id=${o.id}&amp;t=${token}`));
  assert.ok(receipt.text.includes(`https://www.nevrado.com/pedido.html?id=${o.id}&t=${token}`));
  assert.match(receipt.text, /2 × Remera Clásica \(Rosa palo · talle M · estampa frente\)/);
  assert.match(receipt.text, /operación 900/);
  assert.match(receipt.text, /Total: \$\s?\d/);
  // Lo que escribe la clienta va escapado en el HTML.
  assert.ok(!receipt.html.includes("<b>Prueba</b>"));
  assert.ok(receipt.html.includes("Flor &lt;b&gt;Prueba&lt;/b&gt;"));
  assert.deepEqual(owner.to, ["duena@nevrado.test"]);
  assert.match(owner.subject, new RegExp(`Pedido #${o.number} pagado`));
  assert.match(owner.text, /admin\.html/);

  // Mercado Pago repite el aviso: no se manda de nuevo.
  await hook(app, "900");
  assert.equal(sent.length, 2);
  // Pasar a producción no manda otro comprobante.
  const { db } = await app.init();
  await db.query("update orders set status = 'produccion' where id = $1", [o.id]);
  await hook(app, "900");
  assert.equal(sent.length, 2);
  const events = await db.query("select note from order_events where order_id = $1 and kind = 'mail'", [o.id]);
  assert.equal(events.length, 2);
});

test("sin cobro online: «pedido recibido» al crear, y comprobante si la dueña lo marca pagado", async () => {
  sent = [];
  const app = makeApp(path.join(tmp, "sin-mp"));
  const { order: o } = await order(app);
  assert.deepEqual(sent.map((m) => m.to[0]), ["flor@example.com", "duena@nevrado.test"]);
  assert.equal(sent[0].subject, `Recibimos tu pedido #${o.number} · nevrado`);
  assert.match(sent[0].text, /coordinar el pago/);
  assert.match(sent[1].subject, /cobro a coordinar/);

  const { db } = await app.init();
  const { sendOrderMails } = await import("../../api/_lib/mails.js");
  const { getOrder, changeStatus } = await import("../../api/_lib/orders.js");
  const c = await app.init();
  await changeStatus(db, o.id, "pagado", { actor: "duena@nevrado.test" });
  await sendOrderMails({ db, mailer: c.mailer, config: { ownerEmails: ["duena@nevrado.test"], sessionSecret: "secreto-de-prueba" } }, await getOrder(db, o.id), "https://www.nevrado.com");
  assert.equal(sent.length, 3);
  assert.match(sent[2].subject, /Tu compra en nevrado/);
  // El aviso a la dueña ya salió con el pedido: no se repite.
  assert.equal(sent.filter((m) => m.to[0] === "duena@nevrado.test").length, 1);
});

test("si Resend falla, el pedido sigue y el próximo aviso lo reintenta", async () => {
  sent = [];
  payments = {};
  const app = makeApp(path.join(tmp, "falla"), { MP_ACCESS_TOKEN: "TEST", MP_WEBHOOK_SECRET: "firma-mp", MP_API_URL: "https://mp.test", OWNER_EMAILS: "" });
  const { order: o } = await order(app);
  payments["901"] = { id: 901, status: "approved", external_reference: o.id, transaction_amount: o.total, currency_id: "ARS" };
  failNext = true;
  const r = await hook(app, "901");
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0);
  const { db } = await app.init();
  const [row] = await db.query("select status, error from order_emails where order_id = $1", [o.id]);
  assert.equal(row.status, "error");
  assert.equal((await db.query("select status from orders where id = $1", [o.id]))[0].status, "pagado");

  await hook(app, "901");
  assert.equal(sent.length, 1);
  assert.equal((await db.query("select status, attempts from order_emails where order_id = $1", [o.id]))[0].attempts, 2);
});

test("sin RESEND_API_KEY no se manda nada y el pedido se crea igual", async () => {
  sent = [];
  const app = makeApp(path.join(tmp, "sin-clave"), { RESEND_API_KEY: "" });
  await order(app);
  assert.equal(sent.length, 0);
});
