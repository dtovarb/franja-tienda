/**
 * La API con Supabase (almacenamiento y login) SIMULADO: un fetch falso que
 * imita las rutas REST de Supabase Storage y Auth que usa el servidor.
 * Comprueba que en producción los archivos vayan al balde privado, que los
 * enlaces sean firmados y que solo entren los mails de OWNER_EMAILS.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createApp } from "../../api/_lib/app.js";

const SB = "https://sb.test";
const SERVICE = "service-key";
const ANON = "anon-key";
const BASE = "http://localhost:3000";
const sha = (b) => createHash("sha256").update(b).digest("hex");

const buckets = new Map();
const objects = new Map();
const users = { "duena@nevrado.test": "clave-duena-123", "otra@ejemplo.com": "clave-otra-123" };
const seen = [];

async function fakeSupabase(url, opts = {}) {
  const u = new URL(String(url));
  const method = opts.method || "GET";
  const h = new Headers(opts.headers || {});
  seen.push(`${method} ${u.pathname}`);
  const isService = h.get("authorization") === `Bearer ${SERVICE}`;
  const p = u.pathname.replace("/storage/v1", "");
  if (u.pathname === "/auth/v1/token") {
    assert.equal(h.get("apikey"), ANON);
    const { email, password } = JSON.parse(opts.body);
    return users[email] === password ? Response.json({ access_token: "jwt", user: { email } }) : Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (p === "/bucket" && method === "POST") {
    assert.ok(isService);
    const b = JSON.parse(opts.body);
    if (buckets.has(b.id)) return Response.json({ error: "exists" }, { status: 409 });
    buckets.set(b.id, b);
    return Response.json({ name: b.id });
  }
  let m;
  if ((m = p.match(/^\/object\/upload\/sign\/(\w+)\/(.+)$/))) {
    if (method === "POST") {
      assert.ok(isService);
      return Response.json({ url: `/object/upload/sign/${m[1]}/${m[2]}?token=subida` });
    }
    assert.equal(u.searchParams.get("token"), "subida");
    objects.set(`${m[1]}/${m[2]}`, new Uint8Array(await new Response(opts.body).arrayBuffer()));
    return Response.json({ Key: m[2] });
  }
  if ((m = p.match(/^\/object\/sign\/(\w+)\/(.+)$/))) {
    if (method === "POST") {
      assert.ok(isService);
      return Response.json({ signedURL: `/object/sign/${m[1]}/${m[2]}?token=firmado` });
    }
    return u.searchParams.get("token") === "firmado" && objects.has(`${m[1]}/${m[2]}`)
      ? new Response(objects.get(`${m[1]}/${m[2]}`))
      : new Response("{}", { status: 400 });
  }
  if ((m = p.match(/^\/object\/public\/(\w+)\/(.+)$/))) {
    return buckets.get(m[1])?.public && objects.has(`${m[1]}/${m[2]}`) ? new Response(objects.get(`${m[1]}/${m[2]}`)) : new Response("{}", { status: 400 });
  }
  if ((m = p.match(/^\/object\/(\w+)\/(.+)$/))) {
    if (!isService) return new Response("{}", { status: 403 });
    return objects.has(`${m[1]}/${m[2]}`) ? new Response(objects.get(`${m[1]}/${m[2]}`)) : Response.json({ error: "not_found" }, { status: 400 });
  }
  throw new Error(`ruta de Supabase inesperada: ${method} ${u.pathname}`);
}

let app;
const call = (method, p, { body, cookie } = {}) =>
  app.handle(
    new Request(BASE + p, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), origin: BASE },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  );

before(() => {
  app = createApp(
    {
      LOCAL_DB_DIR: "memory",
      SUPABASE_URL: SB,
      SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      OWNER_EMAILS: "Duena@nevrado.test",
      SESSION_SECRET: "",
      MP_ACCESS_TOKEN: "",
    },
    { fetchImpl: fakeSupabase }
  );
});

test("salud con Supabase y sin Mercado Pago", async () => {
  const h = await (await call("GET", "/api/health")).json();
  assert.deepEqual(h.services, { db: "pglite", storage: "supabase", auth: "supabase", payments: null, shipping: [] });
});

test("login: solo mails de OWNER_EMAILS, con la contraseña de Supabase", async () => {
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "duena@nevrado.test", password: "mala" } })).status, 401);
  // Cuenta válida en Supabase pero que no es de la tienda.
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "otra@ejemplo.com", password: "clave-otra-123" } })).status, 401);
  const r = await call("POST", "/api/auth/login", { body: { email: "DUENA@nevrado.test", password: "clave-duena-123" } });
  assert.equal(r.status, 200);
});

test("pedido con archivos en el balde privado y enlaces firmados", async () => {
  const png = await readFile(new URL("../../assets/img/favicon-32.png", import.meta.url));
  const files = [
    { role: "original", sha256: sha(png), mime: "image/png", bytes: png.byteLength, name: "foto.png" },
    { role: "preview", face: "front", sha256: sha(png), mime: "image/png", bytes: png.byteLength },
    { role: "print", face: "front", sha256: sha(png), mime: "image/png", bytes: png.byteLength },
  ];
  const { uploads } = await (await call("POST", "/api/uploads", { body: { files } })).json();
  assert.equal(uploads.length, 3);
  for (const up of uploads) {
    assert.ok(up.target.url.startsWith(`${SB}/storage/v1/object/upload/sign/pedidos/`));
    const r = await fakeSupabase(up.target.url, { method: "PUT", headers: up.target.headers, body: png });
    assert.equal(r.status, 200);
  }
  assert.equal(buckets.get("pedidos").public, false);
  assert.equal(buckets.get("disenos").public, true);

  const r = await call("POST", "/api/orders", {
    body: {
      customer: { name: "Flor", email: "flor@example.com", phone: "3515551234" },
      shipping: { street: "Colón", number: "50", city: "Córdoba", province: "Córdoba", postalCode: "5000" },
      items: [{ productId: "tote-bag", colorId: "crudo", sizeId: "Único", qty: 1, design: { faces: { front: [{ type: "image", assetId: sha(png) }] } }, files }],
    },
  });
  const body = await r.json();
  assert.equal(r.status, 201, JSON.stringify(body));
  assert.equal(body.payment.checkoutUrl, null);
  assert.match(body.payment.message, /cobro online todavía no está activado/);

  const login = await call("POST", "/api/auth/login", { body: { email: "duena@nevrado.test", password: "clave-duena-123" } });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const det = await (await call("GET", `/api/admin/orders/${body.order.id}`, { cookie })).json();
  const orig = det.order.items[0].files.find((f) => f.role === "original");
  assert.ok(orig.url.startsWith(`${SB}/storage/v1/object/sign/pedidos/original/`));
  assert.match(orig.url, /download=pedido-1001-1-original\.png/);
  const got = await fakeSupabase(orig.url);
  assert.equal(sha(Buffer.from(await got.arrayBuffer())), sha(png));
  // Sin firma, el balde privado no entrega nada.
  assert.equal((await fakeSupabase(orig.url.replace("/object/sign/", "/object/public/"))).status, 400);
  assert.equal(det.order.payment_status, "sin_configurar");
});

test("diseño de la tienda en el balde público", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "duena@nevrado.test", password: "clave-duena-123" } });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
  const file = { sha256: sha(svg), mime: "image/svg+xml", bytes: svg.byteLength, name: "cuadrado.svg" };
  const { target } = await (await call("POST", "/api/admin/uploads", { cookie, body: { file } })).json();
  assert.ok(target.url.includes("/upload/sign/disenos/"));
  await fakeSupabase(target.url, { method: "PUT", headers: target.headers, body: svg });
  const r = await call("POST", "/api/admin/store-designs", { cookie, body: { name: "Cuadrado", price: 0, file } });
  const { storeDesign } = await r.json();
  assert.equal(r.status, 201);
  assert.ok(storeDesign.source.url.startsWith(`${SB}/storage/v1/object/public/disenos/tienda/`));
  assert.equal((await fakeSupabase(storeDesign.source.url)).status, 200);
});
