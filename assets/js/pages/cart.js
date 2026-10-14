import { initPage, icon, toast, confirmDialog } from "../core/ui.js";
import { getCart, setQty, removeItem, priceItem, cartTotals, onCartChange } from "../core/cart.js";
import { getProduct, getColor } from "../data/catalog.js";
import { faceLabel } from "../data/garments.js";
import { getDesign, deleteDesign, collectAssetIds } from "../core/designs.js";
import { formatPrice, escapeHtml, params } from "../core/format.js";
import { storageAvailable } from "../core/storage.js";
import { createDemoOrder } from "../core/orders.js";
import { SERVER } from "../core/api.js";

initPage("cart");

const root = document.querySelector("[data-cart-root]");
const added = params().get("added");

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
  root.innerHTML = `
    <div class="cart-layout">
      <ul class="cart-items" role="list" aria-label="Artículos">
        ${items.map(itemRow).join("")}
      </ul>
      <aside class="summary-box" aria-label="Resumen del carrito">
        <h2 class="h3">Resumen</h2>
        <div class="row"><span>Prendas</span><span>${t.count}</span></div>
        <div class="row"><span>Subtotal</span><span>${formatPrice(t.subtotal)}</span></div>
        <div class="row muted"><span>Envío</span><span>Según código postal · gratis en el centro de Córdoba Capital</span></div>
        <div class="row row--total"><span>Total</span><span class="price" style="font-size:1.5rem" data-total>${formatPrice(t.total)}</span></div>
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

root.addEventListener("click", async (e) => {
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
    clientTotal: t.total,
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
    total: t.total,
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
  onCartChange(render);
  if (added) toast("Prenda agregada al carrito.", "success");
}
