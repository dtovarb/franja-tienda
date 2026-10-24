/**
 * Partes del panel que solo existen con servidor: login, pedidos reales
 * (con sus archivos en el almacenamiento privado), tarifas de envío y
 * cobros (transferencia con descuento).
 */
import { icon, toast, confirmDialog } from "../core/ui.js";
import { SERVER, api, ApiError } from "../core/api.js";

const SHIPPING_LIVE = (SERVER?.services?.shipping || []).length > 0;
import { getColor } from "../data/catalog.js";
import { faceLabel } from "../data/garments.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { MAX_TRANSFER_PERCENT, MAX_EXPIRES_HOURS } from "../core/transfer.js";

const $ = (s, r = document) => r.querySelector(s);
const ROLE = { original: "Original", preview: "Vista previa", print: "Impresión" };
const PAYMENT = {
  pendiente: "Pago pendiente",
  en_proceso: "Pago en proceso",
  aprobado: "Pago aprobado",
  rechazado: "Pago rechazado",
  devuelto: "Pago devuelto",
  sin_configurar: "Cobro a coordinar",
};
/** Estado del pago para la lista y el detalle (las transferencias se confirman a mano). */
const paymentLabel = (o) =>
  o.payment_method === "transferencia"
    ? o.status === "pendiente_pago" ? "Espera transferencia" : o.status === "cancelado" ? "Transferencia" : "Transferencia recibida"
    : PAYMENT[o.payment_status] || "";
const date = (d) => new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

/* ======================= Login ======================= */
export async function gate(start) {
  const head = $(".admin .page-head .eyebrow");
  head.textContent = "Panel de la tienda";
  const warning = $(".admin-warning");
  const tabs = $(".admin-tabs");
  const panels = [...document.querySelectorAll("[data-panel]")];
  // Pestañas de envíos y cobros (solo con servidor).
  tabs.insertAdjacentHTML(
    "beforeend",
    `<button role="tab" id="tab-envios" aria-controls="panel-envios" data-tab="envios">Envíos</button>
     <button role="tab" id="tab-cobros" aria-controls="panel-cobros" data-tab="cobros">Cobros</button>`
  );
  panels.at(-1).insertAdjacentHTML(
    "afterend",
    `<section class="admin-panel" role="tabpanel" id="panel-envios" aria-labelledby="tab-envios" data-panel="envios" hidden></section>
     <section class="admin-panel" role="tabpanel" id="panel-cobros" aria-labelledby="tab-cobros" data-panel="cobros" hidden></section>`
  );

  const showApp = (user) => {
    warning.className = "notice notice--info admin-warning";
    warning.setAttribute("role", "status");
    warning.innerHTML = `${icon("info")}<div><p>Entraste como <b>${escapeHtml(user.email)}</b>. Los cambios se guardan en la base de la tienda y se ven enseguida en el sitio.</p>
      <button class="btn btn--sm" type="button" data-logout>Salir</button></div>`;
    $("[data-logout]", warning).addEventListener("click", async () => {
      await api("auth/logout", { method: "POST", body: {} }).catch(() => {});
      location.reload();
    });
    tabs.hidden = false;
    start();
  };

  let me = null;
  try {
    me = (await api("auth/me")).user;
  } catch {
    /* sin sesión */
  }
  if (me) return showApp(me);

  tabs.hidden = true;
  panels.forEach((p) => (p.hidden = true));
  warning.className = "admin-login";
  warning.removeAttribute("role");
  warning.innerHTML = `
    <form class="admin-form" data-login novalidate>
      <h2 class="h3">Entrar al panel</h2>
      <div class="field"><label for="lg-email">Mail</label><input class="input" id="lg-email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lg-pass">Contraseña</label><input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" required></div>
      <div class="notice notice--danger form-errors" role="alert" data-login-errors></div>
      <div class="admin-form__actions"><button class="btn btn--primary" type="submit">Entrar</button></div>
    </form>`;
  const form = $("[data-login]", warning);
  form.email.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const { user } = await api("auth/login", { method: "POST", body: { email: form.email.value, password: form.password.value } });
      showApp(user);
    } catch (err) {
      $("[data-login-errors]", form).textContent = err.message;
      btn.disabled = false;
    }
  });
}

/* ======================= Pedidos ======================= */
let statuses = {};
let filter = "";

export function renderServerPanels({ ordersPanel }) {
  renderOrders(ordersPanel);
  renderShipping($("[data-panel=envios]"));
  renderPayments($("[data-panel=cobros]"));
  if (!ordersPanel.dataset.bound) {
    ordersPanel.dataset.bound = "1";
    bindOrders(ordersPanel);
  }
}

async function renderOrders(panel) {
  const { orders, statuses: st } = await api(`admin/orders${filter ? `?status=${filter}` : ""}`);
  statuses = st;
  if (!filter) $('[data-count="pedidos"]').textContent = orders.length;
  panel.innerHTML = `
    <div class="admin-head">
      <div>
        <h2 class="h3">Pedidos</h2>
        <p class="muted">Un pedido pasa a «Pagado» solo cuando Mercado Pago confirma el pago (o si lo marcás a mano). Los que dicen «Espera transferencia» los pasás vos a «Pagado» cuando te llega la plata: a la clienta le llega un mail en el momento. Se puede cancelar solo antes de producción.</p>
      </div>
      <label class="admin-order__status">Ver
        <select class="input" data-order-filter>
          <option value="">Todos</option>
          ${Object.entries(statuses).map(([id, s]) => `<option value="${id}" ${filter === id ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </label>
    </div>
    ${
      orders.length
        ? `<ul class="admin-list" role="list">${orders
            .map(
              (o) => `
        <li class="admin-product admin-product--order" data-order-row="${o.id}">
          <details>
            <summary>
              <span class="admin-row__main">
                <b>Pedido n.º ${o.number}</b>
                <span class="hint">${date(o.created_at)} · ${escapeHtml(o.customer.name)} · ${escapeHtml(o.shipping.city)} · ${o.units} prenda${o.units === 1 ? "" : "s"}</span>
              </span>
              <span class="admin-product__state">
                <span class="tag ${o.status === "cancelado" ? "tag--demo" : "tag--magenta"}">${escapeHtml(statuses[o.status].label)}</span>
                <span class="hint">${paymentLabel(o)} · ${formatPrice(o.total)}</span>
              </span>
            </summary>
            <div data-order-detail="${o.id}"><p class="muted">Cargando…</p></div>
          </details>
        </li>`
            )
            .join("")}</ul>`
        : `<div class="empty"><p class="h3">No hay pedidos${filter ? " en ese estado" : " todavía"}.</p></div>`
    }`;
}

function bindOrders(panel) {
  panel.addEventListener("change", (e) => {
    if (e.target.matches("[data-order-filter]")) {
      filter = e.target.value;
      renderOrders(panel);
    }
  });
  // El detalle (con enlaces firmados que vencen) se pide al abrir cada pedido.
  panel.addEventListener(
    "toggle",
    (e) => {
      const det = e.target;
      if (det.tagName !== "DETAILS" || !det.open) return;
      const host = det.querySelector("[data-order-detail]");
      if (host) loadDetail(host);
    },
    true
  );
  panel.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-status-form]");
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.statusForm;
    const to = form.status.value;
    if (to === "cancelado") {
      const ok = await confirmDialog({ title: "¿Cancelar este pedido?", body: "No se puede deshacer. Si ya estaba pagado, el reintegro se hace desde Mercado Pago.", confirmLabel: "Cancelar pedido", danger: true });
      if (!ok) return;
    }
    try {
      await api(`admin/orders/${id}`, { method: "PATCH", body: { status: to, note: form.note.value } });
      toast(`Pedido actualizado: ${statuses[to].label}.`, "success");
      await renderOrders(panel);
      const det = panel.querySelector(`[data-order-row="${id}"] details`);
      if (det) det.open = true;
    } catch (err) {
      toast(err.message, "error", 6000);
    }
  });
  panel.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      await navigator.clipboard?.writeText(copy.dataset.copy).catch(() => {});
      toast("Enlace copiado.", "success");
    }
    const dl = e.target.closest("[data-design-json]");
    if (dl) {
      const blob = new Blob([dl.dataset.designJson], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: dl.dataset.filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });
}

async function loadDetail(host) {
  let order;
  try {
    ({ order } = await api(`admin/orders/${host.dataset.orderDetail}`));
  } catch (err) {
    host.innerHTML = `<p class="notice notice--danger">${escapeHtml(err.message)}</p>`;
    return;
  }
  const c = order.customer;
  const s = order.shipping;
  const next = order.next || statuses[order.status].next;
  host.innerHTML = `
    <div class="admin-form order-admin">
      <div class="admin-grid">
        <div>
          <p class="eyebrow muted">Clienta</p>
          <p><b>${escapeHtml(c.name)}</b><br><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a><br>${escapeHtml(c.phone)}</p>
        </div>
        <div>
          <p class="eyebrow muted">Envío · ${escapeHtml(s.quote?.zone || "")}</p>
          <p>${escapeHtml(`${s.street} ${s.number}${s.apartment ? `, ${s.apartment}` : ""}`)}<br>${escapeHtml(`${s.city}, ${s.province} (CP ${s.postalCode})`)}${s.notes ? `<br><span class="hint">${escapeHtml(s.notes)}</span>` : ""}</p>
        </div>
      </div>
      <ul class="admin-order__items order-admin__items" role="list">
        ${order.items
          .map((it, i) => {
            const previews = it.files.filter((f) => f.role === "preview");
            return `<li>
              <div class="order-admin__previews">${previews.map((f) => `<a href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="Vista previa ${escapeHtml(faceLabel(f.face))}" loading="lazy"></a>`).join("")}</div>
              <span><b>${it.qty} × ${escapeHtml(it.product_name)}</b>
                <span class="hint">${escapeHtml(getColor(it.color_id)?.name || it.color_id)} · talle ${escapeHtml(it.size_id)} · ${it.printed_faces.map(faceLabel).join(" + ")} · ${formatPrice(it.unit_price)} c/u</span>
                <span class="hint">${it.price_lines.map((l) => `${escapeHtml(l.label)} ${formatPrice(l.amount)}`).join(" · ")}</span>
                <span class="order-admin__files">
                  ${it.files
                    .map((f) => `<a class="btn btn--sm" href="${f.url}" download>${icon("download")}${ROLE[f.role]}${f.face ? ` ${escapeHtml(faceLabel(f.face).toLowerCase())}` : ""}${f.name ? ` · ${escapeHtml(f.name)}` : ""}</a>`)
                    .join("")}
                  <button class="btn btn--sm" type="button" data-design-json="${escapeHtml(JSON.stringify(it.design))}" data-filename="pedido-${order.number}-${i + 1}-diseno.json">${icon("download")}Diseño editable</button>
                </span>
              </span>
            </li>`;
          })
          .join("")}
      </ul>
      <div class="admin-grid">
        <div>
          <p class="eyebrow muted">Importes</p>
          <p>Subtotal ${formatPrice(order.subtotal)}${order.discount ? ` · descuento −${formatPrice(order.discount)} (código ${escapeHtml(order.coupon_code)}, ${order.coupon_percent}%)` : ""}${order.transfer_discount ? ` · transferencia −${formatPrice(order.transfer_discount)} (${order.transfer_percent}%)` : ""} · envío ${order.shipping_cost ? formatPrice(order.shipping_cost) : "gratis"} · <b>total ${formatPrice(order.total)}</b><br>
          <span class="hint">${paymentLabel(order)}${order.payment_method === "transferencia" && order.status === "pendiente_pago" ? ` · cuando veas ${formatPrice(order.total)} en tu cuenta, pasalo a «Pagado»` : ""}${order.mp_payment_id ? ` · Mercado Pago n.º ${escapeHtml(order.mp_payment_id)}` : ""}</span></p>
          <p><button class="btn btn--sm btn--ghost" type="button" data-copy="${escapeHtml(order.customerLink)}">${icon("copy")}Copiar el enlace de la clienta</button></p>
        </div>
        ${
          next.length
            ? `<form data-status-form="${order.id}" class="order-admin__status">
              <div class="field"><label for="st-${order.id}">Pasar a</label>
                <select class="input" id="st-${order.id}" name="status">${next.map((n) => `<option value="${n}">${statuses[n].label}</option>`).join("")}</select></div>
              <div class="field"><label for="nt-${order.id}">Nota (opcional)</label><input class="input" id="nt-${order.id}" name="note" maxlength="300" placeholder="Ej.: n.º de seguimiento"></div>
              <button class="btn btn--primary btn--sm" type="submit">Actualizar estado</button>
            </form>`
            : `<p class="muted">Pedido ${escapeHtml(statuses[order.status].label.toLowerCase())}: no tiene más pasos.</p>`
        }
      </div>
      <details class="order-admin__events"><summary>Historial</summary>
        <ul role="list">${order.events
          .map((ev) => `<li><span class="hint">${date(ev.created_at)}</span> ${escapeHtml(ev.to_status ? statuses[ev.to_status]?.label || ev.to_status : ev.kind)}${ev.note ? ` · ${escapeHtml(ev.note)}` : ""} <span class="hint">(${escapeHtml(ev.actor)})</span></li>`)
          .join("")}</ul>
      </details>
    </div>`;
}

/* ======================= Envíos ======================= */
async function renderShipping(panel) {
  const [{ rates }, { shipping }] = await Promise.all([api("admin/shipping-rates"), api("admin/shipping-settings")]);
  panel.innerHTML = `
    <form class="admin-form" data-free-form novalidate>
      <h2 class="h3">Envío gratis</h2>
      <label class="check">
        <input type="checkbox" name="freeShipping" ${shipping.freeShipping ? "checked" : ""}>
        <span>Envío gratis a todo el país</span>
      </label>
      <p class="hint">Para campañas de envío gratis. Mientras esté prendido no se calcula el envío: todos los pedidos van con envío $0. Apagalo cuando termine la campaña y vuelve a cotizarse por código postal.</p>
      <div class="admin-form__actions"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>
    <div class="admin-head">
      <div>
        <h2 class="h3">Tarifas de envío</h2>
        <p class="muted">${
          SHIPPING_LIVE
            ? "Los precios salen en vivo de Correo Argentino y Andreani. Esta tabla se usa como respaldo si las empresas no responden."
            : "Mientras no estén conectadas las cuentas de Correo Argentino y Andreani, el envío sale de esta tabla."
        } Gana la primera fila, de arriba hacia abajo, cuyo rango incluya el código postal. Tildá «Envío gratis» en una zona para que sus códigos postales no paguen envío (el precio queda guardado para cuando lo destildes). Los importes marcados «de ejemplo» no son tarifas reales.</p>
      </div>
    </div>
    <form class="admin-form" data-rates-form novalidate>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th scope="col">Zona</th><th scope="col">CP desde</th><th scope="col">CP hasta</th><th scope="col">Precio (ARS)</th><th scope="col">Envío gratis</th><th scope="col"><span class="sr-only">Quitar</span></th></tr></thead>
          <tbody data-rates>${rates.map(rateRow).join("")}</tbody>
        </table>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-rates-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar tarifas</button>
        <button class="btn btn--ghost" type="button" data-add-rate>${icon("plus")}Agregar zona</button>
      </div>
    </form>`;
  $("[data-free-form]", panel).addEventListener("submit", async (e) => {
    e.preventDefault();
    const freeShipping = e.currentTarget.elements.freeShipping.checked;
    try {
      await api("admin/shipping-settings", { method: "PUT", body: { shipping: { freeShipping } } });
      toast(freeShipping ? "Envío gratis prendido. La tienda lo muestra en menos de un minuto." : "Envío gratis apagado: el envío vuelve a calcularse.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo guardar.", "error");
    }
  });
  const form = $("[data-rates-form]", panel);
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-add-rate]")) $("[data-rates]", form).insertAdjacentHTML("beforeend", rateRow({ id: "", name: "", cp_from: 1000, cp_to: 9999, price: 0, free: false }));
    const rm = e.target.closest("[data-remove-rate]");
    if (rm) rm.closest("tr").remove();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "free") e.target.closest("tr").classList.toggle("is-free", e.target.checked);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = [...form.querySelectorAll("[data-rate]")].map((tr) => ({
      id: tr.dataset.rate,
      name: tr.querySelector("[name=name]").value,
      cp_from: Number(tr.querySelector("[name=cp_from]").value),
      cp_to: Number(tr.querySelector("[name=cp_to]").value),
      price: Number(tr.querySelector("[name=price]").value),
      free: tr.querySelector("[name=free]").checked,
    }));
    try {
      await api("admin/shipping-rates", { method: "PUT", body: { rates: list } });
      toast("Tarifas guardadas.", "success");
      renderShipping(panel);
    } catch (err) {
      $("[data-rates-errors]", form).textContent = err instanceof ApiError ? err.message : "No se pudieron guardar.";
    }
  });
}

const rateRow = (r) => `
  <tr data-rate="${escapeHtml(r.id)}"${r.free ? ' class="is-free"' : ""}>
    <td><input class="input" name="name" maxlength="60" value="${escapeHtml(r.name)}" aria-label="Zona">${r.example ? ' <span class="tag tag--demo">de ejemplo</span>' : ""}</td>
    <td><input class="input" name="cp_from" type="number" min="1000" max="9999" value="${r.cp_from}" aria-label="Código postal desde"></td>
    <td><input class="input" name="cp_to" type="number" min="1000" max="9999" value="${r.cp_to}" aria-label="Código postal hasta"></td>
    <td><input class="input" name="price" type="number" min="0" step="100" value="${r.price}" aria-label="Precio"></td>
    <td><label class="check check--cell"><input type="checkbox" name="free" ${r.free ? "checked" : ""} aria-label="Envío gratis en ${escapeHtml(r.name || "esta zona")}"><span aria-hidden="true">Gratis</span></label></td>
    <td><button class="icon-btn" type="button" data-remove-rate aria-label="Quitar la zona">${icon("trash")}</button></td>
  </tr>`;

/* ======================= Cobros ======================= */
async function renderPayments(panel) {
  const { transfer: t } = await api("admin/transfer");
  const field = (name, label, attrs = "", hint = "") => `
    <div class="field">
      <label for="tr-${name}">${label}</label>
      <input class="input" id="tr-${name}" name="${name}" value="${escapeHtml(t[name] ?? "")}" ${attrs}>
      ${hint ? `<p class="hint">${hint}</p>` : ""}
    </div>`;
  panel.innerHTML = `
    <form class="admin-form" data-transfer-form novalidate>
      <h2 class="h3">Pago por transferencia</h2>
      <p class="muted">La clienta elige «Transferencia» al finalizar la compra, ve el total con el descuento y estos datos (en la página del pedido y en el mail), y te manda el comprobante. El pedido queda «Esperando el pago» hasta que vos lo pases a «Pagado» en Pedidos. No paga comisión de Mercado Pago.</p>
      <label class="check">
        <input type="checkbox" name="enabled" ${t.enabled ? "checked" : ""}>
        <span>Ofrecer pago por transferencia</span>
      </label>
      ${field("percent", "Descuento por pagar con transferencia (%)", `type="number" min="0" max="${MAX_TRANSFER_PERCENT}" step="1" inputmode="numeric"`, "Se descuenta de las prendas, no del envío. Con 0 se ofrece sin descuento.")}
      <label class="check">
        <input type="checkbox" name="stacksWithCoupons" ${t.stacksWithCoupons ? "checked" : ""}>
        <span>Se suma con los códigos de descuento</span>
      </label>
      <p class="hint">Prendido: el descuento por transferencia se calcula sobre el precio ya con el código. Apagado: si la clienta usa un código, la transferencia va sin descuento.</p>
      ${field("expiresHours", "Plazo para transferir (horas)", `type="number" min="0" max="${MAX_EXPIRES_HOURS}" step="1" inputmode="numeric"`, "Pasado este plazo sin pago, el pedido se cancela solo y a la clienta le llega un mail. Con 0 no vence. Si la plata llega tarde, igual lo podés pasar a «Pagado».")}
      ${field("alias", "Alias", 'maxlength="20" autocomplete="off" spellcheck="false"')}
      ${field("cbu", "CBU o CVU", 'maxlength="26" inputmode="numeric" autocomplete="off"', "22 números. Alcanza con el alias o con el CBU/CVU; si cargás los dos, se muestran los dos.")}
      ${field("holder", "Titular de la cuenta", 'maxlength="80"', "Como aparece cuando transfieren, para que la clienta confirme que es tu cuenta.")}
      ${field("cuit", "CUIT o CUIL (opcional)", 'maxlength="13" inputmode="numeric"')}
      ${field("bank", "Banco o billetera (opcional)", 'maxlength="60"', "Por ejemplo: Banco Nación, Mercado Pago, Ualá.")}
      <div class="notice notice--danger form-errors" role="alert" data-transfer-errors></div>
      <div class="admin-form__actions"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>`;
  const form = $("[data-transfer-form]", panel);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const el = form.elements;
    const transfer = {
      enabled: el.enabled.checked,
      percent: Number(el.percent.value || 0),
      stacksWithCoupons: el.stacksWithCoupons.checked,
      expiresHours: el.expiresHours.value === "" ? "" : Number(el.expiresHours.value),
      alias: el.alias.value,
      cbu: el.cbu.value,
      holder: el.holder.value,
      cuit: el.cuit.value,
      bank: el.bank.value,
    };
    $("[data-transfer-errors]", form).textContent = "";
    try {
      const { transfer: saved } = await api("admin/transfer", { method: "PUT", body: { transfer } });
      toast(saved.enabled ? `Guardado. La tienda ofrece transferencia con ${saved.percent}% off en menos de un minuto.` : "Guardado. La transferencia no se ofrece.", "success");
      renderPayments(panel);
    } catch (err) {
      $("[data-transfer-errors]", form).textContent = err instanceof ApiError ? err.message : "No se pudo guardar.";
    }
  });
}
