/**
 * Panel de la tienda (DEMOSTRACIÓN).
 *
 * Administra diseños de la tienda, productos (precio, visibilidad, colores,
 * talles y stock) y los pedidos de prueba del checkout.
 *
 * Dos modos, con la misma interfaz:
 *   - Con servidor (core/api.js): pide login, y diseños, productos, pedidos
 *     y tarifas de envío se leen y guardan en la base (api/admin/*).
 *   - Sin servidor (demostración): sin login, todo en este navegador.
 * La diferencia está en `data` (abajo) y en la pestaña de pedidos.
 */
import { initPage, icon, toast, confirmDialog } from "../core/ui.js";
import {
  PRODUCTS, GARMENT_COLORS, getProduct, getColor, saveProducts, resetProducts, defaultSizesFor, stockLabel,
} from "../data/catalog.js";
import { GARMENTS, garmentSvg } from "../data/garments.js";
import {
  listStoreDesigns, getStoreDesign, saveStoreDesign, deleteStoreDesign, resetStoreDesigns, storeDesignImageUrl,
} from "../core/store-designs.js";
import { listOrders, setOrderStatus, clearOrders, ORDER_STATUSES } from "../core/orders.js";
import { processUpload, UploadError } from "../editor/upload.js";
import { formatPrice, escapeHtml, uid } from "../core/format.js";
import { SERVER, api, putToTarget } from "../core/api.js";
import { getAsset } from "../core/asset-store.js";

initPage("admin");

/* ======================= Datos ======================= */
const designSource = async (file) => {
  const a = await processUpload(file);
  return { asset: a, source: { kind: "asset", assetId: a.id, name: a.name, type: a.type, width: a.width, height: a.height, isVector: a.isVector } };
};

/** Demostración: todo en este navegador. */
const demoData = {
  designs: async () => listStoreDesigns(),
  async saveDesign(current, fields, file) {
    const source = file ? (await designSource(file)).source : current.source;
    return saveStoreDesign({ ...current, ...fields, source });
  },
  deleteDesign: async (id) => deleteStoreDesign(id),
  products: async () => PRODUCTS,
  async saveProduct(id, fields) {
    Object.assign(getProduct(id), fields);
    saveProducts(PRODUCTS);
    return getProduct(id);
  },
  async createProduct({ type, name, basePrice }) {
    const p = {
      id: uid("prd"),
      sku: `NEV-${type.slice(0, 3).toUpperCase()}-${String(PRODUCTS.length + 1).padStart(2, "0")}`,
      type,
      name,
      tagline: "",
      description: "",
      basePrice,
      colors: ["negro", "blanco"].filter((c) => GARMENT_COLORS[c]),
      sizes: defaultSizesFor(type),
      faces: Object.keys(GARMENTS[type].faces),
      includedFaces: 1,
      featured: false,
      active: true,
      demoArt: "sol",
      badge: "Nuevo",
    };
    PRODUCTS.push(p);
    saveProducts(PRODUCTS);
    return p;
  },
};

/** Con servidor: la base de la tienda. Los archivos de diseños van al balde público. */
const serverData = {
  designs: async () => (await api("admin/store-designs")).storeDesigns,
  async saveDesign(current, fields, file) {
    let fileMeta;
    if (file) {
      const { asset } = await designSource(file); // mismos controles que las subidas de clientas
      fileMeta = { sha256: asset.id, mime: asset.type, bytes: asset.size, name: asset.name };
      const { target } = await api("admin/uploads", { method: "POST", body: { file: fileMeta } });
      await putToTarget(target, (await getAsset(asset.id)).blob);
    }
    const body = { ...fields, file: fileMeta };
    const r = current.id
      ? await api(`admin/store-designs/${encodeURIComponent(current.id)}`, { method: "PATCH", body })
      : await api("admin/store-designs", { method: "POST", body });
    return r.storeDesign;
  },
  deleteDesign: (id) => api(`admin/store-designs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  products: async () => (await api("admin/products")).products,
  saveProduct: async (id, fields) => (await api(`admin/products/${encodeURIComponent(id)}`, { method: "PATCH", body: fields })).product,
  createProduct: async (fields) => (await api("admin/products", { method: "POST", body: fields })).product,
};

const data = SERVER ? serverData : demoData;
const state = { designs: [], products: [] };
const findDesign = (id) => state.designs.find((d) => d.id === id);
const findProduct = (id) => state.products.find((p) => p.id === id);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABS = SERVER ? ["disenos", "productos", "pedidos", "envios"] : ["disenos", "productos", "pedidos"];

/* ======================= Pestañas ======================= */
function selectTab(name, { focus = false } = {}) {
  if (!TABS.includes(name)) name = TABS[0];
  $$("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}
$(".admin-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (b) selectTab(b.dataset.tab);
});
$(".admin-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
  const i = TABS.indexOf($("[data-tab][aria-selected=true]").dataset.tab);
  selectTab(TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length], { focus: true });
});

function updateCounts() {
  $('[data-count="disenos"]').textContent = state.designs.length;
  $('[data-count="productos"]').textContent = state.products.length;
  if (!SERVER) $('[data-count="pedidos"]').textContent = listOrders().length;
}

const productNames = (ids) => (ids?.length ? ids.map((id) => findProduct(id)?.name || getProduct(id)?.name || id).join(", ") : "Todas las prendas");
const errText = (err, fallback) => (err instanceof UploadError ? err.message : err?.message || fallback);

/* ======================= Diseños ======================= */
const designsPanel = $("[data-panel=disenos]");
let editingDesign = null; // null = cerrado, {} = nuevo, {…} = editando

async function renderDesigns() {
  const list = (state.designs = await data.designs());
  const urls = await Promise.all(list.map(storeDesignImageUrl));
  designsPanel.innerHTML = `
    <div class="admin-head">
      <div>
        <h2 class="h3">Diseños de la tienda</h2>
        <p class="muted">Los publicados aparecen en <a href="disenos.html">Diseños</a> y en el editor. Los borradores solo se ven acá.</p>
      </div>
      <button class="btn btn--primary" type="button" data-new-design>${icon("plus")}Nuevo diseño</button>
    </div>
    <div data-design-form-host></div>
    ${
      list.length
        ? `<ul class="admin-list" role="list">${list
            .map(
              (d, i) => `
          <li class="admin-row" data-design-row="${d.id}">
            <img class="admin-thumb" src="${urls[i] || ""}" alt="">
            <div class="admin-row__main">
              <p><b>${escapeHtml(d.name)}</b> <span class="tag ${d.status === "published" ? "tag--magenta" : "tag--demo"}">${d.status === "published" ? "Publicado" : "Borrador"}</span></p>
              <p class="hint">${d.price ? formatPrice(d.price) : "Sin costo"} por prenda · ${escapeHtml(productNames(d.productIds))}</p>
            </div>
            <div class="admin-row__actions">
              <button class="btn btn--sm" type="button" data-edit-design="${d.id}">${icon("edit")}Editar</button>
              <button class="btn btn--sm" type="button" data-toggle-design="${d.id}">${icon("eye")}${d.status === "published" ? "Ocultar" : "Publicar"}</button>
              <button class="btn btn--sm btn--ghost" type="button" data-delete-design="${d.id}">${icon("trash")}Eliminar</button>
            </div>
          </li>`
            )
            .join("")}</ul>`
        : `<div class="empty"><p class="h3">No hay diseños cargados.</p><p class="muted">Subí el primero con «Nuevo diseño».</p></div>`
    }`;
  if (editingDesign) renderDesignForm();
  updateCounts();
}

function renderDesignForm() {
  const d = editingDesign;
  const isNew = !d.id;
  const host = $("[data-design-form-host]", designsPanel);
  const sel = new Set(d.productIds || []);
  const all = !sel.size;
  host.innerHTML = `
    <form class="admin-form" data-design-form novalidate>
      <h3 class="h3">${isNew ? "Nuevo diseño" : `Editar «${escapeHtml(d.name)}»`}</h3>
      <div class="admin-grid">
        <div class="field">
          <label for="d-name">Nombre</label>
          <input class="input" id="d-name" name="name" maxlength="60" required value="${escapeHtml(d.name || "")}">
        </div>
        <div class="field">
          <label for="d-price">Precio del diseño por prenda (ARS)</label>
          <input class="input" id="d-price" name="price" type="number" min="0" step="100" inputmode="numeric" value="${d.price ?? 3000}">
          <p class="hint">Se suma al precio de la prenda. 0 = sin costo.</p>
        </div>
        <div class="field admin-grid__wide">
          <label for="d-desc">Descripción</label>
          <textarea class="input" id="d-desc" name="description" maxlength="200" rows="2">${escapeHtml(d.description || "")}</textarea>
        </div>
        <div class="field">
          <label for="d-file">Archivo ${isNew ? "" : "(opcional: reemplaza el actual)"}</label>
          <input class="input" id="d-file" name="file" type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" ${isNew ? "required" : ""}>
          <p class="hint">JPG, PNG o SVG, mismo control que las subidas de clientas. Se guarda el original sin cambios.</p>
        </div>
        <div class="field">
          <label for="d-status">Estado</label>
          <select class="input" id="d-status" name="status">
            <option value="published" ${d.status !== "draft" ? "selected" : ""}>Publicado</option>
            <option value="draft" ${d.status === "draft" ? "selected" : ""}>Borrador (no se ve en la tienda)</option>
          </select>
        </div>
        <fieldset class="field admin-grid__wide">
          <legend>Prendas donde se puede usar</legend>
          <label class="check"><input type="checkbox" name="allProducts" ${all ? "checked" : ""}> Todas las prendas</label>
          <div class="admin-checks" data-product-checks ${all ? "hidden" : ""}>
            ${state.products.map((p) => `<label class="check"><input type="checkbox" name="productIds" value="${p.id}" ${sel.has(p.id) ? "checked" : ""}> ${escapeHtml(p.name)}</label>`).join("")}
          </div>
        </fieldset>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-design-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">${isNew ? "Guardar diseño" : "Guardar cambios"}</button>
        <button class="btn btn--ghost" type="button" data-cancel-design>Cancelar</button>
      </div>
    </form>`;
  const form = $("[data-design-form]", host);
  form.allProducts.addEventListener("change", () => ($("[data-product-checks]", form).hidden = form.allProducts.checked));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitDesign(form);
  });
  $("[data-cancel-design]", form).addEventListener("click", () => {
    editingDesign = null;
    host.innerHTML = "";
  });
  form.name.focus();
}

async function submitDesign(form) {
  const errEl = $("[data-design-errors]", form);
  const errors = [];
  const name = form.name.value.trim();
  const price = Number(form.price.value);
  const file = form.file.files[0];
  const productIds = form.allProducts.checked ? [] : $$("[name=productIds]:checked", form).map((c) => c.value);
  if (!name) errors.push("Poné un nombre.");
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) errors.push("El precio tiene que ser un número entero, 0 o más.");
  if (!editingDesign.id && !file) errors.push("Elegí el archivo del diseño.");
  if (!form.allProducts.checked && !productIds.length) errors.push("Elegí al menos una prenda, o marcá «Todas las prendas».");
  if (errors.length) {
    errEl.innerHTML = errors.map(escapeHtml).join("<br>");
    return;
  }
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const saved = await data.saveDesign(
      editingDesign,
      { name, description: form.description.value.trim(), price, status: form.status.value, productIds },
      file
    );
    editingDesign = null;
    toast(`Diseño «${saved.name}» guardado${SERVER ? "" : " en este navegador"}.`, "success");
    renderDesigns();
  } catch (err) {
    errEl.textContent = errText(err, "No se pudo guardar el diseño.");
    btn.disabled = false;
  }
}

designsPanel.addEventListener("click", async (e) => {
  if (e.target.closest("[data-new-design]")) {
    editingDesign = { status: "published", productIds: [], price: 3000 };
    renderDesignForm();
    return;
  }
  const edit = e.target.closest("[data-edit-design]");
  if (edit) {
    editingDesign = structuredClone(findDesign(edit.dataset.editDesign));
    renderDesignForm();
    $("[data-design-form]").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const tog = e.target.closest("[data-toggle-design]");
  if (tog) {
    const d = findDesign(tog.dataset.toggleDesign);
    try {
      await data.saveDesign(d, { name: d.name, description: d.description, price: d.price, productIds: d.productIds, status: d.status === "published" ? "draft" : "published" });
      toast(d.status === "published" ? `«${d.name}» ya no se ve en la tienda.` : `«${d.name}» publicado.`, "info");
    } catch (err) {
      toast(errText(err, "No se pudo cambiar el diseño."), "error");
    }
    renderDesigns();
    return;
  }
  const del = e.target.closest("[data-delete-design]");
  if (del) {
    const d = findDesign(del.dataset.deleteDesign);
    const ok = await confirmDialog({
      title: `¿Eliminar «${d.name}»?`,
      body: "Deja de aparecer en la tienda. Las prendas que ya están en carritos o pedidos conservan su imagen.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await data.deleteDesign(d.id);
      toast("Diseño eliminado.", "info");
    } catch (err) {
      toast(errText(err, "No se pudo eliminar el diseño."), "error");
    }
    if (editingDesign?.id === d.id) editingDesign = null;
    renderDesigns();
  }
});

/* ======================= Productos ======================= */
const productsPanel = $("[data-panel=productos]");
let creatingProduct = false;

function productRow(p) {
  const garmentName = GARMENTS[p.type]?.name || p.type;
  return `
  <li class="admin-product" data-product-row="${p.id}">
    <details>
      <summary>
        <span class="admin-product__thumb">${garmentSvg(p.type, "front", getColor(p.colors[0])?.hex || "#f4f4f1", { title: p.name, colorId: p.colors[0] })}</span>
        <span class="admin-row__main">
          <b>${escapeHtml(p.name)}</b>
          <span class="hint">${escapeHtml(garmentName)} · ${p.sku} · ${formatPrice(p.basePrice)}</span>
        </span>
        <span class="admin-product__state"><span class="tag ${p.active === false ? "tag--demo" : "tag--magenta"}">${p.active === false ? "Oculto" : "Visible"}</span><span class="hint">Editar</span></span>
      </summary>
      <form class="admin-form" data-product-form="${p.id}" novalidate>
        <div class="admin-grid">
          <div class="field"><label for="p-name-${p.id}">Nombre</label>
            <input class="input" id="p-name-${p.id}" name="name" maxlength="60" value="${escapeHtml(p.name)}"></div>
          <div class="field"><label for="p-price-${p.id}">Precio base (ARS)</label>
            <input class="input" id="p-price-${p.id}" name="basePrice" type="number" min="1" step="100" inputmode="numeric" value="${p.basePrice}"></div>
          <div class="field"><label for="p-tag-${p.id}">Bajada</label>
            <input class="input" id="p-tag-${p.id}" name="tagline" maxlength="80" value="${escapeHtml(p.tagline || "")}"></div>
          <div class="field"><label for="p-badge-${p.id}">Etiqueta (opcional)</label>
            <input class="input" id="p-badge-${p.id}" name="badge" maxlength="16" value="${escapeHtml(p.badge || "")}"></div>
          <div class="field admin-grid__wide"><label for="p-desc-${p.id}">Descripción</label>
            <textarea class="input" id="p-desc-${p.id}" name="description" maxlength="300" rows="2">${escapeHtml(p.description || "")}</textarea></div>
          <div class="field admin-grid__wide">
            <label class="check"><input type="checkbox" name="active" ${p.active === false ? "" : "checked"}> Visible en la tienda</label>
            <label class="check"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}> Destacado en el inicio</label>
          </div>
          <fieldset class="field admin-grid__wide"><legend>Colores</legend>
            <div class="admin-checks">
              ${Object.values(GARMENT_COLORS)
                .map(
                  (c) => `<label class="check"><input type="checkbox" name="colors" value="${c.id}" ${p.colors.includes(c.id) ? "checked" : ""}>
                  <span class="swatch swatch--sm" style="--sw:${c.hex}"></span> ${c.name}</label>`
                )
                .join("")}
            </div>
          </fieldset>
          <fieldset class="field admin-grid__wide"><legend>Talles y stock</legend>
            <table class="admin-table">
              <thead><tr><th scope="col">Talle</th><th scope="col">Recargo (ARS)</th><th scope="col">Stock</th></tr></thead>
              <tbody>
                ${p.sizes
                  .map(
                    (s, i) => `<tr><th scope="row">${escapeHtml(s.label)}</th>
                    <td><input class="input" type="number" min="0" step="100" name="surcharge-${i}" value="${s.surcharge || 0}" aria-label="Recargo talle ${escapeHtml(s.label)}"></td>
                    <td><select class="input" name="stock-${i}" aria-label="Stock talle ${escapeHtml(s.label)}">
                      ${["ok", "low", "out"].map((st) => `<option value="${st}" ${s.stock === st ? "selected" : ""}>${stockLabel(st)}</option>`).join("")}
                    </select></td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </fieldset>
        </div>
        <div class="notice notice--danger form-errors" role="alert" data-product-errors></div>
        <div class="admin-form__actions">
          <button class="btn btn--primary" type="submit">Guardar cambios</button>
          <a class="btn btn--ghost" href="producto.html?id=${encodeURIComponent(p.id)}">${icon("eye")}Ver en la tienda</a>
        </div>
      </form>
    </details>
  </li>`;
}

async function renderProducts({ reload = true } = {}) {
  if (reload) state.products = await data.products();
  productsPanel.innerHTML = `
    <div class="admin-head">
      <div>
        <h2 class="h3">Productos</h2>
        <p class="muted">Precio, visibilidad, colores, recargos por talle y stock. Los productos ocultos no aparecen en la tienda, pero los carritos que ya los tienen siguen funcionando.</p>
      </div>
      <button class="btn btn--primary" type="button" data-new-product>${icon("plus")}Nuevo producto</button>
    </div>
    ${
      creatingProduct
        ? `<form class="admin-form" data-new-product-form novalidate>
        <h3 class="h3">Nuevo producto</h3>
        <div class="admin-grid">
          <div class="field"><label for="np-type">Tipo de prenda</label>
            <select class="input" id="np-type" name="type">${Object.values(GARMENTS).map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}</select>
            <p class="hint">Define el mockup y el área de impresión.</p></div>
          <div class="field"><label for="np-name">Nombre</label><input class="input" id="np-name" name="name" maxlength="60"></div>
          <div class="field"><label for="np-price">Precio base (ARS)</label><input class="input" id="np-price" name="basePrice" type="number" min="1" step="100" inputmode="numeric"></div>
        </div>
        <div class="notice notice--danger form-errors" role="alert" data-new-product-errors></div>
        <div class="admin-form__actions">
          <button class="btn btn--primary" type="submit">Crear producto</button>
          <button class="btn btn--ghost" type="button" data-cancel-product>Cancelar</button>
        </div>
      </form>`
        : ""
    }
    <ul class="admin-list" role="list">${state.products.map(productRow).join("")}</ul>`;
  updateCounts();
}

async function saveProductForm(form) {
  const p = findProduct(form.dataset.productForm);
  const errEl = $("[data-product-errors]", form);
  const errors = [];
  const name = form.name.value.trim();
  const basePrice = Number(form.basePrice.value);
  const colors = $$("[name=colors]:checked", form).map((c) => c.value);
  if (!name) errors.push("Poné un nombre.");
  if (!Number.isInteger(basePrice) || basePrice < 1) errors.push("El precio base tiene que ser un número entero mayor a 0.");
  if (!colors.length) errors.push("Elegí al menos un color.");
  const sizes = p.sizes.map((s, i) => {
    const surcharge = Number(form[`surcharge-${i}`].value);
    if (!Number.isInteger(surcharge) || surcharge < 0) errors.push(`El recargo del talle ${s.label} no es válido.`);
    return { ...s, surcharge, stock: form[`stock-${i}`].value };
  });
  if (errors.length) {
    errEl.innerHTML = errors.map(escapeHtml).join("<br>");
    return;
  }
  const fields = {
    name,
    basePrice,
    colors,
    sizes,
    tagline: form.tagline.value.trim(),
    badge: form.badge.value.trim() || null,
    description: form.description.value.trim(),
    active: form.active.checked,
    featured: form.featured.checked,
  };
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const saved = await data.saveProduct(p.id, fields);
    toast(`«${saved.name}» guardado${SERVER ? "" : " en este navegador"}.`, "success");
  } catch (err) {
    errEl.textContent = errText(err, "No se pudo guardar el producto.");
    btn.disabled = false;
    return;
  }
  await renderProducts();
  $(`[data-product-row="${p.id}"] details`).open = true;
}

async function createProduct(form) {
  const errEl = $("[data-new-product-errors]", form);
  const type = form.type.value;
  const name = form.name.value.trim();
  const basePrice = Number(form.basePrice.value);
  const errors = [];
  if (!name) errors.push("Poné un nombre.");
  if (!Number.isInteger(basePrice) || basePrice < 1) errors.push("El precio base tiene que ser un número entero mayor a 0.");
  if (errors.length) {
    errEl.innerHTML = errors.map(escapeHtml).join("<br>");
    return;
  }
  let p;
  try {
    p = await data.createProduct({ type, name, basePrice });
  } catch (err) {
    errEl.textContent = errText(err, "No se pudo crear el producto.");
    return;
  }
  creatingProduct = false;
  toast(`«${name}» creado. Completá colores, talles y descripción.`, "success");
  await renderProducts();
  const det = $(`[data-product-row="${p.id}"] details`);
  det.open = true;
  det.scrollIntoView({ behavior: "smooth", block: "start" });
}

productsPanel.addEventListener("click", async (e) => {
  if (e.target.closest("[data-new-product]")) {
    creatingProduct = true;
    await renderProducts({ reload: false });
    $("[data-new-product-form] [name=name]").focus();
  }
  if (e.target.closest("[data-cancel-product]")) {
    creatingProduct = false;
    renderProducts({ reload: false });
  }
});
productsPanel.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.matches("[data-product-form]")) saveProductForm(e.target);
  if (e.target.matches("[data-new-product-form]")) createProduct(e.target);
});

/* ======================= Pedidos ======================= */
const ordersPanel = $("[data-panel=pedidos]");

function renderOrders() {
  const orders = listOrders();
  ordersPanel.innerHTML = `
    <div class="admin-head">
      <div>
        <h2 class="h3">Pedidos de prueba</h2>
        <p class="muted">Se crean al llegar al final del checkout de demostración. No hay cobros: sirven para practicar el circuito de producción.</p>
      </div>
      ${orders.length ? `<button class="btn btn--ghost" type="button" data-clear-orders>${icon("trash")}Borrar pedidos de prueba</button>` : ""}
    </div>
    ${
      orders.length
        ? `<ul class="admin-list" role="list">${orders
            .map(
              (o) => `
        <li class="admin-order" data-order-row="${o.id}">
          <div class="admin-order__head">
            <p><b>Pedido n.º ${o.number}</b> <span class="hint">${new Date(o.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span></p>
            <label class="admin-order__status">Estado
              <select class="input" data-order-status="${o.id}">
                ${ORDER_STATUSES.map((s) => `<option value="${s.id}" ${o.status === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </label>
            <p class="price">${formatPrice(o.total)}</p>
          </div>
          <ul class="admin-order__items" role="list">
            ${o.items
              .map((it) => {
                const designs = (it.storeDesignIds || []).map((id) => findDesign(id)?.name || getStoreDesign(id)?.name || id);
                return `<li>${it.thumbnail ? `<img src="${it.thumbnail}" alt="">` : ""}
                  <span><b>${it.qty} × ${escapeHtml(it.productName || getProduct(it.productId)?.name || it.productId)}</b>
                  <span class="hint">${escapeHtml(getColor(it.variant?.colorId)?.name || "")} · talle ${escapeHtml(it.variant?.sizeId || "")}${designs.length ? ` · diseño ${escapeHtml(designs.join(", "))}` : " · diseño propio"} · ${formatPrice(it.unit)} c/u</span></span></li>`;
              })
              .join("")}
          </ul>
        </li>`
            )
            .join("")}</ul>`
        : `<div class="empty"><p class="h3">Todavía no hay pedidos de prueba.</p><p class="muted">Agregá algo al carrito y tocá «Continuar (demo)».</p></div>`
    }`;
  updateCounts();
}

ordersPanel.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-order-status]");
  if (!sel) return;
  setOrderStatus(sel.dataset.orderStatus, sel.value);
  toast(`Pedido actualizado: ${sel.selectedOptions[0].textContent}.`, "success");
});
ordersPanel.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-clear-orders]")) return;
  const ok = await confirmDialog({ title: "¿Borrar los pedidos de prueba?", body: "Se borran de este navegador.", confirmLabel: "Borrar", danger: true });
  if (ok) {
    clearOrders();
    renderOrders();
  }
});

/* ======================= Restablecer ======================= */
$("[data-reset]")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "¿Restablecer los datos de demostración?",
    body: "Vuelven los productos y diseños originales y se borran los pedidos de prueba. Tu carrito no se toca.",
    confirmLabel: "Restablecer",
    danger: true,
  });
  if (!ok) return;
  resetProducts();
  resetStoreDesigns();
  clearOrders();
  editingDesign = null;
  creatingProduct = false;
  renderAll();
  toast("Datos de demostración restablecidos.", "success");
});

async function renderAll() {
  await renderProducts(); // primero: los diseños nombran productos
  await renderDesigns();
  if (SERVER) (await import("./admin-server.js")).renderServerPanels({ ordersPanel, updateTabs: selectTab });
  else renderOrders();
}

function start() {
  renderAll().catch((err) => toast(errText(err, "No se pudo cargar el panel."), "error", 8000));
  selectTab(location.hash.slice(1));
  window.addEventListener("hashchange", () => selectTab(location.hash.slice(1)));
}

if (SERVER) (await import("./admin-server.js")).gate(start);
else start();
