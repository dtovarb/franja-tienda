/**
 * Mercado Pago, Checkout Pro.
 *
 * Se eligió Checkout Pro (y no Checkout API/Bricks) porque la clienta paga
 * en la página de Mercado Pago: débito, crédito, dinero en cuenta y
 * transferencia sin que la tienda toque datos de tarjetas, y sin
 * certificación PCI. El servidor:
 *   1. crea la "preferencia" con los importes recalculados acá;
 *   2. recibe la notificación (webhook), verifica la firma x-signature y
 *      vuelve a pedir el pago a la API: nunca confía en el cuerpo recibido;
 *   3. marca el pedido como pagado solo si el importe coincide.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PAYMENT_STATUS = {
  approved: "aprobado",
  authorized: "en_proceso",
  pending: "en_proceso",
  in_process: "en_proceso",
  in_mediation: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

export function createMercadoPago(config, fetchImpl = fetch) {
  if (!config.mpAccessToken) return null;
  const headers = { authorization: `Bearer ${config.mpAccessToken}`, "content-type": "application/json" };

  return {
    async createPreference({ order, items, baseUrl, token }) {
      const back = `${baseUrl}/pedido.html?id=${order.id}&t=${token}`;
      const body = {
        external_reference: order.id,
        statement_descriptor: "NEVRADO",
        items: [
          ...items.map((it) => ({
            id: it.product_id,
            title: `${it.product_name} · ${it.color_id} · ${it.size_id}`.slice(0, 250),
            quantity: it.qty,
            unit_price: it.unit_price,
            currency_id: "ARS",
          })),
          ...(order.shipping_cost ? [{ id: "envio", title: "Envío", quantity: 1, unit_price: order.shipping_cost, currency_id: "ARS" }] : []),
        ],
        payer: { name: order.customer.name, email: order.customer.email },
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        metadata: { order_number: order.number },
      };
      const r = await fetchImpl(`${config.mpApi}/checkout/preferences`, {
        method: "POST",
        headers: { ...headers, "x-idempotency-key": `pref-${order.id}-${order.updated_at ? new Date(order.updated_at).getTime() : 0}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Mercado Pago rechazó la preferencia (${r.status}).`);
      const data = await r.json();
      return { id: data.id, checkoutUrl: data.init_point };
    },

    async getPayment(id) {
      const r = await fetchImpl(`${config.mpApi}/v1/payments/${encodeURIComponent(id)}`, { headers });
      if (!r.ok) throw new Error(`No se pudo consultar el pago ${id} (${r.status}).`);
      return r.json();
    },

    /**
     * Firma de la notificación: header x-signature "ts=…,v1=…" =
     * HMAC-SHA256(secreto, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
     */
    verifySignature(request, dataId) {
      if (!config.mpWebhookSecret) return false;
      const parts = Object.fromEntries(
        (request.headers.get("x-signature") || "").split(",").map((p) => p.trim().split("=").map((s) => s.trim()))
      );
      if (!parts.ts || !parts.v1) return false;
      const reqId = request.headers.get("x-request-id");
      const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
      let manifest = `id:${id};`;
      if (reqId) manifest += `request-id:${reqId};`;
      manifest += `ts:${parts.ts};`;
      const expected = Buffer.from(createHmac("sha256", config.mpWebhookSecret).update(manifest).digest("hex"));
      const got = Buffer.from(parts.v1);
      return expected.length === got.length && timingSafeEqual(expected, got);
    },
  };
}
