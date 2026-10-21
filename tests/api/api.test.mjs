/**
 * Pruebas de la API con una base PGlite en memoria, archivos en una carpeta
 * temporal y Mercado Pago simulado (fetch falso). No necesitan cuentas.
 *
 *   npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../api/_lib/app.js";
import { hashPassword } from "../../api/_lib/auth.js";

const BASE = "http://localhost:3000";
const sha = (b) => createHash("sha256").update(b).digest("hex");
let tmp, app, mpCalls, payments;

/* Mercado Pago falso: registra preferencias y devuelve pagos de la tabla `payments`. */
async function fakeFetch(url, opts = {}) {
  url = String(url);
  if (url.startsWith("https://mp.test/checkout/preferences")) {
    const body = JSON.parse(opts.body);
    mpCalls.push(body);
    return Response.json({ id: `pref-${mpCalls.length}`, init_point: `https://mp.test/pagar/${mpCalls.length}` });
  }
  const m = url.match(/^https:\/\/mp\.test\/v1\/payments\/(\w+)$/);
  if (m) return payments[m[1]] ? Response.json(payments[m[1]]) : new Response("{}", { status: 404 });
  throw new Error(`fetch inesperado: ${url}`);
}

const call = (method, p, { body, cookie, headers = {} } = {}) =>
  app.handle(
    new Request(BASE + p, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), origin: BASE, ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  );
const jsonOf = async (r) => ({ status: r.status, body: await r.json() });

async function upload(bytes, role, mime, extra = {}) {
  const file = { role, sha256: sha(bytes), mime, bytes: bytes.byteLength, ...extra };
  const { body } = await jsonOf(await call("POST", "/api/uploads", { body: { files: [file] } }));
  const t = body.uploads[0].target;
  const r = await app.handle(new Request(BASE + t.url, { method: t.method, headers: t.headers, body: bytes }));
  assert.equal(r.status, 200);
  return file;
}

let png, png2, printPng;
async function cartItem({ productId = "remera-clasica", colorId = "negro", sizeId = "M", qty = 2, faces = { front: null }, storeDesignId } = {}) {
  const files = [await upload(png, "original", "image/png", { name: "foto.png" })];
  const design = { schema: "nevrado.design/v1", faces: {} };
  for (const face of Object.keys(faces)) {
    design.faces[face] = [
      { type: "image", assetId: sha(png), left: 500, top: 500, ...(storeDesignId ? { storeDesignId } : {}) },
      { type: "textbox", text: "hola", left: 500, top: 700 },
    ];
    files.push({ ...(await upload(png2, "preview", "image/png")), face });
    files.push({ ...(await upload(printPng, "print", "image/png")), face, dpi: 300 });
  }
  return { productId, colorId, sizeId, qty, design, files };
}
const customer = { name: "Flor Prueba", email: "flor@example.com", phone: "351 555-1234" };
const shipping = { street: "San Martín", number: "123", city: "Córdoba", province: "Córdoba", postalCode: "5000" };

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "nevrado-api-"));
  mpCalls = [];
  payments = {};
  png = await readFile(new URL("../../assets/img/favicon-32.png", import.meta.url));
  png2 = Buffer.concat([png, Buffer.from("vista")]);
  printPng = Buffer.concat([png, Buffer.from("impresion")]);
  app = createApp(
    {
      // TEST_DATABASE_URL=postgres://… prueba lo mismo contra un Postgres real (driver de producción).
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : { LOCAL_DB_DIR: "memory" }),
      LOCAL_FILES_DIR: tmp,
      SESSION_SECRET: "secreto-de-prueba",
      MP_ACCESS_TOKEN: "TEST-token",
      MP_WEBHOOK_SECRET: "firma-mp",
      MP_API_URL: "https://mp.test",
      OWNER_EMAILS: "",
    },
    { fetchImpl: fakeFetch }
  );
  const { db } = await app.init();
  await db.query("delete from staff_users");
  await db.query("insert into staff_users (email, password_hash) values ($1,$2)", ["duena@nevrado.test", await hashPassword("clave-larga-123")]);
});
after(async () => {
  await (await app.init()).db.close();
  await rm(tmp, { recursive: true, force: true });
});

async function login() {
  const r = await call("POST", "/api/auth/login", { body: { email: "duena@nevrado.test", password: "clave-larga-123" } });
  assert.equal(r.status, 200);
  const c = r.headers.get("set-cookie");
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
  return c.split(";")[0];
}

test("salud y catálogo desde la base", async () => {
  const h = await jsonOf(await call("GET", "/api/health"));
  assert.deepEqual(h.body.services, { db: process.env.TEST_DATABASE_URL ? "postgres" : "pglite", storage: "local", auth: "local", payments: "mercadopago", shipping: [], mail: null });
  const { body } = await jsonOf(await call("GET", "/api/catalog"));
  assert.equal(body.products.length, 6);
  assert.equal(body.storeDesigns.length, 5);
  const tee = body.products.find((p) => p.id === "remera-clasica");
  assert.equal(tee.basePrice, 18900);
  assert.ok(tee.colors.includes("rosa-palo"));
  assert.deepEqual(tee.sizes.map((s) => s.id), ["S", "M", "L", "XL"]);
  const rv = await jsonOf(await call("GET", "/api/reviews?product=gorra"));
  // Las opiniones de ejemplo del seed no se publican en la tienda real.
  assert.deepEqual(rv.body.reviews, []);
});

test("envío por código postal: Córdoba Capital ya no es gratis", async () => {
  const q = async (cp) => (await jsonOf(await call("POST", "/api/shipping/quote", { body: { postalCode: cp } })));
  assert.equal((await q("5000")).body.options[0].id, "tabla:cordoba-provincia");
  assert.equal((await q("X5000ABC")).body.free, false);
  // Sin empresas de correo configuradas se usa la tabla del panel (marcada de ejemplo).
  assert.equal((await q("5010")).body.options[0].id, "tabla:cordoba-provincia");
  assert.equal((await q("1425")).body.options[0].id, "tabla:resto-del-pais");
  assert.equal((await q("1425")).body.options[0].example, true);
  assert.equal((await q("12")).status, 422);
});

test("pedido completo: precios recalculados, archivos verificados y Mercado Pago", async () => {
  const item = await cartItem({ faces: { front: null, back: null } });
  item.clientUnitPrice = 1; // el servidor lo ignora
  const r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping: { ...shipping, postalCode: "1425" }, items: [item], idempotencyKey: "prueba-0001" } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // Remera M 18900 + espalda 4500 = 23400 × 2 = 46800 + envío resto del país 7500.
  assert.equal(r.body.order.subtotal, 46800);
  assert.equal(r.body.order.shippingCost, 7500);
  assert.equal(r.body.order.total, 54300);
  assert.deepEqual(r.body.order.items[0].printedFaces, ["front", "back"]);
  assert.equal(r.body.order.status, "pendiente_pago");
  assert.equal(r.body.payment.checkoutUrl, "https://mp.test/pagar/1");
  const pref = mpCalls.at(-1);
  assert.equal(pref.external_reference, r.body.order.id);
  assert.equal(pref.items.reduce((n, i) => n + i.unit_price * i.quantity, 0), 54300);
  assert.match(pref.notification_url, /\/api\/webhooks\/mercadopago$/);

  // Reintento con la misma clave: mismo pedido, sin duplicar.
  const again = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping: { ...shipping, postalCode: "1425" }, items: [item], idempotencyKey: "prueba-0001" } }));
  assert.equal(again.status, 200);
  assert.equal(again.body.order.number, r.body.order.number);
  assert.equal(again.body.token, r.body.token);

  // La clienta ve su pedido con el enlace; sin token, no.
  const mine = await jsonOf(await call("GET", `/api/orders/${r.body.order.id}?t=${r.body.token}`));
  assert.equal(mine.body.order.number, r.body.order.number);
  assert.equal(mine.body.order.items[0].files, undefined);
  assert.equal((await call("GET", `/api/orders/${r.body.order.id}?t=otro`)).status, 404);
});

test("diseño de la tienda: se cobra según el diseño, no según la lista del navegador", async () => {
  const item = await cartItem({ productId: "tote-bag", colorId: "crudo", sizeId: "Único", qty: 1, storeDesignId: "sd-sol" });
  item.storeDesignIds = []; // el navegador "olvida" el diseño: igual se cobra
  const r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [item] } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const tote = (await jsonOf(await call("GET", "/api/catalog"))).body.products.find((p) => p.id === "tote-bag");
  assert.equal(r.body.order.subtotal, tote.basePrice + 3500);
  assert.equal(r.body.order.shippingCost, 4500);
});

test("rechaza archivos faltantes, adulterados o peligrosos", async () => {
  const item = await cartItem();
  const missing = { ...item, files: item.files.filter((f) => f.role !== "print") };
  let r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [missing] } }));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /archivo de impresión/);

  const bad = Buffer.from("no soy un png pero digo serlo");
  const fake = await upload(bad, "original", "image/png");
  const item2 = await cartItem();
  item2.design.faces.front[0].assetId = fake.sha256;
  item2.files.push(fake);
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [item2] } }));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /PNG/);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  const s = await upload(svg, "original", "image/svg+xml");
  const item3 = await cartItem();
  item3.design.faces.front[0].assetId = s.sha256;
  item3.files.push(s);
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [item3] } }));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /script/);

  // Hash declarado que no coincide con lo subido.
  const item4 = await cartItem();
  const other = Buffer.concat([png, Buffer.from("x")]);
  const declared = { role: "original", sha256: sha(other), mime: "image/png", bytes: other.byteLength };
  item4.design.faces.front[0].assetId = declared.sha256;
  item4.files.push(declared); // declarado pero nunca subido
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [item4] } }));
  assert.equal(r.status, 422);
  assert.match(r.body.error, /no llegó/);

  // Tipo no permitido.
  r = await jsonOf(await call("POST", "/api/uploads", { body: { files: [{ role: "original", sha256: "a".repeat(64), mime: "image/gif", bytes: 10 }] } }));
  assert.equal(r.status, 422);
});

test("valida datos de la clienta, talle sin stock y color inexistente", async () => {
  const item = await cartItem();
  let r = await jsonOf(await call("POST", "/api/orders", { body: { customer: { ...customer, email: "no-es-mail" }, shipping, items: [item] } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping: { ...shipping, street: "" }, items: [item] } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [{ ...item, colorId: "fucsia" }] } }));
  assert.equal(r.status, 422);
  // remera-oversize XXL está sin stock en el catálogo inicial.
  const ov = await cartItem({ productId: "remera-oversize", sizeId: "XXL" });
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [ov] } }));
  assert.equal(r.status, 409);
  r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [] } }));
  assert.equal(r.status, 422);
});

test("el panel exige login; con sesión ve pedidos, archivos y cambia estados", async () => {
  assert.equal((await call("GET", "/api/admin/orders")).status, 401);
  const bad = await call("POST", "/api/auth/login", { body: { email: "duena@nevrado.test", password: "mal" } });
  assert.equal(bad.status, 401);
  const cookie = await login();
  const me = await jsonOf(await call("GET", "/api/auth/me", { cookie }));
  assert.equal(me.body.user.email, "duena@nevrado.test");

  const list = await jsonOf(await call("GET", "/api/admin/orders", { cookie }));
  assert.ok(list.body.orders.length >= 2);
  const id = list.body.orders.find((o) => o.total === 54300).id;
  const det = await jsonOf(await call("GET", `/api/admin/orders/${id}`, { cookie }));
  const files = det.body.order.items[0].files;
  assert.deepEqual(files.map((f) => f.role).sort(), ["original", "preview", "preview", "print", "print"]);
  // El enlace firmado descarga exactamente el archivo subido.
  const orig = files.find((f) => f.role === "original");
  const got = await app.handle(new Request(BASE + orig.url));
  assert.equal(sha(Buffer.from(await got.arrayBuffer())), orig.sha256);
  assert.match(got.headers.get("content-disposition"), /attachment/);
  // Sin firma no hay archivo.
  assert.equal((await call("GET", "/api/archivos-locales?t=x.y")).status, 403);

  // Estados: no se puede saltar a producción sin pago; cancelar solo antes de producción.
  let r = await jsonOf(await call("PATCH", `/api/admin/orders/${id}`, { cookie, body: { status: "produccion" } }));
  assert.equal(r.status, 409);
  r = await jsonOf(await call("PATCH", `/api/admin/orders/${id}`, { cookie, body: { status: "pagado", note: "Transferencia" } }));
  assert.equal(r.body.order.status, "pagado");
  r = await jsonOf(await call("PATCH", `/api/admin/orders/${id}`, { cookie, body: { status: "produccion" } }));
  assert.equal(r.body.order.status, "produccion");
  r = await jsonOf(await call("PATCH", `/api/admin/orders/${id}`, { cookie, body: { status: "cancelado" } }));
  assert.equal(r.status, 409);
  assert.match(r.body.error, /antes de pasar a producción/);
  assert.deepEqual(det.body.order.events.map((e) => e.kind), ["creado"]);

  // Otro origen no puede usar la sesión para cambiar datos.
  r = await call("PATCH", `/api/admin/orders/${id}`, { cookie, body: { status: "despachado" }, headers: { origin: "https://otro.sitio" } });
  assert.equal(r.status, 403);

  // Cerrar sesión.
  const out = await call("POST", "/api/auth/logout", { cookie });
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});

test("webhook de Mercado Pago: firma, consulta del pago e importe", async () => {
  const item = await cartItem({ qty: 1 });
  const { body } = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [item] } }));
  const id = body.order.id;
  const sign = (dataId, reqId, ts = "1700000000") =>
    `ts=${ts},v1=${createHmac("sha256", "firma-mp").update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest("hex")}`;
  const hook = (dataId, sig, reqId = "req-1") =>
    call("POST", `/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, {
      body: { type: "payment", data: { id: dataId } },
      headers: { "x-signature": sig, "x-request-id": reqId },
    });

  payments["111"] = { id: 111, status: "approved", external_reference: id, transaction_amount: body.order.total - 1, currency_id: "ARS" };
  assert.equal((await hook("111", "ts=1,v1=deadbeef")).status, 401);
  // Importe distinto: queda registrado pero no se marca pagado.
  let r = await jsonOf(await hook("111", sign("111", "req-1")));
  assert.equal(r.body.amountOk, false);
  let o = await jsonOf(await call("GET", `/api/orders/${id}?t=${body.token}`));
  assert.equal(o.body.order.status, "pendiente_pago");

  payments["222"] = { id: 222, status: "approved", external_reference: id, transaction_amount: body.order.total, currency_id: "ARS" };
  r = await jsonOf(await hook("222", sign("222", "req-2"), "req-2"));
  assert.equal(r.body.paymentStatus, "aprobado");
  o = await jsonOf(await call("GET", `/api/orders/${id}?t=${body.token}`));
  assert.equal(o.body.order.status, "pagado");
  assert.equal(o.body.order.paymentStatus, "aprobado");
});

test("panel: productos, diseños de la tienda y tarifas de envío", async () => {
  const cookie = await login();
  assert.equal((await call("PATCH", "/api/admin/products/gorra", { body: { basePrice: 1 } })).status, 401);
  let r = await jsonOf(await call("PATCH", "/api/admin/products/gorra", { cookie, body: { basePrice: 17000, active: false, colors: ["naranja", "verde"] } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  const gorra = cat.products.find((p) => p.id === "gorra");
  assert.equal(gorra.basePrice, 17000);
  assert.equal(gorra.active, false);
  assert.deepEqual(gorra.colors, ["naranja", "verde"]);
  r = await jsonOf(await call("PATCH", "/api/admin/products/gorra", { cookie, body: { basePrice: -5 } }));
  assert.equal(r.status, 422);

  r = await jsonOf(await call("POST", "/api/admin/products", { cookie, body: { type: "tee", name: "Remera nueva", basePrice: 20000 } }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.product.sizes.map((s) => s.id), ["S", "M", "L", "XL", "XXL"]);

  // Nuevo diseño: se sube al balde público y se publica.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#A50062"/></svg>');
  const file = { sha256: sha(svg), mime: "image/svg+xml", bytes: svg.byteLength, name: "circulo.svg" };
  const up = await jsonOf(await call("POST", "/api/admin/uploads", { cookie, body: { file } }));
  await app.handle(new Request(BASE + up.body.target.url, { method: "PUT", headers: up.body.target.headers, body: svg }));
  r = await jsonOf(await call("POST", "/api/admin/store-designs", { cookie, body: { name: "Círculo", price: 2000, status: "published", productIds: ["tote-bag"], file } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sd = r.body.storeDesign;
  assert.equal(sd.source.kind, "url");
  const img = await app.handle(new Request(BASE + sd.source.url));
  assert.equal(Buffer.from(await img.arrayBuffer()).toString(), svg.toString());
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.ok(cat.storeDesigns.some((d) => d.id === sd.id));
  r = await jsonOf(await call("PATCH", `/api/admin/store-designs/${sd.id}`, { cookie, body: { ...sd, status: "draft" } }));
  assert.equal(r.body.storeDesign.status, "draft");
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.ok(!cat.storeDesigns.some((d) => d.id === sd.id));
  assert.equal((await call("DELETE", `/api/admin/store-designs/${sd.id}`, { cookie })).status, 200);

  // Colecciones: se crean, se asignan a un diseño y al borrarlas el diseño queda sin colección.
  assert.equal((await call("POST", "/api/admin/design-collections", { body: { name: "Verano" } })).status, 401);
  assert.equal((await call("POST", "/api/admin/design-collections", { cookie, body: { name: " " } })).status, 422);
  r = await jsonOf(await call("POST", "/api/admin/design-collections", { cookie, body: { name: "Verano", description: "Para el calor." } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const col = r.body.designCollection;
  r = await jsonOf(await call("PATCH", `/api/admin/design-collections/${col.id}`, { cookie, body: { name: "Verano 27" } }));
  assert.equal(r.body.designCollection.name, "Verano 27");
  assert.equal((await call("PATCH", "/api/admin/store-designs/sd-ola", { cookie, body: { name: "Ola", collectionId: "col-nada" } })).status, 422);
  r = await jsonOf(await call("PATCH", "/api/admin/store-designs/sd-ola", { cookie, body: { name: "Ola", price: 3000, collectionId: col.id } }));
  assert.equal(r.body.storeDesign.collectionId, col.id);
  // Editar sin mandar la colección la conserva.
  r = await jsonOf(await call("PATCH", "/api/admin/store-designs/sd-ola", { cookie, body: { name: "Ola", price: 3000 } }));
  assert.equal(r.body.storeDesign.collectionId, col.id);
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.deepEqual(cat.designCollections.map((c) => c.name), ["Verano 27"]);
  assert.equal(cat.storeDesigns.find((d) => d.id === "sd-ola").collectionId, col.id);
  assert.equal(cat.storeDesigns.find((d) => d.id === "sd-sol").collectionId, null);
  assert.equal((await call("DELETE", `/api/admin/design-collections/${col.id}`, { cookie })).status, 200);
  assert.equal((await call("DELETE", `/api/admin/design-collections/${col.id}`, { cookie })).status, 404);
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.deepEqual(cat.designCollections, []);
  assert.equal(cat.storeDesigns.find((d) => d.id === "sd-ola").collectionId, null);

  // Tarifas: cambiar el precio de una de ejemplo la vuelve real.
  const rates = (await jsonOf(await call("GET", "/api/admin/shipping-rates", { cookie }))).body.rates;
  rates[0].price = 5200;
  r = await jsonOf(await call("PUT", "/api/admin/shipping-rates", { cookie, body: { rates } }));
  assert.equal(r.body.rates[0].example, false);
  assert.equal(r.body.rates[1].example, true);
  assert.equal((await jsonOf(await call("POST", "/api/shipping/quote", { body: { postalCode: "5800" } }))).body.options[0].price, 5200);
});

test("panel: la promo de envío gratis apaga el cálculo del envío en todo el país", async () => {
  const quote = async (cp) => (await jsonOf(await call("POST", "/api/shipping/quote", { body: { postalCode: cp } }))).body;
  assert.equal((await call("PUT", "/api/admin/shipping-settings", { body: { shipping: { freeShipping: true } } })).status, 401);
  const cookie = await login();
  assert.equal((await jsonOf(await call("GET", "/api/admin/shipping-settings", { cookie }))).body.shipping.freeShipping, false);
  assert.equal((await jsonOf(await call("GET", "/api/catalog"))).body.freeShipping, false);
  let r = await jsonOf(await call("PUT", "/api/admin/shipping-settings", { cookie, body: { shipping: { freeShipping: "sí" } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("PUT", "/api/admin/shipping-settings", { cookie, body: { shipping: { freeShipping: true } } }));
  assert.equal(r.body.shipping.freeShipping, true);
  for (const cp of ["5000", "1425", "9410"]) assert.deepEqual((await quote(cp)).options.map((o) => [o.id, o.price]), [["promo:envio-gratis", 0]]);
  assert.equal((await quote("12")).free, undefined); // el CP se sigue validando
  assert.equal((await jsonOf(await call("GET", "/api/catalog"))).body.freeShipping, true);
  // El pedido se crea con envío $0 aunque la clienta no haya elegido opción.
  const item = await cartItem();
  const o = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping: { ...shipping, postalCode: "1425" }, items: [item] } }));
  assert.equal(o.status, 201, JSON.stringify(o.body));
  assert.equal(o.body.order.shippingCost, 0);
  r = await jsonOf(await call("PUT", "/api/admin/shipping-settings", { cookie, body: { shipping: { freeShipping: false } } }));
  assert.equal(r.body.shipping.freeShipping, false);
  assert.equal((await quote("1425")).options[0].id, "tabla:resto-del-pais");
});

test("panel: textos de la página y marquesina", async () => {
  const cookie = await login();
  let cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.deepEqual(cat.siteTexts, {});
  assert.equal(cat.marquee.enabled, true);
  assert.ok(cat.marquee.items.includes("Remeras"));
  assert.equal((await call("PUT", "/api/admin/site-texts", { body: { siteTexts: {} } })).status, 401);
  assert.equal((await call("GET", "/api/admin/site-texts")).status, 401);
  // Demasiado largo: no.
  let r = await jsonOf(await call("PUT", "/api/admin/site-texts", { cookie, body: { siteTexts: { "home.hero.cta1": "x".repeat(200) } } }));
  assert.equal(r.status, 422);
  // Claves desconocidas, vacíos e iguales al original no se guardan.
  r = await jsonOf(
    await call("PUT", "/api/admin/site-texts", {
      cookie,
      body: { siteTexts: { "home.hero.title": "  Ropa con\r\nidentidad ", "home.hero.cta1": "", "home.feat.title": "Elegí el lienzo", "nada.que.ver": "x", "about.mission.text": "Uno.\n\n\n\nDos." } },
    })
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.siteTexts, { "home.hero.title": "Ropa con\nidentidad", "about.mission.text": "Uno.\n\nDos." });
  r = await jsonOf(await call("PUT", "/api/admin/marquee", { cookie, body: { marquee: { enabled: true, items: [] } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("PUT", "/api/admin/marquee", { cookie, body: { marquee: { enabled: true, items: [" Hecho en Córdoba ", "", "DTG"] } } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.equal(cat.siteTexts["home.hero.title"], "Ropa con\nidentidad");
  assert.deepEqual(cat.marquee, { enabled: true, items: ["Hecho en Córdoba", "DTG"] });
  r = await jsonOf(await call("GET", "/api/admin/site-texts", { cookie }));
  assert.deepEqual(r.body.marquee, cat.marquee);
  // Se apaga y se deja todo como estaba.
  await call("PUT", "/api/admin/marquee", { cookie, body: { marquee: { enabled: false, items: [] } } });
  assert.equal((await jsonOf(await call("GET", "/api/catalog"))).body.marquee.enabled, false);
  await call("PUT", "/api/admin/site-texts", { cookie, body: { siteTexts: {} } });
  assert.deepEqual((await jsonOf(await call("GET", "/api/catalog"))).body.siteTexts, {});
});

test("panel: una zona de la tabla se puede marcar con envío gratis", async () => {
  const quote = async (cp) => (await jsonOf(await call("POST", "/api/shipping/quote", { body: { postalCode: cp } }))).body;
  const cookie = await login();
  const put = async (rates) => jsonOf(await call("PUT", "/api/admin/shipping-rates", { cookie, body: { rates } }));
  let rates = (await jsonOf(await call("GET", "/api/admin/shipping-rates", { cookie }))).body.rates;
  assert.ok(rates.every((r) => r.free === false));
  const cordoba = rates.find((r) => r.id === "cordoba-provincia");
  const price = cordoba.price;
  let r = await put(rates.map((x) => (x.id === "cordoba-provincia" ? { ...x, free: "sí" } : x)));
  assert.equal(r.status, 422);
  r = await put(rates.map((x) => (x.id === "cordoba-provincia" ? { ...x, free: true } : x)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const saved = r.body.rates.find((x) => x.id === "cordoba-provincia");
  assert.equal(saved.free, true);
  assert.equal(saved.price, price); // el precio queda guardado
  let q = await quote("5800");
  assert.equal(q.free, true);
  assert.deepEqual(q.options.map((o) => [o.id, o.price, o.service]), [["tabla:cordoba-provincia", 0, cordoba.name]]);
  assert.equal((await quote("1425")).options[0].price, rates.find((x) => x.id === "resto-del-pais").price);
  // El pedido de esa zona sale con envío $0.
  const item = await cartItem();
  const o = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping: { ...shipping, postalCode: "5800" }, items: [item] } }));
  assert.equal(o.status, 201, JSON.stringify(o.body));
  assert.equal(o.body.order.shippingCost, 0);
  // Al destildarla vuelve a cobrar el precio que tenía.
  r = await put(r.body.rates.map((x) => ({ ...x, free: false })));
  q = await quote("5800");
  assert.equal(q.free, false);
  assert.equal(q.options[0].price, price);
});

test("panel: cintillo de anuncios y foto con modelo de un diseño", async () => {
  const cookie = await login();
  let cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.equal(cat.announcement.enabled, false);
  assert.equal((await call("PUT", "/api/admin/announcement", { body: { announcement: { enabled: true } } })).status, 401);
  // Enlaces raros o encendido sin mensajes: no.
  let r = await jsonOf(await call("PUT", "/api/admin/announcement", { cookie, body: { announcement: { enabled: true, messages: [{ text: "Hola", link: "javascript:alert(1)" }] } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("PUT", "/api/admin/announcement", { cookie, body: { announcement: { enabled: true, messages: [{ text: "  " }] } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(
    await call("PUT", "/api/admin/announcement", {
      cookie,
      body: { announcement: { enabled: true, style: "franjas", messages: [{ text: "Envío gratis en Córdoba", link: "preguntas.html" }, { text: "" }, { text: "Nuevos diseños", link: "https://www.nevrado.com/disenos.html" }] } },
    })
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.deepEqual(cat.announcement, {
    enabled: true,
    style: "franjas",
    messages: [{ text: "Envío gratis en Córdoba", link: "preguntas.html" }, { text: "Nuevos diseños", link: "https://www.nevrado.com/disenos.html" }],
  });

  // Foto con modelo: se sube, se conserva al editar sin mandarla y se quita.
  const jpg = await readFile(new URL("../fixtures/foto.jpg", import.meta.url));
  const photo = { sha256: sha(jpg), mime: "image/jpeg", bytes: jpg.byteLength, name: "puesta.jpg", width: 1200, height: 1500 };
  const up = await jsonOf(await call("POST", "/api/admin/uploads", { cookie, body: { file: photo } }));
  await app.handle(new Request(BASE + up.body.target.url, { method: "PUT", headers: up.body.target.headers, body: jpg }));
  assert.equal((await call("PATCH", "/api/admin/store-designs/sd-lunas", { cookie, body: { name: "Dos lunas", photo: { ...photo, mime: "image/svg+xml" } } })).status, 422);
  r = await jsonOf(await call("PATCH", "/api/admin/store-designs/sd-lunas", { cookie, body: { name: "Dos lunas", price: 3000, photo } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.storeDesign.modelPhoto.width, 1200);
  const img = await app.handle(new Request(BASE + r.body.storeDesign.modelPhoto.url));
  assert.equal(sha(Buffer.from(await img.arrayBuffer())), photo.sha256);
  r = await jsonOf(await call("PATCH", "/api/admin/store-designs/sd-lunas", { cookie, body: { name: "Dos lunas", price: 3000 } }));
  assert.ok(r.body.storeDesign.modelPhoto, "editar sin foto conserva la que había");
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.ok(cat.storeDesigns.find((d) => d.id === "sd-lunas").modelPhoto.url);
  assert.equal(cat.storeDesigns.find((d) => d.id === "sd-sol").modelPhoto, null);
  r = await jsonOf(await call("PATCH", "/api/admin/store-designs/sd-lunas", { cookie, body: { name: "Dos lunas", price: 3000, removePhoto: true } }));
  assert.equal(r.body.storeDesign.modelPhoto, null);
});

test("panel: fotos del inicio (portada y lookbook)", async () => {
  const cookie = await login();
  let cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.equal(cat.homeImages.hero.length, 1);
  assert.equal(cat.homeImages.lookbook.length, 3);
  assert.ok(cat.homeImages.lookbook.every((x) => x.photo === null));
  assert.equal((await call("PUT", "/api/admin/home-images", { body: { homeImages: {} } })).status, 401);

  const jpg = await readFile(new URL("../fixtures/foto.jpg", import.meta.url));
  const photo = { sha256: sha(jpg), mime: "image/jpeg", bytes: jpg.byteLength, name: "portada.jpg", width: 1200, height: 1500 };
  const up = await jsonOf(await call("POST", "/api/admin/uploads", { cookie, body: { file: photo } }));
  await app.handle(new Request(BASE + up.body.target.url, { method: "PUT", headers: up.body.target.headers, body: jpg }));
  // Enlace raro o formato que no es foto: no.
  let r = await jsonOf(await call("PUT", "/api/admin/home-images", { cookie, body: { homeImages: { hero: [{ link: "javascript:alert(1)" }] } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(await call("PUT", "/api/admin/home-images", { cookie, body: { homeImages: { hero: [{ photo: { ...photo, mime: "image/svg+xml" } }] } } }));
  assert.equal(r.status, 422);
  r = await jsonOf(
    await call("PUT", "/api/admin/home-images", {
      cookie,
      body: { homeImages: { hero: [{ photo, caption: "Nueva colección", link: "disenos.html" }], lookbook: [{}, { photo, caption: "  Tote  crudo " }, {}] } },
    })
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.homeImages.hero[0].photo.width, 1200);
  assert.equal(r.body.homeImages.lookbook[1].caption, "Tote crudo");
  const img = await app.handle(new Request(BASE + r.body.homeImages.hero[0].photo.url));
  assert.equal(sha(Buffer.from(await img.arrayBuffer())), photo.sha256);
  // Guardar sin mandar la foto conserva la que había; removePhoto la quita.
  r = await jsonOf(await call("PUT", "/api/admin/home-images", { cookie, body: { homeImages: { hero: [{ caption: "Otra" }], lookbook: [{}, { removePhoto: true }, {}] } } }));
  assert.ok(r.body.homeImages.hero[0].photo, "sin foto nueva queda la anterior");
  assert.equal(r.body.homeImages.lookbook[1].photo, null);
  cat = (await jsonOf(await call("GET", "/api/catalog"))).body;
  assert.equal(cat.homeImages.hero[0].caption, "Otra");
  assert.ok(cat.homeImages.hero[0].photo.url);
  assert.equal(cat.announcement.enabled !== undefined, true, "el cintillo sigue viniendo en el catálogo");
});

test("sin cuentas en Vercel la API responde 'sin configurar' y la tienda sigue en demo", async () => {
  const off = createApp({ VERCEL: "1", DATABASE_URL: "", POSTGRES_URL: "", SESSION_SECRET: "" });
  const h = await (await off.handle(new Request(BASE + "/api/health"))).json();
  assert.equal(h.ready, false);
  assert.equal((await off.handle(new Request(BASE + "/api/catalog"))).status, 503);
});

test("la URL de Postgres de la integración de Vercel se limpia antes de conectar", async () => {
  const { cleanUrl } = await import("../../api/_lib/db.js");
  assert.equal(
    cleanUrl("postgres://postgres.abc:pw@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"),
    "postgres://postgres.abc:pw@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
  );
  assert.match(cleanUrl("postgres://u:p@db.ejemplo.co:5432/postgres"), /sslmode=require$/);
});

test("zonas de estampa: el frente está incluido y cada otra zona suma su recargo", async () => {
  const { body: cat } = await jsonOf(await call("GET", "/api/catalog"));
  const tee = cat.products.find((p) => p.id === "remera-clasica");
  assert.deepEqual(tee.faces, ["front", "back", "chest", "heart", "front-low", "sleeve-left", "sleeve-right", "label"]);
  assert.equal(cat.zonePrices.back, 4500);
  assert.deepEqual(cat.products.find((p) => p.type === "cap").faces, ["front"]);

  const order = async (faces) => {
    const r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [await cartItem({ qty: 1, faces })] } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.order;
  };
  // Remera M 18900. Solo la espalda: no es la zona incluida, suma 4500.
  assert.equal((await order({ back: null })).subtotal, 18900 + 4500);
  assert.equal((await order({ front: null })).subtotal, 18900);
  // Frente + manga izquierda + etiqueta: 2500 + 1500.
  const o = await order({ front: null, "sleeve-left": null, label: null });
  assert.equal(o.subtotal, 18900 + 2500 + 1500);
  assert.deepEqual(o.items[0].printedFaces, ["front", "sleeve-left", "label"]);

  // La dueña cambia el recargo de la espalda en el panel: se cobra el nuevo.
  const cookie = await login();
  assert.equal((await call("PUT", "/api/admin/zone-prices", { body: { zonePrices: { back: 5000 } } })).status, 401);
  assert.equal((await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { pecho: 1 } } })).status, 422);
  assert.equal((await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { back: 10.5 } } })).status, 422);
  const saved = await jsonOf(await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { back: 5000 } } }));
  assert.equal(saved.body.zonePrices.back, 5000);
  assert.equal(saved.body.zonePrices.chest, 2500);
  assert.equal((await order({ back: null })).subtotal, 18900 + 5000);
  await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { back: 4500 } } });

  // Una zona que la prenda no tiene se rechaza.
  const cap = await cartItem({ productId: "gorra", colorId: "azul", sizeId: "Único", qty: 1, faces: { "sleeve-left": null } });
  assert.equal((await call("POST", "/api/orders", { body: { customer, shipping, items: [cap] } })).status, 422);
});

test("talles: ninguna prenda tiene recargo por talle", async () => {
  const { body: cat } = await jsonOf(await call("GET", "/api/catalog"));
  const conRecargo = cat.products.flatMap((p) => p.sizes.filter((s) => s.surcharge).map((s) => `${p.id} ${s.id}`));
  assert.deepEqual(conRecargo, []);
});

test("talles: un recargo guardado desde el panel o que quedó en la base no se cobra", async () => {
  const cookie = await login();
  const { body } = await jsonOf(await call("GET", "/api/admin/products", { cookie }));
  const tee = body.products.find((p) => p.id === "remera-clasica");
  const sizes = tee.sizes.map((s) => ({ ...s, surcharge: 5 }));
  const saved = await jsonOf(await call("PATCH", "/api/admin/products/remera-clasica", { cookie, body: { sizes } }));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.product.sizes.map((s) => s.surcharge), tee.sizes.map(() => 0));
  // Un valor viejo en la base tampoco suma al precio.
  const { db } = await app.init();
  await db.query("update product_sizes set surcharge = 5 where product_id = 'remera-clasica' and size_id = 'M'");
  const r = await jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [await cartItem({ qty: 1 })] } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.order.subtotal, 18900);
  await db.query("update product_sizes set surcharge = 0 where product_id = 'remera-clasica'");
});

test("zonas de estampa: el frente tiene recargo editable y las zonas se apagan desde el panel", async () => {
  const cookie = await login();
  const order = async (faces) =>
    jsonOf(await call("POST", "/api/orders", { body: { customer, shipping, items: [await cartItem({ qty: 1, faces })] } }));

  // Frente con recargo: lo paga cualquier pedido que lo estampe.
  const front = await jsonOf(await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { front: 3000 } } }));
  assert.equal(front.status, 200, JSON.stringify(front.body));
  assert.equal(front.body.zonePrices.front, 3000);
  assert.equal((await order({ front: null })).body.order.subtotal, 18900 + 3000);

  // Apagar mangas: desaparecen de las prendas y un pedido con manga se rechaza.
  assert.equal((await call("PUT", "/api/admin/zone-prices", { cookie, body: { disabledZones: ["front"] } })).status, 422);
  assert.equal((await call("PUT", "/api/admin/zone-prices", { cookie, body: { disabledZones: ["codo"] } })).status, 422);
  const off = await jsonOf(await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { "sleeve-left": 2800 }, disabledZones: ["sleeve-left", "sleeve-right"] } }));
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.deepEqual(off.body.disabledZones.sort(), ["sleeve-left", "sleeve-right"]);
  assert.equal(off.body.zonePrices["sleeve-left"], 2800); // el precio se guarda aunque esté apagada
  const { body: cat } = await jsonOf(await call("GET", "/api/catalog"));
  assert.deepEqual(cat.disabledZones.sort(), ["sleeve-left", "sleeve-right"]);
  assert.deepEqual(cat.products.find((p) => p.id === "remera-clasica").faces, ["front", "back", "chest", "heart", "front-low", "label"]);
  const sleeve = await order({ front: null, "sleeve-left": null });
  assert.equal(sleeve.status, 422);
  assert.match(sleeve.body.error, /manga izquierda/i);
  const got = await jsonOf(await call("GET", "/api/admin/zone-prices", { cookie }));
  assert.deepEqual(got.body.disabledZones.sort(), ["sleeve-left", "sleeve-right"]);

  // Prenderlas de nuevo y volver el frente a 0.
  const back = await jsonOf(await call("PUT", "/api/admin/zone-prices", { cookie, body: { zonePrices: { front: 0, "sleeve-left": 2500 }, disabledZones: [] } }));
  assert.deepEqual(back.body.disabledZones, []);
  assert.equal((await order({ front: null, "sleeve-left": null })).body.order.subtotal, 18900 + 2500);
});
