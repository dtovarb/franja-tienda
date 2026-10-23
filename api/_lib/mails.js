/**
 * Mails de los pedidos, enviados con Resend (API HTTP).
 *
 *   comprobante      a la clienta, cuando el pedido pasa a «pagado»
 *                    (aviso de Mercado Pago o cambio a mano en el panel).
 *   pedido_recibido  a la clienta, al crear un pedido sin cobro online
 *                    («cobro a coordinar»).
 *   aviso_duena      a OWNER_EMAILS, en esos mismos dos momentos.
 *
 * `sendOrderMails` mira el estado actual del pedido y manda lo que
 * corresponda. Cada mail se reserva antes en `order_emails` (pedido + tipo),
 * así un aviso repetido de Mercado Pago o dos instancias a la vez no lo
 * mandan dos veces. Si el envío falla, la reserva queda en «error» y el
 * próximo aviso lo reintenta. Además va con Idempotency-Key a Resend.
 *
 * Sin RESEND_API_KEY no se manda nada y los pedidos funcionan igual.
 */
import { loadColors } from "./catalog.js";
import { orderToken } from "./orders.js";
import { CONTACT } from "../../assets/js/data/contact.js";
import { faceLabel } from "../../assets/js/data/garments.js";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const price = (n) => money.format(Math.round(Number(n) || 0));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const date = (d) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Cordoba" }).format(new Date(d));

export function createMailer(config, fetchImpl = fetch) {
  if (!config.resendApiKey) return null;
  return {
    from: config.mailFrom,
    async send({ to, subject, html, text, idempotencyKey }) {
      const r = await fetchImpl(`${config.resendApi}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          from: config.mailFrom,
          to,
          subject,
          html,
          text,
          ...(config.mailReplyTo ? { reply_to: config.mailReplyTo } : {}),
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Resend respondió ${r.status}${data.message ? `: ${data.message}` : ""}`);
      return data.id || null;
    },
  };
}

/** Qué mails corresponden al pedido en el estado en que está ahora. */
function dueMails(order, ownerEmails) {
  const paid = order.status === "pagado";
  const toCoordinate = order.status === "pendiente_pago" && order.payment_status === "sin_configurar";
  const kinds = [];
  if (paid) kinds.push({ kind: "comprobante", to: [order.customer.email] });
  if (toCoordinate) kinds.push({ kind: "pedido_recibido", to: [order.customer.email] });
  if ((paid || toCoordinate) && ownerEmails.length) kinds.push({ kind: "aviso_duena", to: ownerEmails });
  return kinds;
}

/** Reserva el mail: devuelve true solo a quien tiene que mandarlo. */
async function claim(db, orderId, kind, to) {
  const rows = await db.query(
    `insert into order_emails (order_id, kind, recipients, status) values ($1, $2, $3, 'enviando')
     on conflict (order_id, kind) do update set status = 'enviando', attempts = order_emails.attempts + 1, updated_at = now()
       where order_emails.status = 'error'
     returning order_id`,
    [orderId, kind, to.join(", ")]
  );
  return rows.length > 0;
}

export async function sendOrderMails({ db, mailer, config }, order, baseUrl) {
  if (!mailer || !order) return [];
  const due = dueMails(order, config.ownerEmails);
  if (!due.length) return [];
  const colors = await loadColors(db).catch(() => ({}));
  const link = `${baseUrl}/pedido.html?id=${order.id}&t=${orderToken(config.sessionSecret, order.id)}`;
  const results = [];
  for (const { kind, to } of due) {
    if (!(await claim(db, order.id, kind, to))) continue;
    const mail = renderMail(kind, order, { colors, link, adminLink: `${baseUrl}/admin.html` });
    try {
      const id = await mailer.send({ to, ...mail, idempotencyKey: `nevrado-${order.id}-${kind}` });
      await db.query("update order_emails set status = 'enviado', provider_id = $3, error = null, updated_at = now() where order_id = $1 and kind = $2", [
        order.id, kind, id,
      ]);
      await db.query("insert into order_events (order_id, kind, note, actor) values ($1, 'mail', $2, 'sistema')", [
        order.id, `${LABELS[kind]} enviado a ${to.join(", ")}`,
      ]);
      results.push({ kind, sent: true });
    } catch (err) {
      console.error(`Mail ${kind} del pedido ${order.number}:`, err);
      await db.query("update order_emails set status = 'error', error = $3, updated_at = now() where order_id = $1 and kind = $2", [
        order.id, kind, String(err.message || err).slice(0, 300),
      ]);
      await db.query("insert into order_events (order_id, kind, note, actor) values ($1, 'mail', $2, 'sistema')", [
        order.id, `No se pudo enviar ${LABELS[kind].toLowerCase()} (${String(err.message || err).slice(0, 120)})`,
      ]);
      results.push({ kind, sent: false });
    }
  }
  return results;
}

const LABELS = {
  comprobante: "Comprobante de compra",
  pedido_recibido: "Mail de pedido recibido",
  aviso_duena: "Aviso de pedido nuevo",
  recordatorio_pago: "Recordatorio de pago",
};

/** Manda un mail ya reservado y deja asentado cómo salió. */
async function deliver({ db, mailer }, order, kind, to, mail) {
  try {
    const id = await mailer.send({ to, ...mail, idempotencyKey: `nevrado-${order.id}-${kind}` });
    await db.query("update order_emails set status = 'enviado', provider_id = $3, error = null, updated_at = now() where order_id = $1 and kind = $2", [order.id, kind, id]);
    await db.query("insert into order_events (order_id, kind, note, actor) values ($1, 'mail', $2, 'sistema')", [order.id, `${LABELS[kind]} enviado a ${to.join(", ")}`]);
    return true;
  } catch (err) {
    console.error(`Mail ${kind} del pedido ${order.number}:`, err);
    await db.query("update order_emails set status = 'error', error = $3, updated_at = now() where order_id = $1 and kind = $2", [order.id, kind, String(err.message || err).slice(0, 300)]);
    return false;
  }
}

/**
 * Recordatorio a quien dejó un pedido sin pagar en Mercado Pago. Va una sola
 * vez por pedido, entre 20 y 72 horas después de hecho, y no va si la misma
 * clienta ya pagó otro pedido después, ni si el cobro online no está activo
 * (esos pedidos se coordinan a mano).
 */
export async function sendPaymentReminders({ db, mailer, config }, baseUrl, { getOrder, limit = 30 } = {}) {
  if (!mailer) return [];
  const rows = await db.query(
    `select o.id from orders o
      where o.status = 'pendiente_pago'
        and o.payment_status in ('pendiente', 'rechazado')
        and o.created_at < now() - interval '20 hours'
        and o.created_at > now() - interval '72 hours'
        and not exists (select 1 from order_emails e where e.order_id = o.id and e.kind = 'recordatorio_pago' and e.status <> 'error')
        and not exists (
          select 1 from orders p
           where p.id <> o.id and lower(p.customer->>'email') = lower(o.customer->>'email')
             and p.created_at > o.created_at and p.status <> 'pendiente_pago' and p.status <> 'cancelado'
        )
      order by o.created_at
      limit $1`,
    [limit]
  );
  const colors = rows.length ? await loadColors(db).catch(() => ({})) : {};
  const results = [];
  for (const { id } of rows) {
    const order = await getOrder(db, id);
    if (!order?.customer?.email) continue;
    const to = [order.customer.email];
    if (!(await claim(db, order.id, "recordatorio_pago", to))) continue;
    const link = `${baseUrl}/pedido.html?id=${order.id}&t=${orderToken(config.sessionSecret, order.id)}`;
    const mail = renderMail("recordatorio_pago", order, { colors, link });
    results.push({ order: order.number, sent: await deliver({ db, mailer }, order, "recordatorio_pago", to, mail) });
  }
  return results;
}

/* ------------------------------ Contenido ------------------------------ */
function itemsOf(order, colors) {
  return order.items.map((it) => {
    const faces = (it.printed_faces || []).map((f) => faceLabel(f).toLowerCase()).join(", ");
    const detail = [colors[it.color_id]?.name || it.color_id, `talle ${it.size_id}`, faces && `estampa ${faces}`].filter(Boolean).join(" · ");
    return { name: it.product_name, detail, qty: it.qty, unit: it.unit_price, total: it.unit_price * it.qty };
  });
}

function addressOf(s) {
  return [`${s.street} ${s.number}${s.apartment ? `, ${s.apartment}` : ""}`, `${s.city}, ${s.province} (${s.postalCode})`];
}

function shippingLabel(order) {
  const q = order.shipping.quote || {};
  return [q.carrier, q.service].filter(Boolean).join(" · ") || "Envío";
}

export function renderMail(kind, order, { colors = {}, link, adminLink }) {
  const items = itemsOf(order, colors);
  const n = order.number;
  const first = String(order.customer.name || "").split(/\s+/)[0];
  const content = {
    comprobante: {
      subject: `Tu compra en nevrado · pedido #${n}`,
      title: "¡Gracias por tu compra!",
      intro: `Hola ${first}, recibimos el pago de tu pedido #${n}. Ya está en la cola de producción.`,
      payment: `Pagado con Mercado Pago${order.mp_payment_id ? ` · operación ${order.mp_payment_id}` : ""}`,
      after: "Te llega en 5 a 7 días hábiles desde la acreditación del pago, con el envío incluido. Si necesitás cancelar, podés hacerlo mientras el pedido no haya pasado a producción.",
      cta: "Seguir mi pedido",
    },
    pedido_recibido: {
      subject: `Recibimos tu pedido #${n} · nevrado`,
      title: "Recibimos tu pedido",
      intro: `Hola ${first}, tu pedido #${n} quedó registrado. Te vamos a contactar para coordinar el pago.`,
      payment: "Pago a coordinar con la tienda",
      after: "El plazo de 5 a 7 días hábiles, con el envío incluido, empieza cuando se acredita el pago.",
      cta: "Ver mi pedido",
    },
    recordatorio_pago: {
      subject: `Tu pedido #${n} te está esperando · nevrado`,
      title: "Tu pedido te está esperando",
      intro: `Hola ${first}, tu pedido #${n} quedó guardado pero el pago no se completó. Si todavía lo querés, lo podés pagar desde el botón de abajo.`,
      payment: "Pago pendiente · Mercado Pago (débito, crédito o transferencia)",
      after: "El plazo de 5 a 7 días hábiles, con el envío incluido, empieza cuando se acredita el pago. Si ya no lo querés, no hace falta que hagas nada.",
      cta: "Pagar mi pedido",
    },
    aviso_duena: {
      subject: `Pedido #${n} ${order.status === "pagado" ? "pagado" : "nuevo, cobro a coordinar"} · ${price(order.total)}`,
      title: order.status === "pagado" ? `Pedido #${n} pagado` : `Pedido #${n}: cobro a coordinar`,
      intro: `${order.customer.name} · ${order.customer.email} · ${order.customer.phone}`,
      payment: order.status === "pagado" ? `Mercado Pago${order.mp_payment_id ? ` · operación ${order.mp_payment_id}` : ""}` : "Sin cobro online: hay que contactarla para coordinar el pago.",
      after: "Los archivos de impresión están en el panel.",
      cta: "Abrir el panel",
    },
  }[kind];
  const ctaLink = kind === "aviso_duena" ? adminLink : link;
  const addr = addressOf(order.shipping);
  const notes = order.shipping.notes;

  const text = [
    content.title,
    "",
    content.intro,
    "",
    `Pedido #${n} · ${date(order.created_at)}`,
    ...items.map((i) => `- ${i.qty} × ${i.name} (${i.detail}): ${price(i.total)}`),
    `Subtotal: ${price(order.subtotal)}`,
    ...(order.discount ? [`Descuento (código ${order.coupon_code}, ${order.coupon_percent}%): −${price(order.discount)}`] : []),
    `${shippingLabel(order)}: ${order.shipping_cost ? price(order.shipping_cost) : "gratis"}`,
    `Total: ${price(order.total)}`,
    content.payment,
    "",
    "Envío a:",
    order.customer.name,
    ...addr,
    ...(notes ? [`Indicaciones: ${notes}`] : []),
    "",
    content.after,
    "",
    `${content.cta}: ${ctaLink}`,
    "",
    ...(kind === "aviso_duena" ? [] : [...(kind === "recordatorio_pago" ? [] : ["Este mail es tu comprobante de compra; no es una factura."]), `¿Dudas? WhatsApp ${CONTACT.whatsappLabel} · ${CONTACT.email} · Instagram @${CONTACT.instagram}`, ""]),
    "nevrado · Córdoba, Argentina",
  ].join("\n");

  const row = (label, value, strong = false) =>
    `<tr><td style="padding:4px 0;color:#5b5256">${esc(label)}</td><td align="right" style="padding:4px 0;${strong ? "font-weight:700;font-size:17px;color:#1e1a1c" : "color:#1e1a1c"}">${esc(value)}</td></tr>`;
  const stripes = ["#a0533a", "#f2bc98", "#ffffff", "#d9a3bc", "#7d3a5e"]
    .map((c) => `<td style="height:6px;background:${c};font-size:0;line-height:0">&nbsp;</td>`)
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif;color:#1e1a1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e0dc">
  <tr>${stripes}</tr>
  <tr><td colspan="5" style="padding:24px 28px 8px">
    <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#7d3a5e">nevrado</div>
  </td></tr>
  <tr><td colspan="5" style="padding:8px 28px 0">
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25">${esc(content.title)}</h1>
    <p style="margin:0 0 20px;line-height:1.5">${esc(content.intro)}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#5b5256">Pedido #${n} · ${esc(date(order.created_at))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e0dc">
      ${items
        .map(
          (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e0dc;line-height:1.4">
        <b>${i.qty} × ${esc(i.name)}</b><br><span style="font-size:13px;color:#5b5256">${esc(i.detail)}${i.qty > 1 ? ` · ${esc(price(i.unit))} c/u` : ""}</span>
      </td><td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid #e4e0dc">${esc(price(i.total))}</td></tr>`
        )
        .join("")}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${row("Subtotal", price(order.subtotal))}
      ${order.discount ? row(`Descuento · código ${order.coupon_code} (${order.coupon_percent}%)`, `−${price(order.discount)}`) : ""}
      ${row(shippingLabel(order), order.shipping_cost ? price(order.shipping_cost) : "Gratis")}
      ${row("Total", price(order.total), true)}
    </table>
    <p style="margin:12px 0 0;font-size:13px;color:#5b5256">${esc(content.payment)}</p>
    <h2 style="margin:24px 0 6px;font-size:15px">Envío a</h2>
    <p style="margin:0;line-height:1.5">${[order.customer.name, ...addr].map(esc).join("<br>")}${notes ? `<br><span style="color:#5b5256">${esc(notes)}</span>` : ""}</p>
    <p style="margin:20px 0;line-height:1.5">${esc(content.after)}</p>
    <p style="margin:0 0 28px"><a href="${esc(ctaLink)}" style="display:inline-block;background:#7d3a5e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px">${esc(content.cta)}</a></p>
  </td></tr>
  <tr><td colspan="5" style="padding:16px 28px;border-top:1px solid #e4e0dc;font-size:12px;color:#5b5256;line-height:1.5">
    ${kind === "aviso_duena" ? "" : `${kind === "recordatorio_pago" ? "" : "Este mail es tu comprobante de compra; no es una factura.<br>"}¿Dudas? WhatsApp ${esc(CONTACT.whatsappLabel)} · ${esc(CONTACT.email)} · Instagram @${esc(CONTACT.instagram)}<br>`}nevrado · Córdoba, Argentina
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: content.subject, html, text };
}
