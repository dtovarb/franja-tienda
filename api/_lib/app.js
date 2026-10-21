/**
 * La API de la tienda: un único handler fetch-style (Request → Response).
 * api/index.js lo publica como función de Vercel y tools/servidor-local.mjs
 * lo usa en desarrollo. Ver docs/SERVIDOR.md.
 */
import { readConfig } from "./config.js";
import { openDb, migrate, DbUnavailable } from "./db.js";
import { createStorage, BUCKETS } from "./storage.js";
import { createAuth, checkOrigin } from "./auth.js";
import { createMercadoPago } from "./mercadopago.js";
import { createCarriers } from "./carriers.js";
import { createMailer, sendOrderMails } from "./mails.js";
import { HttpError, json, errorResponse, readJson, readBytes } from "./http.js";
import { loadColors, loadProducts, loadStoreDesigns, updateProduct, createProduct, saveStoreDesign, deleteStoreDesign, loadZonePrices, saveZonePrices, loadDesignCollections, saveDesignCollection, deleteDesignCollection, loadAnnouncement, saveAnnouncement, loadHomeImages, saveHomeImages, loadSiteSettings } from "./catalog.js";
import { loadSiteTexts, saveSiteTexts, loadMarquee, saveMarquee } from "./catalog.js";
import { quoteShipping, listRates, replaceRates, loadShippingSettings, saveShippingSettings } from "./shipping.js";
import { checkDeclared, inspectBytes, storageKeyFor } from "./files.js";
import { createOrder, getOrder, publicOrder, changeStatus, applyPayment, checkToken, orderToken, ORDER_STATUSES } from "./orders.js";
import { defaultSizesFor } from "../../assets/js/data/catalog.js";
import { createRegret } from "./regret.js";
import { DEFAULT_ZONE_PRICES } from "../../assets/js/core/pricing.js";

export function createApp(overrides = {}, { fetchImpl = fetch } = {}) {
  const config = readConfig(overrides);
  let ready = null;

  /** Base, almacenamiento y login se inicializan una vez por instancia. */
  function init() {
    ready ||= (async () => {
      const db = await openDb(config);
      await migrate(db);
      return {
        db,
        storage: createStorage(config, fetchImpl),
        auth: createAuth(config, { db, fetchImpl }),
        mp: createMercadoPago(config, fetchImpl),
        carriers: createCarriers(config, fetchImpl),
        mailer: createMailer(config, fetchImpl),
      };
    })().catch((err) => {
      ready = null;
      throw err;
    });
    return ready;
  }

  async function ctx() {
    try {
      const c = await init();
      if (!c.storage || !c.auth) throw new DbUnavailable("Falta configurar el almacenamiento o la sesión.");
      return c;
    } catch (err) {
      if (!(err instanceof DbUnavailable)) console.error(err);
      throw new HttpError(503, "La tienda todavía no tiene el servidor configurado.");
    }
  }

  const baseUrl = (request) => config.publicUrl || new URL(request.url).origin;

  /* ------------------------------- Rutas ------------------------------- */
  const routes = [
    ["GET", "/api/health", async () => {
      try {
        const c = await init();
        return json({
          ok: true,
          ready: !!(c.storage && c.auth),
          services: {
            db: c.db.kind, storage: c.storage?.kind || null, auth: c.auth?.provider || null, payments: c.mp ? "mercadopago" : null,
            shipping: c.carriers.map((x) => x.id), mail: c.mailer ? "resend" : null,
          },
        });
      } catch (err) {
        if (!(err instanceof DbUnavailable)) console.error(err);
        return json({ ok: true, ready: false, services: { db: null, storage: null, auth: null, payments: null, shipping: [], mail: null } });
      }
    }],

    ["GET", "/api/catalog", async () => {
      const { db } = await ctx();
      // Una consulta después de la otra: al arrancar en frío usan la misma
      // conexión que ya abrió la migración, en vez de abrir varias juntas
      // contra el pooler (eso dejaba la última colgada 15 s).
      // Colores y productos son imprescindibles; si fallan los diseños o los
      // recargos, la tienda sigue con lo que hay (diseños vacíos, recargos de
      // fábrica) en vez de caer al modo demostración.
      const t = [Date.now()];
      const colors = await loadColors(db);
      t.push(Date.now());
      const products = await loadProducts(db);
      t.push(Date.now());
      const storeDesigns = await loadStoreDesigns(db, { publishedOnly: true }).catch((err) => (console.error("catálogo: diseños", err), []));
      t.push(Date.now());
      const zonePrices = await loadZonePrices(db).catch((err) => (console.error("catálogo: recargos", err), { ...DEFAULT_ZONE_PRICES }));
      t.push(Date.now());
      const designCollections = await loadDesignCollections(db).catch((err) => (console.error("catálogo: colecciones", err), []));
      t.push(Date.now());
      const { announcement, homeImages, freeShipping, siteTexts, marquee } = await loadSiteSettings(db).catch((err) => (console.error("catálogo: sitio", err), { announcement: null, homeImages: null, freeShipping: false, siteTexts: null, marquee: null }));
      t.push(Date.now());
      if (t[6] - t[0] > 2000) console.warn(`catálogo lento: colores ${t[1] - t[0]} ms, productos ${t[2] - t[1]} ms, diseños ${t[3] - t[2]} ms, recargos ${t[4] - t[3]} ms, colecciones ${t[5] - t[4]} ms, sitio ${t[6] - t[5]} ms`);
      // Los productos ocultos van igual: los carritos que ya los tienen siguen funcionando.
      return json({ colors, products, storeDesigns, zonePrices, designCollections, announcement, homeImages, freeShipping, siteTexts, marquee }, 200, { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" });
    }],

    ["GET", "/api/reviews", async (req, url) => {
      const { db } = await ctx();
      const productId = url.searchParams.get("product");
      const rows = await db.query(
        `select * from reviews where published and not demo ${productId ? "and product_id = $1" : ""} order by date desc`,
        productId ? [productId] : []
      );
      return json({
        reviews: rows.map((r) => ({
          id: r.id, productId: r.product_id, author: r.author, city: r.city, rating: r.rating, title: r.title, body: r.body,
          size: r.size, colorId: r.color_id, date: new Date(r.date).toISOString().slice(0, 10), verifiedPurchase: r.verified_purchase, demo: r.demo,
        })),
      });
    }],

    ["POST", "/api/shipping/quote", async (req) => {
      const { db, carriers } = await ctx();
      const body = await readJson(req, 16 * 1024);
      return json(await quoteShipping(db, body.postalCode, { carriers, lines: await shippingLines(db, body.items) }));
    }],

    ["POST", "/api/uploads", async (req) => {
      const { storage } = await ctx();
      checkOrigin(req);
      const body = await readJson(req, 64 * 1024);
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length || files.length > 80) throw new HttpError(422, "Lista de archivos inválida.");
      const uploads = [];
      for (const f of files) {
        checkDeclared(f);
        const key = storageKeyFor(f.role, f.sha256, f.mime);
        uploads.push({ role: f.role, sha256: f.sha256, key, target: await storage.uploadTarget("pedidos", key, f.mime) });
      }
      return json({ uploads });
    }],

    ["POST", "/api/orders", async (req) => {
      const c = await ctx();
      checkOrigin(req);
      const body = await readJson(req);
      const secret = config.sessionSecret;
      const { order, token, replay } = await createOrder({ db: c.db, storage: c.storage, secret, carriers: c.carriers }, body);
      const payment = await startPayment(c, req, order, token);
      await mails(c, req, order.id);
      return json({ order: publicOrder(order), token, payment, replay }, replay ? 200 : 201);
    }],

    ["POST", "/api/arrepentimiento", async (req) => {
      const c = await ctx();
      checkOrigin(req);
      const body = await readJson(req, 16 * 1024);
      return json(await createRegret({ db: c.db, mailer: c.mailer, config }, body), 201);
    }],

    ["GET", /^\/api\/orders\/([0-9a-f-]{36})$/, async (req, url, [id]) => {
      const { db } = await ctx();
      if (!checkToken(config.sessionSecret, id, url.searchParams.get("t"))) throw new HttpError(404, "No encontramos ese pedido.");
      const order = await getOrder(db, id);
      if (!order) throw new HttpError(404, "No encontramos ese pedido.");
      return json({ order: publicOrder(order) });
    }],

    ["POST", /^\/api\/orders\/([0-9a-f-]{36})\/pay$/, async (req, url, [id]) => {
      const c = await ctx();
      checkOrigin(req);
      const token = url.searchParams.get("t");
      if (!checkToken(config.sessionSecret, id, token)) throw new HttpError(404, "No encontramos ese pedido.");
      const order = await getOrder(c.db, id);
      if (!order) throw new HttpError(404, "No encontramos ese pedido.");
      if (order.status !== "pendiente_pago") throw new HttpError(409, "Este pedido ya no está esperando el pago.");
      return json({ payment: await startPayment(c, req, order, token) });
    }],

    ["POST", "/api/webhooks/mercadopago", async (req, url) => {
      const c = await ctx();
      if (!c.mp) return json({ ignored: "Mercado Pago sin configurar" });
      const body = await readJson(req, 64 * 1024).catch(() => ({}));
      const type = url.searchParams.get("type") || body.type;
      const dataId = url.searchParams.get("data.id") || body.data?.id;
      if (type !== "payment" || !dataId) return json({ ignored: true });
      if (!c.mp.verifySignature(req, String(dataId))) throw new HttpError(401, "Firma inválida.");
      // Se consulta el pago a la API: el cuerpo de la notificación no alcanza.
      const payment = await c.mp.getPayment(dataId);
      await c.db.query("insert into webhook_events (id, provider, payload) values ($1,'mercadopago',$2::text::jsonb) on conflict (id) do nothing", [
        `${dataId}:${payment.status}`, JSON.stringify({ id: payment.id, status: payment.status, ref: payment.external_reference }),
      ]);
      const result = await applyPayment(c.db, payment);
      if (result.orderId) await mails(c, req, result.orderId);
      return json(result);
    }],

    /* ------------------------------ Login ------------------------------ */
    ["POST", "/api/auth/login", async (req) => {
      const { auth } = await ctx();
      checkOrigin(req);
      const body = await readJson(req, 4096);
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
      const { email, cookie } = await auth.login(req, body, ip);
      return json({ user: { email, role: "owner" } }, 200, { "set-cookie": cookie });
    }],
    ["POST", "/api/auth/logout", async (req) => {
      const { auth } = await ctx();
      return json({ ok: true }, 200, { "set-cookie": auth.logoutCookie(req) });
    }],
    ["GET", "/api/auth/me", async (req) => {
      const { auth } = await ctx();
      return json({ user: await auth.current(req), provider: auth.provider });
    }],

    /* ------------------------------ Panel ------------------------------ */
    ["GET", "/api/admin/orders", async (req, url) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const status = url.searchParams.get("status");
      const rows = await db.query(
        `select o.id, o.number, o.status, o.payment_status, o.customer, o.shipping, o.total, o.created_at,
                (select coalesce(sum(qty),0)::int from order_items i where i.order_id = o.id) as units
           from orders o ${status && ORDER_STATUSES[status] ? "where o.status = $1" : ""}
          order by o.created_at desc limit 200`,
        status && ORDER_STATUSES[status] ? [status] : []
      );
      return json({ orders: rows, statuses: ORDER_STATUSES });
    }],

    ["GET", /^\/api\/admin\/orders\/([0-9a-f-]{36})$/, async (req, url, [id]) => {
      const { db, auth, storage } = await ctx();
      await auth.require(req);
      const o = await getOrder(db, id);
      if (!o) throw new HttpError(404, "Ese pedido no existe.");
      // Enlaces firmados de 15 minutos a cada archivo del balde privado.
      for (const it of o.items) {
        it.files = await Promise.all(
          it.files.map(async (f) => ({
            ...f,
            url: await storage.signedUrl("pedidos", f.key, {
              expiresIn: 900,
              downloadName: `pedido-${o.number}-${it.position + 1}-${f.role}${f.face ? `-${f.face}` : ""}.${f.key.split(".").pop()}`,
            }),
          }))
        );
      }
      o.customerLink = `${baseUrl(req)}/pedido.html?id=${o.id}&t=${orderToken(config.sessionSecret, o.id)}`;
      return json({ order: o, statuses: ORDER_STATUSES });
    }],

    ["PATCH", /^\/api\/admin\/orders\/([0-9a-f-]{36})$/, async (req, url, [id]) => {
      const c = await ctx();
      const user = await c.auth.require(req);
      const body = await readJson(req, 8192);
      await changeStatus(c.db, id, body.status, { actor: user.email, note: body.note });
      await mails(c, req, id);
      return json({ order: await getOrder(c.db, id) });
    }],

    ["GET", "/api/admin/products", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ products: await loadProducts(db), colors: await loadColors(db) });
    }],
    ["POST", "/api/admin/products", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 8192);
      return json({ product: await db.tx((q) => createProduct(q, body, defaultSizesFor)) }, 201);
    }],
    ["PATCH", /^\/api\/admin\/products\/([A-Za-z0-9_-]{1,60})$/, async (req, url, [id]) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 64 * 1024);
      return json({ product: await db.tx((q) => updateProduct(q, id, body)) });
    }],

    ["GET", "/api/admin/store-designs", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ storeDesigns: await loadStoreDesigns(db) });
    }],
    ["POST", "/api/admin/uploads", async (req) => {
      const { auth, storage } = await ctx();
      await auth.require(req);
      const { file } = await readJson(req, 8192);
      checkDeclared({ ...file, role: "original" });
      const key = storageKeyFor("tienda", file.sha256, file.mime);
      return json({ key, target: await storage.uploadTarget("disenos", key, file.mime) });
    }],
    ["POST", "/api/admin/store-designs", async (req) => {
      const c = await ctx();
      await c.auth.require(req);
      const body = await readJson(req, 64 * 1024);
      const source = await storeDesignSource(c, body.file);
      if (!source) throw new HttpError(422, "Falta el archivo del diseño.");
      const modelPhoto = (await modelPhotoSource(c, body.photo)) || null;
      return json({ storeDesign: await c.db.tx((q) => saveStoreDesign(q, null, body, { source, modelPhoto })) }, 201);
    }],
    ["PATCH", /^\/api\/admin\/store-designs\/([A-Za-z0-9_-]{1,60})$/, async (req, url, [id]) => {
      const c = await ctx();
      await c.auth.require(req);
      const body = await readJson(req, 64 * 1024);
      const source = await storeDesignSource(c, body.file);
      // Foto con modelo: nueva si viene `photo`, se quita con `removePhoto`, si no queda la que estaba.
      const modelPhoto = body.photo ? await modelPhotoSource(c, body.photo) : body.removePhoto ? null : undefined;
      return json({ storeDesign: await c.db.tx((q) => saveStoreDesign(q, id, body, { source, modelPhoto })) });
    }],
    ["DELETE", /^\/api\/admin\/store-designs\/([A-Za-z0-9_-]{1,60})$/, async (req, url, [id]) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      await deleteStoreDesign(db, id);
      return json({ ok: true });
    }],

    ["GET", "/api/admin/design-collections", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ designCollections: await loadDesignCollections(db) });
    }],
    ["POST", "/api/admin/design-collections", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 8192);
      return json({ designCollection: await saveDesignCollection(db, null, body) }, 201);
    }],
    ["PATCH", /^\/api\/admin\/design-collections\/([A-Za-z0-9_-]{1,60})$/, async (req, url, [id]) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 8192);
      return json({ designCollection: await saveDesignCollection(db, id, body) });
    }],
    ["DELETE", /^\/api\/admin\/design-collections\/([A-Za-z0-9_-]{1,60})$/, async (req, url, [id]) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      await deleteDesignCollection(db, id);
      return json({ ok: true });
    }],

    ["GET", "/api/admin/announcement", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ announcement: await loadAnnouncement(db) });
    }],
    ["PUT", "/api/admin/announcement", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 16 * 1024);
      return json({ announcement: await saveAnnouncement(db, body.announcement) });
    }],

    ["GET", "/api/admin/home-images", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ homeImages: await loadHomeImages(db) });
    }],
    // Cada lugar: `photo` (archivo ya subido) la reemplaza, `removePhoto` la
    // quita y, sin ninguno de los dos, queda la que estaba.
    ["PUT", "/api/admin/home-images", async (req) => {
      const c = await ctx();
      await c.auth.require(req);
      const body = await readJson(req, 32 * 1024);
      const src = body.homeImages && typeof body.homeImages === "object" ? body.homeImages : {};
      const cur = await loadHomeImages(c.db);
      const next = {};
      for (const [key, list] of Object.entries(cur)) {
        next[key] = [];
        for (let i = 0; i < list.length; i++) {
          const it = (Array.isArray(src[key]) && src[key][i]) || {};
          const photo = it.photo ? await modelPhotoSource(c, it.photo) : it.removePhoto ? null : list[i].photo;
          next[key].push({ caption: it.caption, link: it.link, photo });
        }
      }
      return json({ homeImages: await saveHomeImages(c.db, next) });
    }],

    ["GET", "/api/admin/site-texts", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ siteTexts: await loadSiteTexts(db), marquee: await loadMarquee(db) });
    }],
    // Solo los textos cambiados: un texto vacío o igual al de siempre vuelve al de siempre.
    ["PUT", "/api/admin/site-texts", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 128 * 1024);
      return json({ siteTexts: await saveSiteTexts(db, body.siteTexts) });
    }],
    ["PUT", "/api/admin/marquee", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 8 * 1024);
      return json({ marquee: await saveMarquee(db, body.marquee) });
    }],

    ["GET", "/api/admin/shipping-rates", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ rates: await listRates(db) });
    }],
    ["PUT", "/api/admin/shipping-rates", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 64 * 1024);
      return json({ rates: await db.tx((q) => replaceRates(q, body.rates)) });
    }],

    ["GET", "/api/admin/shipping-settings", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ shipping: await loadShippingSettings(db) });
    }],
    ["PUT", "/api/admin/shipping-settings", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 4096);
      return json({ shipping: await saveShippingSettings(db, body.shipping) });
    }],

    ["GET", "/api/admin/zone-prices", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      return json({ zonePrices: await loadZonePrices(db) });
    }],
    ["PUT", "/api/admin/zone-prices", async (req) => {
      const { db, auth } = await ctx();
      await auth.require(req);
      const body = await readJson(req, 8192);
      return json({ zonePrices: await db.tx((q) => saveZonePrices(q, body.zonePrices)) });
    }],

    /* ------------- Archivos en disco (solo servidor local) ------------- */
    ["PUT", "/api/archivos-locales", async (req, url) => {
      const { storage } = await ctx();
      if (storage.kind !== "local") throw new HttpError(404, "No existe.");
      const t = storage.verify(url.searchParams.get("t"));
      if (!t || t.op !== "put") throw new HttpError(403, "Enlace de subida vencido o inválido.");
      const bytes = await readBytes(req, BUCKETS[t.bucket].limit);
      await storage.write(t.bucket, t.key, bytes, t.mime);
      return json({ ok: true });
    }],
    ["GET", "/api/archivos-locales", async (req, url) => {
      const { storage } = await ctx();
      if (storage.kind !== "local") throw new HttpError(404, "No existe.");
      const t = storage.verify(url.searchParams.get("t"));
      if (!t || t.op !== "get") throw new HttpError(403, "Enlace vencido o inválido.");
      const bytes = await storage.read(t.bucket, t.key);
      if (!bytes) throw new HttpError(404, "No existe.");
      const ext = t.key.split(".").pop();
      const type = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", json: "application/json" }[ext] || "application/octet-stream";
      return new Response(bytes, {
        headers: {
          "content-type": type,
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          "x-content-type-options": "nosniff",
          ...(t.name ? { "content-disposition": `attachment; filename="${t.name.replace(/[^\w.-]/g, "_")}"` } : {}),
        },
      });
    }],
  ];

  /** Tipo y cantidad de cada prenda, para pesar el paquete. */
  async function shippingLines(db, items) {
    if (!Array.isArray(items)) return [];
    const products = await loadProducts(db);
    return items.slice(0, 20).flatMap((it) => {
      const p = products.find((x) => x.id === it?.productId);
      const qty = Math.min(50, Math.max(1, Number(it?.qty) || 1));
      return p ? [{ type: p.type, qty }] : [];
    });
  }

  /** Crea la preferencia de pago, si Mercado Pago está configurado. */
  /** Manda los mails que correspondan al pedido. Un error acá nunca frena el pedido ni el pago. */
  async function mails(c, req, orderId) {
    if (!c.mailer) return;
    try {
      await sendOrderMails({ db: c.db, mailer: c.mailer, config }, await getOrder(c.db, orderId), baseUrl(req));
    } catch (err) {
      console.error(err);
    }
  }

  async function startPayment(c, req, order, token) {
    if (!c.mp) {
      if (order.payment_status !== "sin_configurar") {
        await c.db.query("update orders set payment_status = 'sin_configurar' where id = $1 and payment_status = 'pendiente'", [order.id]);
      }
      return { provider: null, checkoutUrl: null, message: "El cobro online todavía no está activado. La tienda te va a contactar para coordinar el pago." };
    }
    try {
      const pref = await c.mp.createPreference({ order, items: order.items, baseUrl: baseUrl(req), token });
      await c.db.query("update orders set mp_preference_id = $2 where id = $1", [order.id, pref.id]);
      return { provider: "mercadopago", checkoutUrl: pref.checkoutUrl };
    } catch (err) {
      console.error(err);
      return { provider: "mercadopago", checkoutUrl: null, error: "No pudimos abrir Mercado Pago. Tu pedido quedó guardado: probá pagar de nuevo en unos minutos." };
    }
  }

  /** Verifica el archivo subido para un diseño de la tienda y arma su `source`. */
  async function storeDesignSource({ storage }, file) {
    if (!file) return null;
    checkDeclared({ ...file, role: "original" });
    const key = storageKeyFor("tienda", file.sha256, file.mime);
    const problem = inspectBytes(await storage.read("disenos", key), file);
    if (problem) throw new HttpError(422, problem);
    const name = String(file.name || "diseno").slice(0, 120);
    return { kind: "url", url: storage.publicUrl("disenos", key), name, sha256: file.sha256, mime: file.mime, bytes: file.bytes };
  }

  /** Foto de un diseño puesto en una persona: JPG o PNG ya subido al balde de diseños. */
  async function modelPhotoSource({ storage }, file) {
    if (!file) return null;
    if (!["image/jpeg", "image/png"].includes(file.mime)) throw new HttpError(422, "La foto tiene que ser JPG o PNG.");
    checkDeclared({ ...file, role: "original" });
    const key = storageKeyFor("tienda", file.sha256, file.mime);
    const problem = inspectBytes(await storage.read("disenos", key), file);
    if (problem) throw new HttpError(422, problem);
    const side = (v) => (Number.isInteger(v) && v > 0 && v <= 10000 ? v : null);
    return {
      url: storage.publicUrl("disenos", key),
      name: String(file.name || "foto").slice(0, 120),
      sha256: file.sha256,
      mime: file.mime,
      bytes: file.bytes,
      width: side(file.width),
      height: side(file.height),
    };
  }

  async function handle(request) {
    const url = new URL(request.url);
    let pathMatched = false;
    try {
      for (const [method, pattern, fn] of routes) {
        const m = typeof pattern === "string" ? (url.pathname === pattern ? [] : null) : url.pathname.match(pattern)?.slice(1);
        if (!m) continue;
        pathMatched = true;
        if (method !== request.method) continue;
        return await fn(request, url, m);
      }
      throw pathMatched ? new HttpError(405, "Método no permitido.") : new HttpError(404, "No existe esa ruta de la API.");
    } catch (err) {
      return errorResponse(err);
    }
  }

  return { handle, init, config };
}
