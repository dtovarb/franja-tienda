/**
 * Checkout REAL (solo con servidor; ver core/api.js).
 *
 * 1. Datos de la clienta y dirección; el envío se cotiza por código postal.
 * 2. Para cada prenda se preparan sus archivos en el navegador: originales
 *    (tal cual se subieron), vista previa y archivo de impresión a 300 DPI
 *    por cara. Se suben directo al almacenamiento privado con URLs firmadas.
 * 3. El servidor recalcula todo, verifica los archivos y crea el pedido.
 * 4. Si el cobro está activo, la clienta paga en Mercado Pago y vuelve a
 *    pedido.html; si no, queda registrado y la tienda coordina el pago.
 */
import { icon, toast } from "../core/ui.js";
import { SERVER, api, putToTarget, ApiError } from "../core/api.js";
import { getCart, clearCart, cartTotals } from "../core/cart.js";
import { getDesign, deleteDesign, collectAssetIds } from "../core/designs.js";
import { getAssets, sha256Hex } from "../core/asset-store.js";
import { getProduct, getColor } from "../data/catalog.js";
import { formatPrice, escapeHtml, debounce } from "../core/format.js";
import { readJSON, writeJSON } from "../core/storage.js";

export const PROVINCES = [
  "Córdoba", "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Corrientes", "Entre Ríos", "Formosa",
  "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];
const FORM_KEY = "checkout.datos.v1";
const MINE_KEY = "pedidos.mios.v1";

let quote = null;
let optionId = null;
const chosenOption = () => quote?.options.find((o) => o.id === optionId) || null;

export function renderCheckout(root, { onBack }) {
  const saved = readJSON(FORM_KEY, {});
  const t = cartTotals();
  const pays = !!SERVER?.services?.payments;
  const field = (name, label, attrs = "", hint = "") => `
    <div class="field">
      <label for="co-${name}">${label}</label>
      <input class="input" id="co-${name}" name="${name}" value="${escapeHtml(saved[name] || "")}" ${attrs}>
      ${hint ? `<p class="hint">${hint}</p>` : ""}
    </div>`;
  root.innerHTML = `
    <form class="checkout" data-checkout-form novalidate>
      <div class="checkout__main">
        <fieldset class="checkout__group">
          <legend class="h3">Tus datos</legend>
          ${field("name", "Nombre y apellido", 'autocomplete="name" maxlength="80" required')}
          ${field("email", "Mail", 'type="email" autocomplete="email" maxlength="254" required', "Te escribimos acá por el pedido.")}
          ${field("phone", "Teléfono", 'type="tel" autocomplete="tel" maxlength="30" required')}
        </fieldset>
        <fieldset class="checkout__group">
          <legend class="h3">Envío</legend>
          <p class="hint">Enviamos a todo el país por Andreani o Correo Argentino. No hay retiro: en el centro de Córdoba Capital el envío es gratis.</p>
          ${field("postalCode", "Código postal", 'autocomplete="postal-code" inputmode="numeric" maxlength="10" required', "4 números, por ejemplo 5000.")}
          <div class="checkout__quote" data-quote aria-live="polite"></div>
          <div class="checkout__row">
            ${field("street", "Calle", 'autocomplete="address-line1" maxlength="120" required')}
            ${field("number", "Altura", 'inputmode="numeric" maxlength="12" required')}
          </div>
          ${field("apartment", "Piso y departamento (opcional)", 'maxlength="30"')}
          <div class="checkout__row">
            ${field("city", "Localidad", 'autocomplete="address-level2" maxlength="80" required')}
            <div class="field">
              <label for="co-province">Provincia</label>
              <select class="input" id="co-province" name="province" autocomplete="address-level1" required>
                ${PROVINCES.map((p) => `<option ${p === (saved.province || "Córdoba") ? "selected" : ""}>${p}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="co-notes">Indicaciones para la entrega (opcional)</label>
            <textarea class="input" id="co-notes" name="notes" rows="2" maxlength="300">${escapeHtml(saved.notes || "")}</textarea>
          </div>
        </fieldset>
      </div>
      <aside class="summary-box" aria-label="Resumen del pedido">
        <h2 class="h3">Tu pedido</h2>
        <div class="row"><span>Prendas</span><span>${t.count}</span></div>
        <div class="row"><span>Subtotal</span><span>${formatPrice(t.subtotal)}</span></div>
        <div class="row"><span>Envío</span><span data-ship>Ingresá tu código postal</span></div>
        <div class="row row--total"><span>Total</span><span class="price" style="font-size:1.5rem" data-total>${formatPrice(t.subtotal)}</span></div>
        <div class="notice notice--danger form-errors" role="alert" data-co-errors></div>
        <p class="checkout__progress" data-progress aria-live="polite" hidden></p>
        <button class="btn btn--primary btn--lg btn--block" type="submit" data-co-submit>
          ${pays ? "Pagar con Mercado Pago" : "Confirmar pedido"} ${icon("arrowRight")}
        </button>
        <button class="btn btn--ghost btn--block" type="button" data-co-back>${icon("back")}Volver al carrito</button>
        <p class="hint">${
          pays
            ? "Pagás en Mercado Pago con débito, crédito o transferencia. El plazo de 5 a 7 días hábiles, con el envío incluido, corre desde que se acredita el pago."
            : "El cobro online todavía no está activo: registramos tu pedido y te escribimos para coordinar el pago."
        } Podés cancelarlo mientras no haya pasado a producción.</p>
      </aside>
    </form>`;

  const form = root.querySelector("[data-checkout-form]");
  form.querySelector("[data-co-back]").addEventListener("click", onBack);
  const cp = form.postalCode;
  const updateQuote = debounce(async () => {
    const out = form.querySelector("[data-quote]");
    const value = cp.value.trim();
    quote = null;
    optionId = null;
    paintTotals(form);
    if (value.replace(/\D/g, "").length < 4) {
      out.textContent = "";
      return;
    }
    try {
      out.innerHTML = `<p class="hint">Calculando el envío…</p>`;
      const items = getCart().items.map((i) => ({ productId: i.productId, qty: i.qty }));
      quote = await api("shipping/quote", { method: "POST", body: { postalCode: value, items } });
      optionId = quote.options[0]?.id || null; // la más barata
      out.innerHTML = shippingOptions(quote);
    } catch (err) {
      out.textContent = err.message;
    }
    paintTotals(form);
  }, 350);
  form.querySelector("[data-quote]").addEventListener("change", (e) => {
    if (e.target.name !== "shippingOption") return;
    optionId = e.target.value;
    paintTotals(form);
  });
  cp.addEventListener("input", updateQuote);
  if (cp.value) updateQuote();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(form);
  });
  // Los avisos se van apenas se corrige algo.
  form.addEventListener("input", () => {
    const errEl = form.querySelector("[data-co-errors]");
    if (errEl.textContent && !form.querySelector("[data-co-submit]").disabled) errEl.textContent = "";
  });
  form.elements.namedItem("name").focus();
}

function paintTotals(form) {
  const t = cartTotals();
  const o = chosenOption();
  form.querySelector("[data-ship]").textContent = o ? (o.price ? formatPrice(o.price) : "Gratis") : "Ingresá tu código postal";
  form.querySelector("[data-total]").textContent = formatPrice(t.subtotal + (o?.price || 0));
}

function readForm(form) {
  const v = Object.fromEntries(new FormData(form).entries());
  Object.keys(v).forEach((k) => (v[k] = String(v[k]).trim()));
  const errors = [];
  if (v.name.length < 2) errors.push("Escribí tu nombre y apellido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.push("Revisá tu mail.");
  if (!/^[\d\s+()-]{6,30}$/.test(v.phone)) errors.push("Revisá tu teléfono (solo números, espacios, + y guiones).");
  if (!v.street || !v.number || !v.city) errors.push("Completá calle, altura y localidad.");
  if (!quote) errors.push("Escribí un código postal válido para calcular el envío.");
  else if (!chosenOption()) errors.push("Elegí cómo te mandamos el pedido.");
  return { v, errors };
}

const progress = (form, text) => {
  const p = form.querySelector("[data-progress]");
  p.hidden = !text;
  p.textContent = text || "";
};

let fabricReady = null;
function loadFabric() {
  if (window.fabric) return Promise.resolve();
  fabricReady ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/fabric/fabric.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar el generador de archivos."));
    document.head.append(s);
  });
  return fabricReady;
}

/** Arma, para un artículo del carrito, el diseño y sus archivos (Blob + metadatos). */
async function prepareItem(item, render) {
  const product = getProduct(item.productId);
  const design = getDesign(item.designId);
  if (!product) throw new Error("Una prenda del carrito ya no está en el catálogo. Eliminala para seguir.");
  if (!design) throw new Error(`El diseño de ${product.name} ya no está en este navegador. Volvé a diseñarlo.`);
  const faces = (item.printedFaces || []).filter((f) => design.faces?.[f]?.objects?.length);
  if (!faces.length) throw new Error(`El diseño de ${product.name} está vacío.`);
  const objectsOf = (f) => design.faces[f].objects;

  const families = new Set(faces.flatMap((f) => objectsOf(f).filter((o) => o.fontFamily).map((o) => `${o.fontWeight === "bold" ? 700 : 400} 40px "${o.fontFamily}"`)));
  await Promise.all([...families].map((f) => document.fonts.load(f).catch(() => {})));

  const files = [];
  const blobs = new Map();
  const add = async (blob, meta) => {
    const sha256 = await sha256Hex(blob);
    blobs.set(sha256, blob);
    files.push({ ...meta, sha256, mime: meta.mime || blob.type, bytes: blob.size });
  };
  const ids = collectAssetIds({ faces: Object.fromEntries(faces.map((f) => [f, design.faces[f]])) });
  const originals = await getAssets(ids);
  if (originals.length !== ids.length) throw new Error(`Falta un archivo original del diseño de ${product.name} en este navegador. Volvé a subirlo desde el editor.`);
  for (const a of originals) await add(a.blob, { role: "original", name: a.name, mime: a.type });

  const color = getColor(item.variant.colorId);
  for (const f of faces) {
    const preview = await render.renderPreview({ productType: product.type, colorHex: color.hex, colorId: color.id, face: f, objects: objectsOf(f) });
    await add(preview, { role: "preview", face: f, mime: "image/png" });
    const print = await render.renderPrintFile({ productType: product.type, face: f, sizeId: item.variant.sizeId, objects: objectsOf(f), dpi: 300, mode: "area" });
    await add(print.blob, { role: "print", face: f, mime: "image/png", dpi: 300 });
  }
  return {
    payload: {
      productId: item.productId,
      colorId: item.variant.colorId,
      sizeId: item.variant.sizeId,
      qty: item.qty,
      design: { schema: design.schema, faces: Object.fromEntries(faces.map((f) => [f, objectsOf(f)])) },
      files,
    },
    blobs,
  };
}

async function submit(form) {
  const errEl = form.querySelector("[data-co-errors]");
  const btn = form.querySelector("[data-co-submit]");
  const { v, errors } = readForm(form);
  errEl.innerHTML = errors.map(escapeHtml).join("<br>");
  if (errors.length) return;
  try {
    writeJSON(FORM_KEY, v);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>Preparando…`;
  try {
    const { items } = getCart();
    progress(form, "Preparando los archivos de impresión…");
    await loadFabric();
    const render = await import("../editor/export.js");
    const prepared = [];
    for (const [i, item] of items.entries()) {
      progress(form, `Preparando los archivos de impresión (${i + 1} de ${items.length})…`);
      prepared.push(await prepareItem(item, render));
    }

    const unique = new Map();
    prepared.forEach((p) => p.payload.files.forEach((f) => unique.set(`${f.role}:${f.sha256}`, f)));
    const { uploads } = await api("uploads", { method: "POST", body: { files: [...unique.values()].map(({ role, sha256, mime, bytes }) => ({ role, sha256, mime, bytes })) } });
    const blobOf = (sha) => prepared.find((p) => p.blobs.has(sha)).blobs.get(sha);
    let done = 0;
    for (const u of uploads) {
      progress(form, `Subiendo archivos (${++done} de ${uploads.length})…`);
      await putToTarget(u.target, blobOf(u.sha256));
    }

    progress(form, "Creando el pedido…");
    let key = sessionStorage.getItem("nevrado.checkout.key");
    if (!key) {
      key = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem("nevrado.checkout.key", key);
    }
    const res = await api("orders", {
      method: "POST",
      body: {
        idempotencyKey: key,
        customer: { name: v.name, email: v.email, phone: v.phone },
        shipping: { optionId, street: v.street, number: v.number, apartment: v.apartment, city: v.city, province: v.province, postalCode: v.postalCode, notes: v.notes },
        items: prepared.map((p) => p.payload),
      },
    });
    sessionStorage.removeItem("nevrado.checkout.key");
    rememberOrder(res.order, res.token);
    // El carrito ya es un pedido: se vacía y se borran sus borradores de diseño.
    items.forEach((i) => i.designId && deleteDesign(i.designId));
    clearCart();
    const link = `pedido.html?id=${encodeURIComponent(res.order.id)}&t=${encodeURIComponent(res.token)}`;
    if (res.payment?.checkoutUrl) {
      progress(form, "Te llevamos a Mercado Pago…");
      location.href = res.payment.checkoutUrl;
    } else {
      location.href = `${link}&nuevo=1`;
    }
  } catch (err) {
    console.error(err);
    progress(form, "");
    errEl.textContent = err instanceof ApiError || err instanceof Error ? err.message : "No se pudo crear el pedido.";
    btn.disabled = false;
    btn.innerHTML = label;
    toast("No se pudo completar el pedido. Tu carrito sigue guardado.", "error", 6000);
  }
}

/** Los pedidos hechos desde este navegador, para volver a verlos. */
function rememberOrder(order, token) {
  try {
    const list = readJSON(MINE_KEY, []).filter((o) => o.id !== order.id);
    list.unshift({ id: order.id, number: order.number, token, createdAt: order.createdAt || new Date().toISOString() });
    writeJSON(MINE_KEY, list.slice(0, 20));
  } catch {
    /* sin almacenamiento */
  }
}

/** Opciones de envío para elegir (una sola, si es gratis o sale de la tabla). */
function shippingOptions(q) {
  if (q.options.length === 1) {
    const o = q.options[0];
    return `<p><b>${o.price ? `${escapeHtml(o.service)}: ${formatPrice(o.price)}` : `${escapeHtml(o.service)}: envío gratis`}</b>${
      o.price ? `<br><span class="hint">${escapeHtml(o.carrier)}, a domicilio.</span>` : ""
    }</p>`;
  }
  return `<fieldset class="ship-options"><legend class="sr-only">Cómo te lo mandamos</legend>${q.options
    .map(
      (o, i) => `<label class="ship-option">
        <input type="radio" name="shippingOption" value="${escapeHtml(o.id)}" ${i === 0 ? "checked" : ""}>
        <span><b>${escapeHtml(o.carrier)}</b> · ${escapeHtml(o.service)}<br><span class="hint">A domicilio</span></span>
        <span class="price">${formatPrice(o.price)}</span>
      </label>`
    )
    .join("")}</fieldset>`;
}
