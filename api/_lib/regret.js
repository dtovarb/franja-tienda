/**
 * Botón de arrepentimiento (Res. SCI 424/2020).
 *
 * La clienta pide la cancelación sin registrarse. El pedido queda guardado
 * en `regret_requests` con un código de identificación, que se le muestra
 * en pantalla y se le manda por mail (la norma pide darlo dentro de las
 * 24 horas). A OWNER_EMAILS les llega un aviso para que lo resuelvan.
 * Un error en los mails nunca pierde el pedido: el código ya está guardado.
 */
import { randomBytes } from "node:crypto";
import { HttpError } from "./http.js";
import { CONTACT } from "../../assets/js/data/contact.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I/L
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function regretCode() {
  const bytes = randomBytes(8);
  return `ARR-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Valida el formulario. Devuelve null si es spam (campo trampa completo). */
export function parseRegret(body = {}) {
  if (clean(body.website, 200)) return null;
  const req = {
    name: clean(body.name, 120),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 40) || null,
    orderNumber: /^\d{1,9}$/.test(String(body.order ?? "").trim()) ? Number(body.order) : null,
    details: String(body.details ?? "").trim().slice(0, 1000) || null,
  };
  if (req.name.length < 2) throw new HttpError(422, "Escribí tu nombre y apellido.");
  if (!EMAIL.test(req.email)) throw new HttpError(422, "Revisá el mail.");
  return req;
}

export async function createRegret({ db, mailer, config }, body) {
  const req = parseRegret(body);
  // Spam: se responde igual que un pedido real, pero no se guarda nada.
  if (!req) return { code: regretCode(), mailed: false };

  // Se asocia al pedido solo si el número y el mail coinciden.
  let orderId = null;
  if (req.orderNumber) {
    const rows = await db.query("select id, customer from orders where number = $1", [req.orderNumber]);
    if (rows[0] && String(rows[0].customer?.email || "").toLowerCase() === req.email) orderId = rows[0].id;
  }

  let code;
  for (let i = 0; i < 5 && !code; i++) {
    const c = regretCode();
    const rows = await db.query(
      `insert into regret_requests (code, name, email, phone, order_number, order_id, details)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (code) do nothing returning code`,
      [c, req.name, req.email, req.phone, req.orderNumber, orderId, req.details]
    );
    if (rows.length) code = c;
  }
  if (!code) throw new HttpError(500, "No pudimos registrar el pedido. Probá de nuevo.");

  if (orderId) {
    await db.query("insert into order_events (order_id, kind, note, actor) values ($1, 'arrepentimiento', $2, 'clienta')", [
      orderId, `Pedido de arrepentimiento ${code}${req.details ? `: ${req.details.slice(0, 200)}` : ""}`,
    ]).catch((err) => console.error(err));
  }

  let mailed = false;
  if (mailer) {
    mailed = await sendRegretMail(db, mailer, code, "mail_customer", [req.email], customerMail(code, req));
    if (config.ownerEmails.length) await sendRegretMail(db, mailer, code, "mail_owner", config.ownerEmails, ownerMail(code, req, orderId));
  }
  return { code, mailed };
}

async function sendRegretMail(db, mailer, code, column, to, mail) {
  try {
    await mailer.send({ to, ...mail, idempotencyKey: `nevrado-${code}-${column}` });
    await db.query(`update regret_requests set ${column} = 'enviado' where code = $1`, [code]);
    return true;
  } catch (err) {
    console.error(`Mail de arrepentimiento ${code}:`, err);
    await db.query(`update regret_requests set ${column} = $2 where code = $1`, [code, `error: ${String(err.message || err).slice(0, 200)}`]);
    return false;
  }
}

function layout(title, paragraphs) {
  const stripes = ["#a0533a", "#f2bc98", "#ffffff", "#d9a3bc", "#7d3a5e"]
    .map((c) => `<td style="height:6px;background:${c};font-size:0;line-height:0">&nbsp;</td>`)
    .join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif;color:#1e1a1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e0dc">
  <tr>${stripes}</tr>
  <tr><td colspan="5" style="padding:24px 28px 8px"><div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#7d3a5e">nevrado</div></td></tr>
  <tr><td colspan="5" style="padding:8px 28px 24px">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${esc(title)}</h1>
    ${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${p}</p>`).join("")}
  </td></tr>
  <tr><td colspan="5" style="padding:16px 28px;border-top:1px solid #e4e0dc;font-size:12px;color:#5b5256;line-height:1.5">
    WhatsApp ${esc(CONTACT.whatsappLabel)} · ${esc(CONTACT.email)} · Instagram @${esc(CONTACT.instagram)}<br>nevrado · ${esc(CONTACT.city)}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function customerMail(code, req) {
  const first = req.name.split(" ")[0];
  const title = `Recibimos tu pedido de arrepentimiento`;
  const lines = [
    `Hola ${first}, recibimos tu pedido de arrepentimiento${req.orderNumber ? ` del pedido #${req.orderNumber}` : ""}.`,
    `Tu código de identificación es ${code}.`,
    "Si el pedido todavía no entró a producción, lo cancelamos y te devolvemos el total por el mismo medio de pago. Si ya lo recibiste, te escribimos para coordinar la devolución según los términos y condiciones.",
  ];
  return {
    subject: `Código de arrepentimiento ${code} · nevrado`,
    text: [...lines, "", `WhatsApp ${CONTACT.whatsappLabel} · ${CONTACT.email} · Instagram @${CONTACT.instagram}`, `nevrado · ${CONTACT.city}`].join("\n\n"),
    html: layout(title, [esc(lines[0]), `Tu código de identificación es <b style="font-size:18px;letter-spacing:1px">${esc(code)}</b>.`, esc(lines[2])]),
  };
}

function ownerMail(code, req, orderId) {
  const rows = [
    ["Código", code],
    ["Nombre", req.name],
    ["Mail", req.email],
    ["Teléfono", req.phone || "—"],
    ["Pedido", req.orderNumber ? `#${req.orderNumber}${orderId ? "" : " (no coincide con el mail o no existe)"}` : "No lo indicó"],
    ["Comentario", req.details || "—"],
  ];
  const title = `Pedido de arrepentimiento ${code}`;
  return {
    subject: `Arrepentimiento ${code}${req.orderNumber ? ` · pedido #${req.orderNumber}` : ""} · nevrado`,
    text: [title, ...rows.map(([k, v]) => `${k}: ${v}`), "", "Si el pedido no entró a producción, cancelalo en el panel y hacé la devolución desde Mercado Pago."].join("\n"),
    html: layout(title, [
      ...rows.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`),
      "Si el pedido no entró a producción, cancelalo en el panel y hacé la devolución desde Mercado Pago (Actividad → Devolver dinero).",
    ]),
  };
}
