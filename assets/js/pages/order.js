/**
 * Estado de un pedido para la clienta (pedido.html?id=…&t=…).
 * El enlace lleva un token propio del pedido; sin él no se ve nada.
 * Mercado Pago vuelve acá después del pago. Si se paga por transferencia,
 * acá están el monto y los datos para transferir hasta que se acredite.
 */
import { initPage, icon, toast } from "../core/ui.js";
import { CONTACT, whatsappUrl } from "../data/contact.js";
import { trackOnce } from "../core/pixel.js";
import { SERVER, api } from "../core/api.js";
import { getColor } from "../data/catalog.js";
import { faceLabel } from "../data/garments.js";
import { formatPrice, escapeHtml, params } from "../core/format.js";
import { readJSON } from "../core/storage.js";

initPage("orders");

const root = document.querySelector("[data-order-root]");
const title = document.querySelector("[data-order-title]");
const q = params();
const id = q.get("id");
const token = q.get("t");

const STEPS = [
  ["pendiente_pago", "Esperando el pago"],
  ["pagado", "Pago acreditado"],
  ["produccion", "En producción"],
  ["despachado", "Despachado"],
  ["entregado", "Entregado"],
];
const PAYMENT = {
  pendiente: "Todavía no recibimos el pago.",
  en_proceso: "Mercado Pago está procesando el pago.",
  aprobado: "Pago aprobado.",
  rechazado: "El pago fue rechazado. Podés probar de nuevo con otro medio.",
  devuelto: "El pago fue devuelto.",
  sin_configurar: "Te vamos a escribir para coordinar el pago.",
};

/** Monto y datos para transferir, con botones para copiarlos. */
function bankBox(o) {
  const b = o.bank;
  const rows = [
    b.alias && ["Alias", b.alias],
    b.cbu && ["CBU / CVU", b.cbu],
    b.holder && ["Titular", b.holder],
    b.cuit && ["CUIT / CUIL", b.cuit],
    b.bank && ["Banco o billetera", b.bank],
  ].filter(Boolean);
  const copy = (v, label) => `<button class="btn btn--sm btn--ghost" type="button" data-copy="${escapeHtml(v)}" aria-label="Copiar ${label}">${icon("copy")}Copiar</button>`;
  const wa = whatsappUrl(`¡Hola! Te mando el comprobante de la transferencia del pedido n.º ${o.number} (${formatPrice(o.total)}).`);
  return `<div class="transfer-box">
    <p class="h3">Transferí ${formatPrice(o.total)}</p>
    <dl class="transfer-box__data">
      <div><dt>Monto</dt><dd><b>${formatPrice(o.total)}</b> ${copy(String(o.total), "el monto")}</dd></div>
      ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd><b>${escapeHtml(v)}</b> ${["Alias", "CBU / CVU", "CUIT / CUIL"].includes(k) ? copy(v, k.toLowerCase()) : ""}</dd></div>`).join("")}
    </dl>
    <p class="hint">Después mandanos el comprobante por WhatsApp o a ${escapeHtml(CONTACT.email)}, con tu número de pedido (n.º ${o.number}). Apenas veamos la transferencia te avisamos por mail y esta página cambia sola a «Pago acreditado».${o.transferDeadline ? ` Si no la recibimos hasta el ${escapeHtml(new Date(o.transferDeadline).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Cordoba" }))} h, el pedido se cancela solo.` : ""}</p>
    <a class="btn btn--primary" href="${wa}" target="_blank" rel="noopener">Mandar el comprobante por WhatsApp ${icon("arrowRight")}</a>
  </div>`;
}

function timeline(o) {
  if (o.status === "cancelado") return `<div class="notice notice--warning">${icon("alert")}<span>Este pedido está cancelado.</span></div>`;
  const at = STEPS.findIndex(([s]) => s === o.status);
  return `<ol class="order-steps" role="list">${STEPS.map(
    ([s, label], i) => `<li data-st="${i < at ? "done" : i === at ? "now" : "next"}" ${i === at ? 'aria-current="step"' : ""}><span></span>${label}</li>`
  ).join("")}</ol>`;
}

const PAID = ["pagado", "produccion", "despachado", "entregado"];

function render(o, { fromPayment }) {
  title.textContent = `Pedido n.º ${o.number}`;
  // La compra se cuenta una vez, cuando la clienta ve su pedido ya pagado
  // (los pedidos de hace más de una semana no, para no contar compras viejas).
  if (PAID.includes(o.status) && Date.now() - new Date(o.createdAt) < 7 * 864e5) {
    trackOnce(`order:${o.id}`, "Purchase", {
      value: o.total,
      num_items: o.items.reduce((n, i) => n + i.qty, 0),
      content_type: "product",
    }, { eventID: `order-${o.id}` });
  }
  const byTransfer = o.paymentMethod === "transferencia";
  const waiting = !byTransfer && fromPayment && o.status === "pendiente_pago" && o.paymentStatus !== "rechazado";
  const paymentText = byTransfer
    ? o.status === "pendiente_pago" ? "Todavía no vimos tu transferencia." : PAID.includes(o.status) ? "Transferencia recibida." : ""
    : PAYMENT[o.paymentStatus] || "";
  root.innerHTML = `
    <div class="order-view">
      <section class="order-view__main" aria-labelledby="ov-state">
        <h2 id="ov-state" class="h3">${escapeHtml(o.statusLabel)}</h2>
        ${q.get("nuevo") ? `<div class="notice notice--success">${icon("check")}<span>¡Listo! Registramos tu pedido${byTransfer && o.status === "pendiente_pago" ? ": ahora falta la transferencia" : ""}. Guardá este enlace para volver a verlo${byTransfer ? " (también te lo mandamos por mail con los datos)" : ""}.</span></div>` : ""}
        ${byTransfer && o.status === "pendiente_pago" && o.bank ? bankBox(o) : ""}
        ${waiting ? `<div class="notice notice--info" data-waiting>${icon("info")}<span>Estamos confirmando tu pago con Mercado Pago. Esta página se actualiza sola.</span></div>` : ""}
        ${timeline(o)}
        <p class="muted">${escapeHtml(paymentText)} El plazo es de 5 a 7 días hábiles desde que se acredita el pago, con el envío incluido.</p>
        ${
          o.status === "pendiente_pago" && !byTransfer && SERVER?.services?.payments
            ? `<button class="btn btn--primary" type="button" data-pay>Pagar con Mercado Pago ${icon("arrowRight")}</button><p class="hint" data-pay-msg></p>`
            : ""
        }
        <ul class="order-lines" role="list">
          ${o.items
            .map(
              (it) => `<li><b>${it.qty} × ${escapeHtml(it.productName)}</b>
              <span class="hint">${escapeHtml(getColor(it.colorId)?.name || it.colorId)} · talle ${escapeHtml(it.sizeId)} · estampa ${it.printedFaces.map(faceLabel).join(" + ").toLowerCase()}</span>
              <span class="price">${formatPrice(it.unitPrice * it.qty)}</span></li>`
            )
            .join("")}
        </ul>
      </section>
      <aside class="summary-box" aria-label="Importes">
        <div class="row"><span>Subtotal</span><span>${formatPrice(o.subtotal)}</span></div>
        ${o.discount ? `<div class="row"><span>Descuento · ${escapeHtml(o.couponCode)} (${o.couponPercent}%)</span><span>−${formatPrice(o.discount)}</span></div>` : ""}
        ${o.transferDiscount ? `<div class="row"><span>Descuento por transferencia (${o.transferPercent}%)</span><span>−${formatPrice(o.transferDiscount)}</span></div>` : ""}
        <div class="row"><span>Envío${o.shipping.zone ? ` · ${escapeHtml(o.shipping.zone)}` : ""}</span><span>${o.shippingCost ? formatPrice(o.shippingCost) : "Gratis"}</span></div>
        <div class="row row--total"><span>Total</span><span class="price" style="font-size:1.5rem">${formatPrice(o.total)}</span></div>
        <p class="hint">A nombre de ${escapeHtml(o.customer.name)} · ${escapeHtml(o.shipping.city)}, ${escapeHtml(o.shipping.province)} (CP ${escapeHtml(o.shipping.postalCode)}).</p>
        <p class="hint">¿Querés cancelarlo? Se puede mientras no haya pasado a producción: escribinos con el número de pedido.</p>
      </aside>
    </div>`;
  root.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        toast("Copiado.", "success");
      } catch {
        toast(`No se pudo copiar: ${b.dataset.copy}`, "error", 6000);
      }
    })
  );
  root.querySelector("[data-pay]")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const { payment } = await api(`orders/${id}/pay?t=${encodeURIComponent(token)}`, { method: "POST", body: {} });
      if (payment.checkoutUrl) location.href = payment.checkoutUrl;
      else root.querySelector("[data-pay-msg]").textContent = payment.error || payment.message;
    } catch (err) {
      root.querySelector("[data-pay-msg]").textContent = err.message;
    }
    b.disabled = false;
  });
  return waiting;
}

async function watchTransfer() {
  if (document.hidden) return setTimeout(watchTransfer, 30000);
  try {
    const { order } = await api(`orders/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`);
    if (order.status === "pendiente_pago") return setTimeout(watchTransfer, 30000);
    render(order, { fromPayment: false });
    if (order.status === "pagado") toast("¡Recibimos tu transferencia! Tu pedido ya está en la cola de producción.", "success", 8000);
  } catch {
    setTimeout(watchTransfer, 60000);
  }
}

function renderMine() {
  const mine = readJSON("pedidos.mios.v1", []);
  title.textContent = "Mis pedidos";
  root.innerHTML = mine.length
    ? `<ul class="order-lines" role="list">${mine
        .map(
          (o) => `<li><a href="pedido.html?id=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.token)}"><b>Pedido n.º ${o.number}</b></a>
          <span class="hint">${new Date(o.createdAt).toLocaleDateString("es-AR")}</span></li>`
        )
        .join("")}</ul><p class="hint">Son los pedidos hechos desde este navegador. Cada uno tiene su propio enlace.</p>`
    : `<div class="empty"><p class="h3">No hay pedidos en este navegador.</p><p class="muted">Si hiciste uno desde otro dispositivo, usá el enlace que te dio la tienda.</p></div>`;
}

async function load(attempt = 0) {
  try {
    const { order } = await api(`orders/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`);
    const fromPayment = q.has("payment_id") || q.has("collection_status") || q.has("status");
    // Después de pagar, el aviso de Mercado Pago puede tardar unos segundos.
    if (render(order, { fromPayment }) && attempt < 10) setTimeout(() => load(attempt + 1), 3000);
    // Esperando una transferencia: se vuelve a mirar cada 30 s mientras la página
    // está abierta, así ve «Pago acreditado» apenas la tienda la confirma.
    else if (order.paymentMethod === "transferencia" && order.status === "pendiente_pago") setTimeout(watchTransfer, 30000);
  } catch (err) {
    root.innerHTML = `<div class="notice notice--danger">${icon("alert")}<span>${escapeHtml(err.status === 404 ? "No encontramos ese pedido. Revisá que el enlace esté completo." : err.message)}</span></div>`;
  }
}

if (!SERVER) {
  root.innerHTML = `<div class="notice notice--info">${icon("info")}<span>Esta versión de la tienda es una demostración y no tiene pedidos reales.</span></div>`;
} else if (id && token) load();
else renderMine();
