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

test("botón de arrepentimiento: guarda el pedido, da el código y avisa a las dos partes", async () => {
  sent = [];
  payments = {};
  const app = makeApp(path.join(tmp, "arrep"));
  const { order: o } = await order(app);
  sent = [];

  // Sin nombre o con mail inválido no se guarda.
  assert.equal((await call(app, "POST", "/api/arrepentimiento", { body: { name: "", email: "flor@example.com" } })).status, 422);
  assert.equal((await call(app, "POST", "/api/arrepentimiento", { body: { name: "Flor", email: "flor" } })).status, 422);
  // Desde otro sitio, no.
  const foreign = await call(app, "POST", "/api/arrepentimiento", { body: { name: "Flor", email: "flor@example.com" }, headers: { origin: "https://otro.test" } });
  assert.equal(foreign.status, 403);

  const r = await call(app, "POST", "/api/arrepentimiento", {
    body: { name: "Flor <b>Prueba</b>", email: "Flor@Example.com", order: String(o.number), details: "Me equivoqué de talle" },
  });
  const body = await r.json();
  assert.equal(r.status, 201, JSON.stringify(body));
  assert.match(body.code, /^ARR-[A-Z2-9]{8}$/);
  assert.equal(body.mailed, true);

  const { db } = await app.init();
  const [row] = await db.query("select * from regret_requests where code = $1", [body.code]);
  assert.equal(row.order_id, o.id, "se asocia al pedido porque el mail coincide");
  assert.equal(row.email, "flor@example.com");
  assert.equal(row.mail_customer, "enviado");
  assert.equal(row.mail_owner, "enviado");
  const events = await db.query("select * from order_events where order_id = $1 and kind = 'arrepentimiento'", [o.id]);
  assert.equal(events.length, 1);

  assert.equal(sent.length, 2);
  const [toCustomer, toOwner] = sent;
  assert.deepEqual(toCustomer.to, ["flor@example.com"]);
  assert.ok(toCustomer.subject.includes(body.code));
  assert.ok(toCustomer.text.includes(body.code));
  assert.ok(!toCustomer.html.includes("<b>Prueba</b>"));
  assert.deepEqual(toOwner.to, ["duena@nevrado.test"]);
  assert.match(toOwner.text, /Me equivoqué de talle/);

  // Con un número de pedido que no es de ese mail, se guarda igual pero sin asociar.
  const other = await (await call(app, "POST", "/api/arrepentimiento", { body: { name: "Otra", email: "otra@example.com", order: String(o.number) } })).json();
  const [row2] = await db.query("select order_id from regret_requests where code = $1", [other.code]);
  assert.equal(row2.order_id, null);

  // Campo trampa completo (bot): responde igual pero no guarda ni manda nada.
  sent = [];
  const bot = await (await call(app, "POST", "/api/arrepentimiento", { body: { name: "Bot", email: "bot@example.com", website: "http://spam" } })).json();
  assert.equal((await db.query("select 1 from regret_requests where code = $1", [bot.code])).length, 0);
  assert.equal(sent.length, 0);
});

test("botón de arrepentimiento: si el mail falla, el pedido queda guardado", async () => {
  sent = [];
  const app = makeApp(path.join(tmp, "arrep-falla"));
  failNext = true;
  const body = await (await call(app, "POST", "/api/arrepentimiento", { body: { name: "Flor", email: "flor@example.com" } })).json();
  assert.equal(body.mailed, false);
  const { db } = await app.init();
  const [row] = await db.query("select * from regret_requests where code = $1", [body.code]);
  assert.match(row.mail_customer, /^error/);
});

test("recordatorio de pago: una vez, al día siguiente, y no si ya pagó otro pedido", async () => {
  sent = [];
  payments = {};
  const app = makeApp(path.join(tmp, "recordatorio"), { MP_ACCESS_TOKEN: "TEST", MP_WEBHOOK_SECRET: "firma-mp", MP_API_URL: "https://mp.test", CRON_SECRET: "clave-cron" });
  const cron = (headers = { authorization: "Bearer clave-cron" }) => call(app, "GET", "/api/cron/recordatorios", { headers });
  const { order: o, token } = await order(app);
  const { db } = await app.init();
  const ago = (id, h) => db.query(`update orders set created_at = now() - interval '${h} hours' where id = $1`, [id]);

  assert.equal((await cron({})).status, 401);
  assert.equal((await cron({ authorization: "Bearer otra" })).status, 401);
  // Recién hecho: todavía no.
  assert.deepEqual((await (await cron()).json()).sent, []);
  // Al día siguiente: sí, con el link para pagar.
  await ago(o.id, 26);
  const { sent: r1 } = await (await cron()).json();
  assert.deepEqual(r1, [{ order: o.number, sent: true }]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["flor@example.com"]);
  assert.equal(sent[0].subject, `Tu pedido #${o.number} te está esperando · nevrado`);
  assert.equal(sent[0].key, `nevrado-${o.id}-recordatorio_pago`);
  assert.ok(sent[0].text.includes(`https://www.nevrado.com/pedido.html?id=${o.id}&t=${token}`));
  assert.ok(!/comprobante de compra/.test(sent[0].text));
  // Una sola vez.
  await cron();
  assert.equal(sent.length, 1);

  // Otro pedido sin pagar, pero la clienta pagó uno después: no se le recuerda.
  const { order: viejo } = await order(app);
  const { order: nuevo } = await order(app);
  await ago(viejo.id, 30);
  await ago(nuevo.id, 28);
  await db.query("update orders set status = 'pagado', payment_status = 'aprobado' where id = $1", [nuevo.id]);
  // Uno de hace más de 3 días tampoco.
  const { order: lejano } = await order(app);
  await ago(lejano.id, 80);
  await cron();
  assert.equal(sent.filter((m) => /te está esperando/.test(m.subject)).length, 1);
});

test("recordatorio de pago: sin clave, solo el aviso de Vercel; sin cobro online no hace nada", async () => {
  const app = makeApp(path.join(tmp, "recordatorio-sin-mp"));
  assert.equal((await call(app, "GET", "/api/cron/recordatorios")).status, 401);
  const r = await call(app, "GET", "/api/cron/recordatorios", { headers: { "user-agent": "vercel-cron/1.0" } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).skipped, "sin cobro online");
});
