/**
 * Cotización de envíos con Correo Argentino (MiCorreo) y Andreani SIMULADOS.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../api/_lib/app.js";

const BASE = "http://localhost:3000";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const calls = [];
const fail = { correo: false, andreani: false };

async function fakeCarriers(url, opts = {}) {
  const u = new URL(String(url));
  const h = new Headers(opts.headers || {});
  calls.push({ host: u.host, path: u.pathname, search: u.search, body: opts.body ? JSON.parse(opts.body) : null, auth: h.get("authorization"), tok: h.get("x-authorization-token") });
  if (u.host === "mc.test") {
    if (fail.correo) return new Response("caído", { status: 503 });
    if (u.pathname === "/micorreo/v1/token") {
      assert.equal(h.get("authorization"), `Basic ${Buffer.from("api-user:api-pass").toString("base64")}`);
      return Response.json({ token: "tok-mc", expires: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (u.pathname === "/micorreo/v1/rates") {
      assert.equal(h.get("authorization"), "Bearer tok-mc");
      return Response.json({
        customerId: "0001",
        validTo: "2026-12-31T00:00:00Z",
        rates: [
          { deliveredType: "D", productType: "CP", productName: "Paq.ar Clásico", price: 6123.4, deliveryTimeMin: "3", deliveryTimeMax: "6" },
          { deliveredType: "S", productType: "CP", productName: "Paq.ar Clásico", price: 4100 },
          { deliveredType: "D", productType: "EP", productName: "Paq.ar Expreso", price: 8890, deliveryTimeMin: "1", deliveryTimeMax: "3" },
        ],
      });
    }
  }
  if (u.host === "an.test") {
    if (fail.andreani) return new Response("caído", { status: 500 });
    if (u.pathname === "/login") return new Response("", { headers: { "x-authorization-token": "tok-an" } });
    if (u.pathname === "/v1/tarifas") {
      assert.equal(h.get("x-authorization-token"), "tok-an");
      return Response.json({ pesoAforado: "1.0", tarifaSinIva: { total: "5000.00" }, tarifaConIva: { total: "6050.00" } });
    }
  }
  throw new Error(`fetch inesperado ${url}`);
}

let app, tmp;
const call = (method, p, body) =>
  app.handle(new Request(BASE + p, { method, headers: { "content-type": "application/json", origin: BASE }, body: body && JSON.stringify(body) }));

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "nevrado-envios-"));
  app = createApp(
    {
      LOCAL_DB_DIR: "memory", LOCAL_FILES_DIR: tmp, SESSION_SECRET: "x", MP_ACCESS_TOKEN: "",
      SHIPPING_ORIGIN_CP: "5000",
      MICORREO_API_URL: "https://mc.test/micorreo/v1", MICORREO_USER: "api-user", MICORREO_PASSWORD: "api-pass", MICORREO_CUSTOMER_ID: "0001",
      ANDREANI_API_URL: "https://an.test", ANDREANI_CONTRATO: "400006709", ANDREANI_CLIENTE: "CL0003750", ANDREANI_USER: "u", ANDREANI_PASSWORD: "p",
    },
    { fetchImpl: fakeCarriers }
  );
});

test("cotiza en vivo con las dos empresas, solo a domicilio, de menor a mayor", async () => {
  const r = await call("POST", "/api/shipping/quote", { postalCode: "1425", items: [{ productId: "buzo-canguro", qty: 2 }, { productId: "remera-clasica", qty: 1 }] });
  const q = await r.json();
  assert.equal(r.status, 200, JSON.stringify(q));
  assert.equal(q.live, true);
  assert.deepEqual(q.options.map((o) => [o.id, o.price]), [
    ["andreani:domicilio", 6050],
    ["correo-argentino:CP", 6124],
    ["correo-argentino:EP", 8890],
  ]);
  assert.equal(q.options[1].days, "3 a 6 días hábiles");
  const rates = calls.find((c) => c.path === "/micorreo/v1/rates").body;
  assert.equal(rates.customerId, "0001");
  assert.equal(rates.postalCodeOrigin, "5000");
  assert.equal(rates.postalCodeDestination, "1425");
  assert.equal(rates.deliveredType, "D");
  assert.equal(rates.dimensions.weight, 60 + 750 * 2 + 250); // embalaje + 2 buzos + 1 remera
  const an = new URLSearchParams(calls.find((c) => c.path === "/v1/tarifas").search);
  assert.equal(an.get("cpDestino"), "1425");
  assert.equal(an.get("contrato"), "400006709");
  assert.equal(an.get("bultos[0][kilos]"), "1.81");
});

test("centro de Córdoba: solo envío gratis, sin consultar a las empresas", async () => {
  const before = calls.length;
  const q = await (await call("POST", "/api/shipping/quote", { postalCode: "5000", items: [] })).json();
  assert.deepEqual(q.options.map((o) => o.price), [0]);
  assert.equal(calls.length, before);
});

test("si una empresa falla quedan las otras; si fallan todas, la tabla del panel", async () => {
  fail.andreani = true;
  let q = await (await call("POST", "/api/shipping/quote", { postalCode: "5800" })).json();
  assert.ok(q.options.every((o) => o.carrier === "Correo Argentino"));
  fail.correo = true;
  q = await (await call("POST", "/api/shipping/quote", { postalCode: "5800" })).json();
  assert.equal(q.live, false);
  assert.equal(q.options[0].id, "tabla:cordoba-provincia");
  fail.andreani = fail.correo = false;
});

test("el pedido usa la opción elegida, recotizada en el servidor", async () => {
  const png = await readFile(new URL("../../assets/img/favicon-32.png", import.meta.url));
  const files = [
    { role: "original", sha256: sha(png), mime: "image/png", bytes: png.byteLength },
    { role: "preview", face: "front", sha256: sha(png), mime: "image/png", bytes: png.byteLength },
    { role: "print", face: "front", sha256: sha(png), mime: "image/png", bytes: png.byteLength },
  ];
  const { uploads } = await (await call("POST", "/api/uploads", { files })).json();
  for (const u of uploads) await app.handle(new Request(BASE + u.target.url, { method: "PUT", headers: u.target.headers, body: png }));
  const order = (optionId) => ({
    customer: { name: "Flor", email: "flor@example.com", phone: "3515551234" },
    shipping: { street: "Corrientes", number: "1", city: "CABA", province: "Ciudad Autónoma de Buenos Aires", postalCode: "1425", optionId },
    items: [{ productId: "remera-clasica", colorId: "negro", sizeId: "M", qty: 1, design: { faces: { front: [{ type: "image", assetId: sha(png) }] } }, files }],
  });
  let r = await call("POST", "/api/orders", order("inventada:1"));
  assert.equal(r.status, 409);
  r = await call("POST", "/api/orders", order(undefined)); // varias opciones y ninguna elegida
  assert.equal(r.status, 409);
  r = await call("POST", "/api/orders", order("correo-argentino:CP"));
  const body = await r.json();
  assert.equal(r.status, 201, JSON.stringify(body));
  assert.equal(body.order.shippingCost, 6124);
  assert.equal(body.order.total, 18900 + 6124);
  assert.equal(body.order.shipping.zone, "Correo Argentino · Paq.ar Clásico");
});
