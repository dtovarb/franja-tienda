import { initPage, icon, toast, confirmDialog } from "../core/ui.js";
import { getCart, setQty, removeItem, priceItem, cartTotals, onCartChange } from "../core/cart.js";
import { getProduct, getColor } from "../data/catalog.js";
import { faceLabel } from "../data/garments.js";
import { getDesign, deleteDesign, collectAssetIds } from "../core/designs.js";
import { formatPrice, escapeHtml, params } from "../core/format.js";
import { storageAvailable, readJSON, writeJSON } from "../core/storage.js";
import { createDemoOrder } from "../core/orders.js";
import { SERVER, CATALOG, api } from "../core/api.js";
import { savedCouponCode, rememberCoupon, forgetCoupon, checkCoupon, cartCouponDiscount } from "../core/coupon-state.js";

initPage("cart");

const root = document.querySelector("[data-cart-root]");
const added = params().get("added");
/** Código de descuento aplicado ({ code, percent }) y el último aviso del campo. */
let coupon = null;
let couponMsg = "";
let couponTyped = null; // lo último que escribió, para no borrárselo si el código no sirve
/**
 * Envío estimado en el carrito: con el código postal se muestra el más barato
 * y se suma al total. El código queda guardado para el formulario de datos.
 */
const FORM_KEY = "checkout.datos.v1"; // el mismo del formulario de datos
let ship = { cp: readJSON(FORM_KEY, {}).postalCode || "", quote: null, msg: "", busy: false };
const shipCost = () => (ship.quote ? Math.min(...ship.quote.options.map((o) => o.price)) : 0);

function render() {
  const { items } = getCart();
  if (!items.length) {
    root.innerHTML = `
      <div class="empty">
        <p class="h3">Tu carrito está vacío</p>
        <p class="muted">Diseñá una prenda y agregala desde «Finalizar diseño».</p>
        <a class="btn btn--primary" href="catalogo.html?diseñar=1">Empezar a diseñar ${icon("arrowRight")}</a>
      </div>`;
    return;
  }
  const t = cartTotals();
  const cd = coupon ? cartCouponDiscount(coupon) : { discount: 0 };
  const discount = cd.discount;
  root.innerHTML = `
    <div class="cart-layout">
      <ul class="cart-items" role="list" aria-label="Artículos">
        ${items.map(itemRow).join("")}
      </ul>
      <aside class="summary-box" aria-label="Resumen del carrito">
        <h2 class="h3">Resumen</h2>
        <div class="row"><span>Prendas</span><span>${t.count}</span></div>
        <div class="row"><span>Subtotal</span><span>${formatPrice(t.subtotal)}</span></div>
        ${
          coupon
            ? cd.missing
              ? `<div class="coupon-pending"><p>${escapeHtml(cd.missing)}</p><button class="link-btn" type="button" data-coupon-remove>Quitar código</button></div>`
              : `<div class="row row--discount"><span>Descuento ${coupon.percent}% · ${escapeHtml(coupon.code)}<br><button class="link-btn" type="button" data-coupon-remove>Quitar</button></span><span>−${formatPrice(discount)}</span></div>`
            : `<form class="coupon-form" data-coupon-form novalidate>
                <label for="coupon-code">¿Tenés un código de descuento?</label>
                <div class="coupon-form__row">
                  <input class="input" id="coupon-code" name="code" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${escapeHtml(couponTyped ?? savedCouponCode())}">
                  <button class="btn" type="submit">Aplicar</button>
                </div>
                ${couponMsg ? `<p class="hint coupon-form__error" role="alert">${escapeHtml(couponMsg)}</p>` : ""}
              </form>`
        }
        ${shippingRow()}
        <div class="row row--total"><span>Total${ship.quote ? `<br><small class="muted">con envío</small>` : ""}</span><span class="price" style="font-size:1.5rem" data-total>${formatPrice(t.total - discount + shipCost())}</span></div>
        <button class="btn btn--primary btn--lg btn--block" type="button" data-checkout>${SERVER ? "Continuar con el pedido" : "Continuar (demo)"} ${icon("arrowRight")}</button>
        <div class="notice notice--info">${icon("info")}<span>${
          SERVER
            ? "El carrito se guarda en este navegador hasta que confirmás el pedido. Ahí subimos tu diseño y sus archivos a la tienda."
            : "El carrito vive en el almacenamiento local de este navegador: no se sincroniza entre dispositivos y se pierde si borrás los datos del sitio. No se procesan pagos."
        }</span></div>
      </aside>
    </div>`;
  if (added) {
    const el = root.querySelector(`[data-item="${CSS.escape(added)}"]`);
    el?.style.setProperty("box-shadow", "inset 6px 0 0 var(--c-orange)");
  }
}

function shippingRow() {
  if (CATALOG?.freeShipping) return `<div class="row muted"><span>Envío</span><span>Gratis a todo el país (promo)</span></div>`;
  if (!SERVER) return `<div class="row muted"><span>Envío</span><span>Se calcula con tu código postal</span></div>`;
  if (ship.quote) {
    const cost = shipCost();
    return `<div class="row"><span>Envío a ${escapeHtml(ship.quote.postalCode)}<br><button class="link-btn" type="button" data-ship-change>Cambiar</button></span><span>${cost ? formatPrice(cost) : "Gratis"}</span></div>`;
  }
  return `<form class="coupon-form ship-form" data-ship-form novalidate>
      <label for="ship-cp">Calculá el envío</label>
      <div class="coupon-form__row">
        <input class="input" id="ship-cp" name="cp" inputmode="numeric" autocomplete="postal-code" maxlength="10" placeholder="Código postal" value="${escapeHtml(ship.cp)}">
        <button class="btn" type="submit" ${ship.busy ? "disabled" : ""}>${ship.busy ? "…" : "Calcular"}</button>
      </div>
      ${ship.msg ? `<p class="hint coupon-form__error" role="alert">${escapeHtml(ship.msg)}</p>` : `<p class="hint" style="margin:0">Te llega en 5 a 7 días hábiles, con el envío incluido en ese plazo.</p>`}
    </form>`;
}

async function quoteShipping(cp, { quiet = false } = {}) {
  ship.cp = String(cp || "").trim();
  if (ship.cp.replace(/\D/g, "").length < 4) {
    ship = { ...ship, quote: null, msg: quiet ? "" : "Escribí los 4 números de tu código postal, por ejemplo 5000." };
    return render();
  }
  ship.busy = true;
  render();
  try {
    const items = getCart().items.map((i) => ({ productId: i.productId, qty: i.qty }));
    ship.quote = await api("shipping/quote", { method: "POST", body: { postalCode: ship.cp, items } });
    ship.msg = "";
    writeJSON(FORM_KEY, { ...readJSON(FORM_KEY, {}), postalCode: ship.cp });
  } catch (err) {
    ship.quote = null;
    ship.msg = quiet ? "" : err.message || "No pudimos calcular el envío.";
  }
  ship.busy = false;
  render();
}

function itemRow(item) {
  const product = getProduct(item.productId);
  const color = getColor(item.variant.colorId);
  const pr = priceItem(item);
  const design = getDesign(item.designId);
  if (!product || !pr) {
    return `<li class="cart-item" data-item="${item.id}"><div></div><div class="cart-item__info"><p class="cart-item__name">Producto no disponible</p>
      <button class="btn btn--sm" type="button" data-remove="${item.id}">${icon("trash")}Eliminar</button></div></li>`;
  }
  const editHref = design ? `editor.html?design=${encodeURIComponent(design.id)}&item=${encodeURIComponent(item.id)}` : null;
  return `
    <li class="cart-item" data-item="${item.id}">
      <img class="cart-item__thumb" src="${item.thumbnail || ""}" alt="Miniatura del diseño en ${escapeHtml(product.name)} ${escapeHtml(color?.name || "")}">
      <div class="cart-item__info">
        <p class="cart-item__name">${escapeHtml(product.name)}</p>
        <p class="cart-item__variant">
          <span><span class="swatch swatch--sm" style="--sw:${color?.hex};display:inline-block;vertical-align:-3px"></span> ${escapeHtml(color?.name || "")}</span>
          <span>Talle ${escapeHtml(item.variant.sizeId)}</span>
          <span>Estampa: ${(item.printedFaces || []).map(faceLabel).join(" + ") || "—"}</span>
        </p>
        <p class="hint">${formatPrice(pr.unit)} c/u · ${pr.lines.map((l) => `${l.label} ${formatPrice(l.amount)}`).join(" · ")}</p>
        <div class="cart-item__actions">
          <div class="qty" aria-label="Cantidad">
            <button type="button" data-qty="${item.id}" data-d="-1" aria-label="Restar una unidad" ${item.qty <= 1 ? "disabled" : ""}>−</button>
            <input type="number" min="1" max="50" value="${item.qty}" inputmode="numeric" data-qty-input="${item.id}" aria-label="Cantidad de ${escapeHtml(product.name)}">
            <button type="button" data-qty="${item.id}" data-d="1" aria-label="Sumar una unidad" ${item.qty >= 50 ? "disabled" : ""}>+</button>
          </div>
          ${editHref ? `<a class="btn btn--sm" href="${editHref}">${icon("edit")}Editar diseño</a>` : `<span class="hint">El diseño ya no está en este navegador.</span>`}
          <button class="btn btn--sm btn--ghost" type="button" data-remove="${item.id}">${icon("trash")}Eliminar</button>
        </div>
      </div>
      <div class="cart-item__price"><span class="price" style="font-size:1.25rem">${formatPrice(pr.total)}</span><span class="hint">${item.qty} × ${formatPrice(pr.unit)}</span></div>
    </li>`;
}

async function applyCoupon(code, { quiet = false } = {}) {
  const r = await checkCoupon(code);
  coupon = r.coupon || null;
  couponMsg = r.error && !quiet ? r.error : "";
  if (coupon) rememberCoupon(coupon.code);
  else if (!quiet) forgetCoupon();
  render();
  if (coupon && !quiet) {
    const { missing } = cartCouponDiscount(coupon);
    toast(missing ? `Código ${coupon.code} guardado. ${missing}` : `Código ${coupon.code} aplicado: ${coupon.percent}% off.`, missing ? "info" : "success", missing ? 6000 : 3800);
  }
}

root.addEventListener("submit", (e) => {
  const sf = e.target.closest("[data-ship-form]");
  if (sf) {
    e.preventDefault();
    quoteShipping(sf.cp.value);
    return;
  }
  const f = e.target.closest("[data-coupon-form]");
  if (!f) return;
  e.preventDefault();
  f.querySelector("[type=submit]").disabled = true;
  couponTyped = f.code.value;
  applyCoupon(f.code.value);
});

root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-ship-change]")) {
    ship = { ...ship, quote: null, msg: "" };
    render();
    root.querySelector("#ship-cp")?.focus();
    return;
  }
  if (e.target.closest("[data-coupon-remove]")) {
    coupon = null;
    couponMsg = "";
    forgetCoupon();
    render();
    return;
  }
  const q = e.target.closest("[data-qty]");
  if (q && !q.disabled) {
    const it = getCart().items.find((i) => i.id === q.dataset.qty);
    setQty(it.id, it.qty + Number(q.dataset.d));
  }
  const r = e.target.closest("[data-remove]");
  if (r) {
    const ok = await confirmDialog({ title: "¿Eliminar este artículo?", body: "Se quita del carrito junto con su diseño guardado en este navegador.", confirmLabel: "Eliminar", danger: true });
    if (ok) {
      const it = getCart().items.find((i) => i.id === r.dataset.remove);
      removeItem(r.dataset.remove);
      if (it?.designId) cleanupDesign(it.designId);
      toast("Artículo eliminado.", "info");
    }
  }
  if (e.target.closest("[data-checkout]")) {
    if (SERVER) {
      const { renderCheckout } = await import("./checkout.js");
      document.querySelector("[data-cart-title]").textContent = "Datos del pedido";
      renderCheckout(root, {
        // Si todavía no cumple la condición del código, el pedido va sin código.
        coupon: coupon && !cartCouponDiscount(coupon).missing ? coupon : null,
        onBack: () => {
          document.querySelector("[data-cart-title]").textContent = "Tu carrito";
          render();
        },
      });
      window.scrollTo({ top: 0 });
    } else showDemoCheckout();
  }
});
root.addEventListener("change", (e) => {
  const inp = e.target.closest("[data-qty-input]");
  if (inp) setQty(inp.dataset.qtyInput, parseInt(inp.value, 10));
});

function cleanupDesign(designId) {
  // Los originales en IndexedDB se conservan: otros diseños pueden usarlos.
  const d = getDesign(designId);
  if (d) deleteDesign(designId);
  return d ? collectAssetIds(d) : [];
}

/** Confirmación de DEMOSTRACIÓN: muestra lo que se enviaría al backend. */
function showDemoCheckout() {
  const { items } = getCart();
  const t = cartTotals();
  const discount = coupon ? cartCouponDiscount(coupon).discount : 0;
  const payload = {
    endpoint: "POST /api/orders (no existe todavía)",
    currency: "ARS",
    items: items.map((i) => {
      const d = getDesign(i.designId);
      return {
        productId: i.productId,
        variant: { colorId: i.variant.colorId, sizeId: i.variant.sizeId },
        qty: i.qty,
        designId: i.designId,
        printedFaces: i.printedFaces,
        storeDesignIds: i.storeDesignIds || [],
        originalAssetIds: d ? collectAssetIds(d) : i.assetIds || [],
        clientUnitPrice: priceItem(i)?.unit,
      };
    }),
    couponCode: discount ? coupon.code : null,
    clientTotal: t.total - discount,
    note: "El backend debe recalcular precios y validar stock; el total del cliente es solo informativo.",
  };
  const order = createDemoOrder({
    items: items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      variant: i.variant,
      qty: i.qty,
      printedFaces: i.printedFaces || [],
      storeDesignIds: i.storeDesignIds || [],
      designId: i.designId,
      thumbnail: i.thumbnail,
      unit: priceItem(i)?.unit || 0,
    })),
    total: t.total - discount,
  });
  document.querySelector("[data-cart-title]").textContent = "Confirmación (demo)";
  root.innerHTML = `
    <section class="confirm-panel" aria-labelledby="demo-title">
      <span class="tag tag--orange" style="justify-self:start">Demostración</span>
      <h2 id="demo-title" class="h3">Llegaste al final del flujo de prueba</h2>
      <p><b>No se creó ningún pedido real, no se cobró nada y no se envió información a ningún servidor.</b> Este prototipo todavía no tiene backend ni pagos.</p>
      <p>Lo guardamos como <b>pedido de prueba n.º ${order.number}</b> en este navegador, para que lo veas en el <a href="admin.html#pedidos">panel de la tienda</a>.</p>
      <p class="muted">Así quedaría el pedido que la tienda real enviaría a su API (${items.length} artículo${items.length === 1 ? "" : "s"}, ${formatPrice(t.total)}):</p>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      <p class="muted">Tu carrito sigue guardado en este navegador.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn--primary" href="carrito.html">${icon("back")}Volver al carrito</a>
        <a class="btn" href="catalogo.html">Seguir diseñando</a>
      </div>
    </section>`;
  root.querySelector("h2").focus?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (!storageAvailable()) {
  root.innerHTML = `<div class="notice notice--danger">${icon("alert")}<span>Este navegador bloquea el almacenamiento local (¿modo privado estricto?). El carrito no puede funcionar.</span></div>`;
} else {
  render();
  // Si cambian las cantidades, el paquete cambia: se vuelve a cotizar.
  onCartChange(() => (ship.quote && getCart().items.length ? quoteShipping(ship.cp, { quiet: true }) : render()));
  if (SERVER && ship.cp && !CATALOG?.freeShipping && getCart().items.length) quoteShipping(ship.cp, { quiet: true });
  // El código que quedó guardado (o que trajo la ventana de oferta) se vuelve a revisar.
  if (savedCouponCode() && getCart().items.length) applyCoupon(savedCouponCode(), { quiet: true });
  if (added) toast("Prenda agregada al carrito.", "success");
}
