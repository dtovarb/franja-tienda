/**
 * Estado de un pedido para la clienta (pedido.html?id=…&t=…).
 * El enlace lleva un token propio del pedido; sin él no se ve nada.
 * Mercado Pago vuelve acá después del pago.
 */
import { initPage, icon } from "../core/ui.js";
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

function timeline(o) {
  if (o.status === "cancelado") return `<div class="notice notice--warning">${icon("alert")}<span>Este pedido está cancelado.</span></div>`;
  const at = STEPS.findIndex(([s]) => s === o.status);
  return `<ol class="order-steps" role="list">${STEPS.map(
    ([s, label], i) => `<li data-st="${i < at ? "done" : i === at ? "now" : "next"}" ${i === at ? 'aria-current="step"' : ""}><span></span>${label}</li>`
  ).join("")}</ol>`;
}

function render(o, { fromPayment }) {
  title.textContent = `Pedido n.º ${o.number}`;
  const waiting = fromPayment && o.status === "pendiente_pago" && o.paymentStatus !== "rechazado";
  root.innerHTML = `
    <div class="order-view">
      <section class="order-view__main" aria-labelledby="ov-state">
        <h2 id="ov-state" class="h3">${escapeHtml(o.statusLabel)}</h2>
        ${q.get("nuevo") ? `<div class="notice notice--success">${icon("check")}<span>¡Listo! Registramos tu pedido. Guardá este enlace para volver a verlo.</span></div>` : ""}
        ${waiting ? `<div class="notice notice--info" data-waiting>${icon("info")}<span>Estamos confirmando tu pago con Mercado Pago. Esta página se actualiza sola.</span></div>` : ""}
        ${timeline(o)}
        <p class="muted">${escapeHtml(PAYMENT[o.paymentStatus] || "")} El plazo es de 5 a 7 días hábiles desde que se acredita el pago, con el envío incluido.</p>
        ${
          o.status === "pendiente_pago" && SERVER?.services?.payments
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
        <div class="row"><span>Envío${o.shipping.zone ? ` · ${escapeHtml(o.shipping.zone)}` : ""}</span><span>${o.shippingCost ? formatPrice(o.shippingCost) : "Gratis"}</span></div>
        <div class="row row--total"><span>Total</span><span class="price" style="font-size:1.5rem">${formatPrice(o.total)}</span></div>
        <p class="hint">A nombre de ${escapeHtml(o.customer.name)} · ${escapeHtml(o.shipping.city)}, ${escapeHtml(o.shipping.province)} (CP ${escapeHtml(o.shipping.postalCode)}).</p>
        <p class="hint">¿Querés cancelarlo? Se puede mientras no haya pasado a producción: escribinos con el número de pedido.</p>
      </aside>
    </div>`;
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
  } catch (err) {
    root.innerHTML = `<div class="notice notice--danger">${icon("alert")}<span>${escapeHtml(err.status === 404 ? "No encontramos ese pedido. Revisá que el enlace esté completo." : err.message)}</span></div>`;
  }
}

if (!SERVER) {
  root.innerHTML = `<div class="notice notice--info">${icon("info")}<span>Esta versión de la tienda es una demostración y no tiene pedidos reales.</span></div>`;
} else if (id && token) load();
else renderMine();
