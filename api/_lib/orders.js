/**
 * Pedidos.
 *
 * El navegador manda el diseño de cada prenda y la lista de sus archivos
 * (ya subidos al balde privado). El servidor NO confía en nada de eso:
 *   - saca las caras estampadas y los diseños de la tienda del propio diseño;
 *   - recalcula precios con la misma regla del sitio (priceWith) y los datos
 *     de la base;
 *   - controla color, talle y stock;
 *   - lee cada archivo del balde y comprueba hash, tamaño y tipo real;
 *   - cotiza el envío por código postal;
 *   - si se paga por transferencia, aplica el descuento del panel.
 * Recién ahí crea el pedido, en estado "pendiente_pago".
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { priceWith } from "../../assets/js/core/pricing.js";
import { faceLabel } from "../../assets/js/data/garments.js";
import { HttpError } from "./http.js";
import { getProduct, storeDesignsByIds, loadZoneSettings, withoutDisabledZones, loadCoupons, loadDesignCollections, loadTransfer } from "./catalog.js";
import { transferReady, transferDiscount, bankDetails, transferDeadline } from "../../assets/js/core/transfer.js";
import { findCoupon, couponDiscount } from "../../assets/js/core/coupons.js";
import { quoteShipping } from "./shipping.js";
import { PAYMENT_STATUS } from "./mercadopago.js";
import { checkDeclared, inspectBytes, storageKeyFor } from "./files.js";

export const ORDER_STATUSES = {
  pendiente_pago: { label: "Esperando el pago", next: ["pagado", "cancelado"] },
  pagado: { label: "Pagado, en cola", next: ["produccion", "cancelado"] },
  produccion: { label: "En producción", next: ["despachado"] },
  despachado: { label: "Despachado", next: ["entregado"] },
  entregado: { label: "Entregado", next: [] },
  cancelado: { label: "Cancelado", next: [] },
};

const MAX_ITEMS = 20;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/* --------------------- Token de acceso de la clienta --------------------- */
// Se deriva del id con HMAC: no se guarda y se puede volver a emitir igual.
export const orderToken = (secret, id) => createHmac("sha256", secret).update(`pedido:${id}`).digest("base64url").slice(0, 32);
export function checkToken(secret, id, token) {
  const a = Buffer.from(orderToken(secret, id));
  const b = Buffer.from(String(token || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------ Validación ------------------------------ */
const str = (v, max, label, { min = 1 } = {}) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min) throw new HttpError(422, `Completá ${label}.`);
  if (s.length > max) throw new HttpError(422, `${label[0].toUpperCase()}${label.slice(1)} es demasiado largo.`);
  return s;
};
const optStr = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateCustomer(c = {}) {
  const email = str(c.email, 254, "tu mail").toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(422, "El mail no parece válido.");
  const phone = str(c.phone, 30, "tu teléfono", { min: 6 });
  if (!/^[\d\s+()-]{6,30}$/.test(phone)) throw new HttpError(422, "El teléfono solo puede tener números, espacios, + y guiones.");
  return { name: str(c.name, 80, "tu nombre", { min: 2 }), email, phone };
}

export function validateAddress(a = {}) {
  return {
    street: str(a.street, 120, "la calle"),
    number: str(a.number, 12, "la altura"),
    apartment: optStr(a.apartment, 30),
    city: str(a.city, 80, "la localidad"),
    province: str(a.province, 60, "la provincia"),
    postalCode: str(a.postalCode, 10, "el código postal"),
    notes: optStr(a.notes, 300),
  };
}

/** Del diseño salen las caras estampadas, los originales y los diseños de la tienda. */
export function analyzeDesign(product, design) {
  const faces = design?.faces;
  if (!faces || typeof faces !== "object") throw new HttpError(422, "Falta el diseño de una prenda.");
  const printedFaces = [];
  const assetIds = new Set();
  const storeDesignIds = new Set();
  for (const [face, objects] of Object.entries(faces)) {
    if (!product.faces.includes(face)) {
      if (!Array.isArray(objects) || !objects.length) continue;
      throw new HttpError(422, `La zona «${faceLabel(face).toLowerCase()}» ya no se estampa en ${product.name}. Sacala del diseño en el editor.`);
    }
    if (!Array.isArray(objects)) throw new HttpError(422, "El diseño no tiene un formato válido.");
    if (objects.length > 60) throw new HttpError(422, "El diseño tiene demasiados elementos.");
    if (!objects.length) continue;
    printedFaces.push(face);
    for (const o of objects) {
      if (o?.type === "image") {
        if (!/^[0-9a-f]{64}$/.test(o.assetId || "")) throw new HttpError(422, "Una imagen del diseño no tiene su original.");
        assetIds.add(o.assetId);
        // La imagen se arma desde el original, no desde una URL del navegador.
        if (typeof o.src === "string" && o.src.length > 300) o.src = "";
      }
      if (o?.storeDesignId) storeDesignIds.add(String(o.storeDesignId));
    }
  }
  if (!printedFaces.length) throw new HttpError(422, `El diseño de ${product.name} está vacío.`);
  // Mismo orden que el producto (frente, espalda…), igual que en el sitio.
  printedFaces.sort((a, b) => product.faces.indexOf(a) - product.faces.indexOf(b));
  return { printedFaces, assetIds: [...assetIds], storeDesignIds: [...storeDesignIds] };
}

function requiredFiles(item, analysis) {
  const files = Array.isArray(item.files) ? item.files : [];
  if (files.length > 40) throw new HttpError(422, "Demasiados archivos en una prenda.");
  files.forEach(checkDeclared);
  const find = (role, pred) => files.find((f) => f.role === role && pred(f));
  const out = [];
  for (const id of analysis.assetIds) {
    const f = find("original", (x) => x.sha256 === id);
    if (!f) throw new HttpError(422, "Falta subir un archivo original del diseño.");
    out.push({ role: "original", sha256: f.sha256, mime: f.mime, bytes: f.bytes, name: optStr(f.name, 120) || null });
  }
  for (const face of analysis.printedFaces) {
    for (const role of ["preview", "print"]) {
      const f = find(role, (x) => x.face === face);
      if (!f) throw new HttpError(422, `Falta ${role === "preview" ? "la vista previa" : "el archivo de impresión"} de una cara.`);
      out.push({ role, face, sha256: f.sha256, mime: f.mime, bytes: f.bytes, dpi: Number(f.dpi) || null });
    }
  }
  return out.map((f) => ({ ...f, key: storageKeyFor(f.role, f.sha256, f.mime) }));
}

/** Lee del balde cada archivo una vez y lo controla. */
async function verifyFiles(storage, files) {
  const unique = new Map(files.map((f) => [f.key, f]));
  const list = [...unique.values()];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(
      list.slice(i, i + 4).map(async (f) => {
        const problem = inspectBytes(await storage.read("pedidos", f.key), f);
        if (problem) throw new HttpError(422, problem, { file: { role: f.role, sha256: f.sha256 } });
      })
    );
  }
}

/* -------------------------------- Crear -------------------------------- */
export async function createOrder({ db, storage, secret, carriers = [] }, body) {
  const customer = validateCustomer(body.customer);
  const address = validateAddress(body.shipping);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(422, "El carrito está vacío.");
  if (items.length > MAX_ITEMS) throw new HttpError(422, `Un pedido puede tener hasta ${MAX_ITEMS} prendas distintas.`);
  const byTransfer = body.paymentMethod === "transferencia";
  const idem = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;

  if (idem) {
    const [prev] = await db.query("select id from orders where idempotency_key = $1", [idem]);
    if (prev) return { order: await getOrder(db, prev.id), token: orderToken(secret, prev.id), replay: true };
  }

  const { zonePrices, disabledZones } = await loadZoneSettings(db);
  const lines = [];
  for (const [i, it] of items.entries()) {
    // Sin las zonas apagadas en el panel: un diseño que use una ya no pasa.
    const [product] = withoutDisabledZones([await getProduct(db, String(it.productId || ""))].filter(Boolean), disabledZones);
    if (!product) throw new HttpError(422, `La prenda ${i + 1} ya no está en el catálogo.`);
    if (!product.colors.includes(it.colorId)) throw new HttpError(422, `El color elegido para ${product.name} ya no está disponible.`);
    const size = product.sizes.find((s) => s.id === it.sizeId);
    if (!size) throw new HttpError(422, `Elegí un talle válido para ${product.name}.`);
    if (size.stock === "out") throw new HttpError(409, `${product.name} talle ${size.label} se quedó sin stock.`);
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new HttpError(422, "La cantidad debe estar entre 1 y 50.");
    const analysis = analyzeDesign(product, it.design);
    const designs = await storeDesignsByIds(db, analysis.storeDesignIds);
    for (const id of analysis.storeDesignIds) {
      const d = designs.find((x) => x.id === id);
      if (!d || d.deleted || d.status !== "published" || (d.productIds.length && !d.productIds.includes(product.id))) {
        throw new HttpError(409, `El diseño «${d?.name || id}» ya no está disponible para ${product.name}.`);
      }
    }
    const price = priceWith(product, { sizeId: size.id, qty }, { printedFaces: analysis.printedFaces, storeDesigns: designs, zonePrices });
    const files = requiredFiles(it, analysis);
    lines.push({ product, size, qty, analysis, price, files, collectionIds: designs.map((d) => d.collectionId).filter(Boolean), design: { schema: it.design.schema || "nevrado.design/v1", faces: it.design.faces }, colorId: it.colorId });
  }

  // El envío se vuelve a cotizar acá con el pedido real; la clienta eligió una opción por su id.
  const quote = await quoteShipping(db, address.postalCode, { carriers, lines: lines.map((l) => ({ type: l.product.type, qty: l.qty })) });
  const chosen = typeof body.shipping?.optionId === "string" ? body.shipping.optionId : null;
  const option = chosen ? quote.options.find((o) => o.id === chosen) : quote.options.length === 1 ? quote.options[0] : null;
  if (!option) throw new HttpError(409, "Las opciones de envío cambiaron. Volvé a elegir cómo te lo mandamos.");
  const shipping = { ...option, postalCode: quote.postalCode, live: quote.live, zone: `${option.carrier} · ${option.service}` };

  await verifyFiles(storage, lines.flatMap((l) => l.files));

  const subtotal = lines.reduce((n, l) => n + l.price.total, 0);
  // Código de descuento: se vuelve a validar acá; si ya no sirve, no se cobra distinto de lo que vio la clienta.
  let coupon = null;
  if (body.couponCode) {
    const found = findCoupon(await loadCoupons(db), body.couponCode);
    if (found.error) throw new HttpError(409, `${found.error} Sacalo en el carrito para seguir.`);
    coupon = found.coupon;
  }
  let discount = 0;
  if (coupon) {
    const col = coupon.collectionId && (await loadDesignCollections(db)).find((c) => c.id === coupon.collectionId);
    const r = couponDiscount({ ...coupon, collectionName: col?.name }, lines.map((l) => ({ total: l.price.total, qty: l.qty, collectionIds: l.collectionIds })));
    if (r.missing) throw new HttpError(409, `${r.missing} Sacalo en el carrito para seguir.`);
    discount = r.discount;
  }
  // Transferencia: se vuelve a leer el porcentaje del panel, como el código.
  let transfer = null;
  let transferOff = 0;
  if (byTransfer) {
    transfer = await loadTransfer(db);
    if (!transferReady(transfer)) throw new HttpError(409, "El pago por transferencia ya no está disponible. Elegí otra forma de pago.");
    transferOff = transferDiscount(transfer, subtotal - discount, { hasCoupon: !!coupon });
  }
  const total = subtotal - discount - transferOff + shipping.price;
  const id = crypto.randomUUID();

  await db.tx(async (q) => {
    for (const f of lines.flatMap((l) => l.files)) {
      await q.query(
        "insert into assets (sha256, bucket, storage_key, mime, bytes, name) values ($1,'pedidos',$2,$3,$4,$5) on conflict (sha256) do nothing",
        [f.sha256, f.key, f.mime, f.bytes, f.name || null]
      );
    }
    await q.query(
      `insert into orders (id, customer, shipping, subtotal, shipping_cost, total, idempotency_key, discount, coupon_code, coupon_percent,
         payment_method, transfer_discount, transfer_percent)
       values ($1, $2::text::jsonb, $3::text::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id, JSON.stringify(customer), JSON.stringify({ ...address, quote: shipping }), subtotal, shipping.price, total, idem, discount, coupon?.code || null, coupon?.percent || null,
        byTransfer ? "transferencia" : "mercadopago", transferOff, transferOff ? transfer.percent : null,
      ]
    );
    for (const [pos, l] of lines.entries()) {
      await q.query(
        `insert into order_items (id, order_id, position, product_id, product_name, product_type, color_id, size_id, qty,
           printed_faces, store_design_ids, unit_price, price_lines, design, files)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::jsonb,$11::text::jsonb,$12,$13::text::jsonb,$14::text::jsonb,$15::text::jsonb)`,
        [
          crypto.randomUUID(), id, pos, l.product.id, l.product.name, l.product.type, l.colorId, l.size.id, l.qty,
          JSON.stringify(l.analysis.printedFaces), JSON.stringify(l.analysis.storeDesignIds), l.price.unit,
          JSON.stringify(l.price.lines), JSON.stringify(l.design), JSON.stringify(l.files),
        ]
      );
    }
    await q.query("insert into order_events (order_id, kind, to_status, actor) values ($1,'creado','pendiente_pago','clienta')", [id]);
  });

  return { order: await getOrder(db, id), token: orderToken(secret, id), replay: false };
}

/* ------------------------------- Lectura ------------------------------- */
export async function getOrder(q, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
  const [o] = await q.query("select * from orders where id = $1", [id]);
  if (!o) return null;
  o.items = await q.query("select * from order_items where order_id = $1 order by position", [id]);
  o.events = await q.query("select kind, from_status, to_status, note, actor, created_at from order_events where order_id = $1 order by id", [id]);
  return o;
}

/**
 * Lo que ve la clienta con su enlace: sin archivos ni datos internos. Si
 * paga por transferencia y todavía no pagó, van los datos para transferir
 * (`transfer`, los del panel ahora).
 */
export function publicOrder(o, { transfer = null } = {}) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    statusLabel: ORDER_STATUSES[o.status].label,
    paymentStatus: o.payment_status,
    createdAt: o.created_at,
    customer: { name: o.customer.name, email: o.customer.email },
    shipping: { city: o.shipping.city, province: o.shipping.province, postalCode: o.shipping.postalCode, zone: o.shipping.quote?.zone },
    subtotal: o.subtotal,
    discount: o.discount || 0,
    couponCode: o.coupon_code || null,
    couponPercent: o.coupon_percent || null,
    paymentMethod: o.payment_method || "mercadopago",
    transferDiscount: o.transfer_discount || 0,
    transferPercent: o.transfer_percent || null,
    bank: o.payment_method === "transferencia" && o.status === "pendiente_pago" && transfer ? bankDetails(transfer) : null,
    transferDeadline: o.payment_method === "transferencia" && o.status === "pendiente_pago" && transfer ? transferDeadline(o.created_at, transfer) : null,
    shippingCost: o.shipping_cost,
    total: o.total,
    items: o.items.map((it) => ({
      productName: it.product_name,
      colorId: it.color_id,
      sizeId: it.size_id,
      qty: it.qty,
      unitPrice: it.unit_price,
      printedFaces: it.printed_faces,
    })),
  };
}

/* ------------------------------- Estado -------------------------------- */
/**
 * A qué estados puede pasar un pedido. Una transferencia cancelada (por
 * ejemplo, porque venció) todavía puede pasar a «Pagado» si la plata llegó tarde.
 */
export const nextStatuses = (o) =>
  o.status === "cancelado" && o.payment_method === "transferencia" ? ["pagado"] : ORDER_STATUSES[o.status].next;

/**
 * Cancela los pedidos por transferencia que siguen sin pagar pasado el plazo
 * del panel. Corre con la tarea diaria y cada vez que se abre la lista de
 * pedidos o un pedido, así el plazo se cumple aunque la tarea sea diaria.
 * Devuelve los ids cancelados (para mandarles el aviso).
 */
export async function expireTransferOrders(db, transfer) {
  const hours = transfer?.expiresHours;
  if (!hours) return [];
  const rows = await db.query(
    `select id from orders where status = 'pendiente_pago' and payment_method = 'transferencia'
        and created_at < now() - make_interval(hours => $1::int) order by created_at limit 50`,
    [hours]
  );
  const done = [];
  for (const { id } of rows) {
    try {
      await changeStatus(db, id, "cancelado", { actor: "vencimiento", note: `No llegó la transferencia en ${hours} h` });
      done.push(id);
    } catch (err) {
      console.error(`Vencimiento del pedido ${id}:`, err);
    }
  }
  return done;
}
export async function changeStatus(db, id, to, { actor, note = null }) {
  return db.tx(async (q) => {
    const [o] = await q.query("select id, status, payment_method from orders where id = $1 for update", [id]);
    if (!o) throw new HttpError(404, "Ese pedido no existe.");
    if (!ORDER_STATUSES[to]) throw new HttpError(422, "Estado desconocido.");
    if (o.status === to) return o;
    if (!nextStatuses(o).includes(to)) {
      const msg =
        to === "cancelado"
          ? "Un pedido solo se puede cancelar antes de pasar a producción."
          : `No se puede pasar de «${ORDER_STATUSES[o.status].label}» a «${ORDER_STATUSES[to].label}».`;
      throw new HttpError(409, msg);
    }
    // Una transferencia marcada como pagada a mano queda con el pago aprobado.
    await q.query(
      `update orders set status = $2, updated_at = now(),
         payment_status = case when $2 = 'pagado' and payment_method = 'transferencia' then 'aprobado' else payment_status end
       where id = $1`,
      [id, to]
    );
    await q.query("insert into order_events (order_id, kind, from_status, to_status, note, actor) values ($1,'estado',$2,$3,$4,$5)", [
      id, o.status, to, note ? String(note).slice(0, 300) : null, actor,
    ]);
    return { ...o, status: to };
  });
}

/** Aplica el resultado de un pago consultado a Mercado Pago. */
export async function applyPayment(db, payment) {
  const id = payment.external_reference;
  const order = await getOrder(db, id);
  if (!order) return { ignored: "pedido inexistente" };
  const paymentStatus = PAYMENT_STATUS[payment.status] || "en_proceso";
  const amountOk = Math.round(Number(payment.transaction_amount)) === order.total && (payment.currency_id || "ARS") === "ARS";
  await db.tx(async (q) => {
    await q.query("update orders set payment_status = $2, mp_payment_id = $3, updated_at = now() where id = $1", [id, paymentStatus, String(payment.id)]);
    await q.query("insert into order_events (order_id, kind, note, actor) values ($1,'pago',$2,'mercadopago')", [
      id, `Pago ${payment.id}: ${payment.status}${amountOk ? "" : ` · importe ${payment.transaction_amount} no coincide con ${order.total}`}`,
    ]);
  });
  if (paymentStatus === "aprobado" && amountOk && order.status === "pendiente_pago") {
    await changeStatus(db, id, "pagado", { actor: "mercadopago", note: `Pago ${payment.id} aprobado` });
  }
  return { orderId: id, paymentStatus, amountOk };
}
