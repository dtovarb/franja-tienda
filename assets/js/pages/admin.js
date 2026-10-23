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
import { initPage, icon, toast, confirmDialog, getAnnouncement, ANNOUNCEMENT_KEY, announcementBar, getHomeImages, HOME_IMAGES_KEY, getPopup, POPUP_KEY, popupHtml, fillPopupPhoto } from "../core/ui.js";
import { POPUP_LIMITS, POPUP_LABELS, POPUP_DEFAULTS, normalizePopup } from "../core/popup.js";
import { normalizeCoupons, findCoupon, todayAR, MAX_COUPONS, MAX_PERCENT } from "../core/coupons.js";
import { DEMO_COUPONS_KEY } from "../core/coupon-state.js";
import { HOME_IMAGE_SLOTS, FIELD_LIMITS, FIELD_LABELS, normalizeHomeImages } from "../core/home-images.js";
import { ANNOUNCEMENT_STYLES, MAX_MESSAGES, MAX_TEXT, normalizeAnnouncement } from "../core/announcement.js";
import { renderSiteContent, resetSiteContent } from "./admin-texts.js";
import { photosBlock, bindPhotos, loadGarmentPhotos } from "./admin-photos.js";
import { readJSON, writeJSON, removeKey } from "../core/storage.js";
import {
  PRODUCTS, GARMENT_COLORS, getProduct, getColor, saveProducts, resetProducts, defaultSizesFor, stockLabel,
} from "../data/catalog.js";
import { GARMENTS, garmentSvg, faceLabel, faceHint } from "../data/garments.js";
import { ZONE_PRICES, PRICED_ZONES, DISABLED_ZONES, ALWAYS_ON_ZONES } from "../core/pricing.js";
import {
  listStoreDesigns, getStoreDesign, saveStoreDesign, deleteStoreDesign, resetStoreDesigns, storeDesignImageUrl, modelPhotoUrl,
  listCollections, saveCollection, deleteCollection, resetCollections,
} from "../core/store-designs.js";
import { listOrders, setOrderStatus, clearOrders, ORDER_STATUSES } from "../core/orders.js";
import { processUpload, UploadError } from "../editor/upload.js";
import { formatPrice, escapeHtml, uid } from "../core/format.js";
import { SERVER, api, putToTarget } from "../core/api.js";
import { getAsset, putAsset, sha256Hex } from "../core/asset-store.js";

initPage("admin");

/* ======================= Datos ======================= */
const designSource = async (file) => {
  const a = await processUpload(file);
  return { asset: a, source: { kind: "asset", assetId: a.id, name: a.name, type: a.type, width: a.width, height: a.height, isVector: a.isVector } };
};

/**
 * Foto con modelo: se achica en el navegador (lado mayor 1600 px, JPG) para
 * que la tienda cargue rápido. Acepta JPG, PNG o WebP.
 */
const PHOTO_MAX_SIDE = 1600;
const PHOTO_MIN_SIDE = 500;
const REMOVE_PHOTO = "remove";
async function preparePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("La foto tiene que ser JPG, PNG o WebP.");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la foto. Probá exportarla de nuevo como JPG.");
  }
  if (Math.min(bmp.width, bmp.height) < PHOTO_MIN_SIDE) throw new Error(`La foto mide ${bmp.width}×${bmp.height} px: es muy chica (mínimo ${PHOTO_MIN_SIDE} px de lado).`);
  const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; // un PNG con transparencia queda sobre blanco
  g.fillRect(0, 0, width, height);
  g.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  const name = `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`;
  return { blob, meta: { sha256: await sha256Hex(blob), mime: "image/jpeg", bytes: blob.size, name, width, height } };
}

/** Demostración: todo en este navegador. */
const demoData = {
  designs: async () => listStoreDesigns(),
  async saveDesign(current, fields, file, photo) {
    const source = file ? (await designSource(file)).source : current.source;
    let modelPhoto = current.modelPhoto || null;
    if (photo === REMOVE_PHOTO) modelPhoto = null;
    else if (photo) {
      const { blob, meta } = photo;
      await putAsset({ id: meta.sha256, blob, name: meta.name, type: meta.mime, size: meta.bytes, width: meta.width, height: meta.height, isVector: false });
      modelPhoto = { assetId: meta.sha256, name: meta.name, width: meta.width, height: meta.height };
    }
    return saveStoreDesign({ ...current, ...fields, source, modelPhoto });
  },
  deleteDesign: async (id) => deleteStoreDesign(id),
  collections: async () => listCollections(),
  saveCollection: async (current, fields) => saveCollection({ ...current, ...fields }),
  deleteCollection: async (id) => deleteCollection(id),
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
  zoneSettings: async () => ({ zonePrices: ZONE_PRICES, disabledZones: [...DISABLED_ZONES] }),
  async saveZoneSettings({ zonePrices, disabledZones }) {
    // Solo esta sesión.
    Object.assign(ZONE_PRICES, zonePrices);
    DISABLED_ZONES.clear();
    disabledZones.forEach((z) => DISABLED_ZONES.add(z));
    return { zonePrices: ZONE_PRICES, disabledZones };
  },
  announcement: async () => getAnnouncement(),
  async saveAnnouncement(a) {
    const { value, errors } = normalizeAnnouncement(a);
    if (errors.length) throw new Error(errors.join(" "));
    writeJSON(ANNOUNCEMENT_KEY, value);
    return value;
  },
  coupons: async () => ({ coupons: normalizeCoupons(readJSON(DEMO_COUPONS_KEY, [])).value, uses: {} }),
  async saveCoupons(list) {
    const { value, errors } = normalizeCoupons(list);
    if (errors.length) throw new Error(errors.join(" "));
    writeJSON(DEMO_COUPONS_KEY, value);
    return { coupons: value, uses: {} };
  },
  popup: async () => getPopup(),
  /** `changes`: { enabled, kicker, title, text, button, link, photo?: preparePhoto(), removePhoto? }. */
  async savePopup({ photo: newPhoto, removePhoto, ...fields }) {
    let photo = (await this.popup()).photo;
    if (newPhoto) {
      const { blob, meta } = newPhoto;
      await putAsset({ id: meta.sha256, blob, name: meta.name, type: meta.mime, size: meta.bytes, width: meta.width, height: meta.height, isVector: false });
      photo = { assetId: meta.sha256, name: meta.name, width: meta.width, height: meta.height };
    } else if (removePhoto) photo = null;
    const { value, errors } = normalizePopup({ ...fields, photo, updatedAt: new Date().toISOString() });
    if (errors.length) throw new Error(errors.join(" "));
    writeJSON(POPUP_KEY, value);
    return value;
  },
  homeImages: async () => normalizeHomeImages(readJSON(HOME_IMAGES_KEY, null)).value,
  /** `changes`: por lugar, { kicker, caption, text, button, link, photo?: preparePhoto(), removePhoto? }. */
  async saveHomeImages(changes) {
    const cur = await this.homeImages();
    const next = {};
    for (const [key, list] of Object.entries(cur)) {
      next[key] = [];
      for (let i = 0; i < list.length; i++) {
        const ch = changes[key][i];
        let photo = list[i].photo;
        if (ch.photo) {
          const { blob, meta } = ch.photo;
          await putAsset({ id: meta.sha256, blob, name: meta.name, type: meta.mime, size: meta.bytes, width: meta.width, height: meta.height, isVector: false });
          photo = { assetId: meta.sha256, name: meta.name, width: meta.width, height: meta.height };
        } else if (ch.removePhoto) photo = null;
        next[key].push({ ...ch, photo });
      }
    }
    const { value, errors } = normalizeHomeImages(next);
    if (errors.length) throw new Error(errors.join(" "));
    writeJSON(HOME_IMAGES_KEY, value);
    return value;
  },
};

/** Con servidor: la base de la tienda. Los archivos de diseños van al balde público. */
const serverData = {
  designs: async () => (await api("admin/store-designs")).storeDesigns,
  async saveDesign(current, fields, file, photo) {
    let fileMeta;
    if (file) {
      const { asset } = await designSource(file); // mismos controles que las subidas de clientas
      fileMeta = { sha256: asset.id, mime: asset.type, bytes: asset.size, name: asset.name };
      const { target } = await api("admin/uploads", { method: "POST", body: { file: fileMeta } });
      await putToTarget(target, (await getAsset(asset.id)).blob);
    }
    let photoMeta;
    if (photo && photo !== REMOVE_PHOTO) {
      photoMeta = photo.meta;
      const { target } = await api("admin/uploads", { method: "POST", body: { file: photoMeta } });
      await putToTarget(target, photo.blob);
    }
    const body = { ...fields, file: fileMeta, photo: photoMeta, removePhoto: photo === REMOVE_PHOTO };
    const r = current.id
      ? await api(`admin/store-designs/${encodeURIComponent(current.id)}`, { method: "PATCH", body })
      : await api("admin/store-designs", { method: "POST", body });
    return r.storeDesign;
  },
  deleteDesign: (id) => api(`admin/store-designs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  collections: async () => (await api("admin/design-collections")).designCollections,
  async saveCollection(current, fields) {
    const r = current.id
      ? await api(`admin/design-collections/${encodeURIComponent(current.id)}`, { method: "PATCH", body: fields })
      : await api("admin/design-collections", { method: "POST", body: fields });
    return r.designCollection;
  },
  deleteCollection: (id) => api(`admin/design-collections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  products: async () => (await api("admin/products")).products,
  saveProduct: async (id, fields) => (await api(`admin/products/${encodeURIComponent(id)}`, { method: "PATCH", body: fields })).product,
  createProduct: async (fields) => (await api("admin/products", { method: "POST", body: fields })).product,
  zoneSettings: async () => await api("admin/zone-prices"),
  saveZoneSettings: async (settings) => await api("admin/zone-prices", { method: "PUT", body: settings }),
  announcement: async () => (await api("admin/announcement")).announcement,
  saveAnnouncement: async (announcement) => (await api("admin/announcement", { method: "PUT", body: { announcement } })).announcement,
  coupons: async () => await api("admin/coupons"),
  saveCoupons: async (coupons) => await api("admin/coupons", { method: "PUT", body: { coupons } }),
  popup: async () => (await api("admin/popup")).popup,
  async savePopup({ photo: newPhoto, ...fields }) {
    let photo;
    if (newPhoto) {
      photo = newPhoto.meta;
      const { target } = await api("admin/uploads", { method: "POST", body: { file: photo } });
      await putToTarget(target, newPhoto.blob);
    }
    return (await api("admin/popup", { method: "PUT", body: { popup: { ...fields, photo, removePhoto: !!fields.removePhoto } } })).popup;
  },
  homeImages: async () => (await api("admin/home-images")).homeImages,
  async saveHomeImages(changes) {
    const homeImages = {};
    for (const [key, list] of Object.entries(changes)) {
      homeImages[key] = [];
      for (const ch of list) {
        let photo;
        if (ch.photo) {
          photo = ch.photo.meta;
          const { target } = await api("admin/uploads", { method: "POST", body: { file: photo } });
          await putToTarget(target, ch.photo.blob);
        }
        homeImages[key].push({ ...ch, photo, removePhoto: !!ch.removePhoto });
      }
    }
    return (await api("admin/home-images", { method: "PUT", body: { homeImages } })).homeImages;
  },
};

const data = SERVER ? serverData : demoData;
const state = { designs: [], collections: [], products: [], zones: { zonePrices: { ...ZONE_PRICES }, disabledZones: [...DISABLED_ZONES] } };
const findDesign = (id) => state.designs.find((d) => d.id === id);
const findCollection = (id) => state.collections.find((c) => c.id === id);
const findProduct = (id) => state.products.find((p) => p.id === id);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABS = SERVER ? ["disenos", "productos", "pedidos", "sitio", "envios"] : ["disenos", "productos", "pedidos", "sitio"];

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
let editingCollection = null; // igual que editingDesign

async function renderDesigns() {
  [state.designs, state.collections] = await Promise.all([data.designs(), data.collections()]);
  const list = state.designs;
  const urls = await Promise.all(list.map(storeDesignImageUrl));
  designsPanel.innerHTML = `
    ${collectionsBlock()}
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
              <p><b>${escapeHtml(d.name)}</b> <span class="tag ${d.status === "published" ? "tag--magenta" : "tag--demo"}">${d.status === "published" ? "Publicado" : "Borrador"}</span>${d.modelPhoto ? ' <span class="tag tag--pink">Con foto puesta</span>' : ""}</p>
              <p class="hint">${d.price ? formatPrice(d.price) : "Sin costo"} por prenda · ${escapeHtml(productNames(d.productIds))} · ${escapeHtml(findCollection(d.collectionId)?.name || "Sin colección")}</p>
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
  if (editingCollection) renderCollectionForm();
  updateCounts();
}

/* ----- Colecciones ----- */
function collectionsBlock() {
  const count = (id) => state.designs.filter((d) => d.collectionId === id).length;
  return `
    <div class="admin-head">
      <div>
        <h2 class="h3">Colecciones</h2>
        <p class="muted">En <a href="disenos.html">Diseños</a> la clienta elige una colección y ve solo sus diseños. Los diseños sin colección se ven en «Todos». Una colección sin diseños publicados no aparece.</p>
      </div>
      <button class="btn" type="button" data-new-collection>${icon("plus")}Nueva colección</button>
    </div>
    <div data-collection-form-host></div>
    ${
      state.collections.length
        ? `<ul class="admin-list admin-collections" role="list">${state.collections
            .map(
              (c) => `
          <li class="admin-row" data-collection-row="${c.id}">
            <div class="admin-row__main">
              <p><b>${escapeHtml(c.name)}</b></p>
              <p class="hint">${count(c.id) === 1 ? "1 diseño" : `${count(c.id)} diseños`}${c.description ? ` · ${escapeHtml(c.description)}` : ""}</p>
            </div>
            <div class="admin-row__actions">
              <button class="btn btn--sm" type="button" data-edit-collection="${c.id}">${icon("edit")}Editar</button>
              <button class="btn btn--sm btn--ghost" type="button" data-delete-collection="${c.id}">${icon("trash")}Eliminar</button>
            </div>
          </li>`
            )
            .join("")}</ul>`
        : `<p class="muted admin-collections">Todavía no hay colecciones: todos los diseños se ven juntos.</p>`
    }`;
}

function renderCollectionForm() {
  const c = editingCollection;
  const host = $("[data-collection-form-host]", designsPanel);
  host.innerHTML = `
    <form class="admin-form" data-collection-form novalidate>
      <h3 class="h3">${c.id ? `Editar «${escapeHtml(c.name)}»` : "Nueva colección"}</h3>
      <div class="admin-grid">
        <div class="field">
          <label for="c-name">Nombre</label>
          <input class="input" id="c-name" name="name" maxlength="40" required value="${escapeHtml(c.name || "")}">
        </div>
        <div class="field">
          <label for="c-desc">Descripción (opcional)</label>
          <input class="input" id="c-desc" name="description" maxlength="200" value="${escapeHtml(c.description || "")}">
          <p class="hint">Se muestra arriba de los diseños cuando eligen la colección.</p>
        </div>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-collection-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">${c.id ? "Guardar cambios" : "Crear colección"}</button>
        <button class="btn btn--ghost" type="button" data-cancel-collection>Cancelar</button>
      </div>
    </form>`;
  const form = $("[data-collection-form]", host);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("[data-collection-errors]", form);
    const name = form.name.value.trim();
    if (!name) {
      errEl.textContent = "Poné un nombre.";
      return;
    }
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const saved = await data.saveCollection(editingCollection, { name, description: form.description.value.trim() });
      editingCollection = null;
      toast(`Colección «${saved.name}» guardada${SERVER ? "" : " en este navegador"}.`, "success");
      renderDesigns();
    } catch (err) {
      errEl.textContent = errText(err, "No se pudo guardar la colección.");
      btn.disabled = false;
    }
  });
  $("[data-cancel-collection]", form).addEventListener("click", () => {
    editingCollection = null;
    host.innerHTML = "";
  });
  form.name.focus();
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
        <div class="field admin-grid__wide admin-photo">
          <label for="d-photo">Foto con modelo (opcional)</label>
          <div class="admin-photo__row">
            ${d.modelPhoto ? '<img class="admin-photo__img" data-photo-preview alt="Foto actual">' : ""}
            <div class="admin-photo__fields">
              <input class="input" id="d-photo" name="photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">
              ${d.modelPhoto ? '<label class="check"><input type="checkbox" name="removePhoto"> Quitar la foto actual</label>' : ""}
              <p class="hint">Una persona usando la prenda con este diseño. En la tienda aparece al pasar el mouse por el diseño, y en el inicio. Queda mejor vertical (4:5) y con el estampado a la altura del pecho. Antes de subirla la achicamos a 1600 px.</p>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="d-collection">Colección</label>
          <select class="input" id="d-collection" name="collectionId">
            <option value="">Sin colección (solo en «Todos»)</option>
            ${state.collections.map((c) => `<option value="${escapeHtml(c.id)}" ${d.collectionId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <p class="hint">Las colecciones se crean arriba, en «Nueva colección».</p>
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
  const preview = $("[data-photo-preview]", form);
  if (preview) modelPhotoUrl(d).then((u) => u && (preview.src = u));
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
    const photoFile = form.photo.files[0];
    const photo = photoFile ? await preparePhoto(photoFile) : form.removePhoto?.checked ? REMOVE_PHOTO : undefined;
    const saved = await data.saveDesign(
      editingDesign,
      { name, description: form.description.value.trim(), price, status: form.status.value, productIds, collectionId: form.collectionId.value || null },
      file,
      photo
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
  if (e.target.closest("[data-new-collection]")) {
    editingCollection = {};
    renderCollectionForm();
    return;
  }
  const editCol = e.target.closest("[data-edit-collection]");
  if (editCol) {
    editingCollection = structuredClone(findCollection(editCol.dataset.editCollection));
    renderCollectionForm();
    return;
  }
  const delCol = e.target.closest("[data-delete-collection]");
  if (delCol) {
    const c = findCollection(delCol.dataset.deleteCollection);
    const ok = await confirmDialog({
      title: `¿Eliminar la colección «${c.name}»?`,
      body: "Sus diseños no se borran: siguen en la tienda, sin colección (se ven en «Todos»).",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await data.deleteCollection(c.id);
      toast("Colección eliminada.", "info");
    } catch (err) {
      toast(errText(err, "No se pudo eliminar la colección."), "error");
    }
    if (editingCollection?.id === c.id) editingCollection = null;
    renderDesigns();
    return;
  }
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
      await data.saveDesign(d, { name: d.name, description: d.description, price: d.price, productIds: d.productIds, collectionId: d.collectionId || null, status: d.status === "published" ? "draft" : "published" });
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
          <fieldset class="field admin-grid__wide"><legend>Stock por talle</legend>
            <p class="hint">Todos los talles cuestan lo mismo.</p>
            <table class="admin-table">
              <thead><tr><th scope="col">Talle</th><th scope="col">Stock</th></tr></thead>
              <tbody>
                ${p.sizes
                  .map(
                    (s, i) => `<tr><th scope="row">${escapeHtml(s.label)}</th>
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
      ${photosBlock(p)}
    </details>
  </li>`;
}

async function renderProducts({ reload = true } = {}) {
  if (reload) [state.products, state.zones] = await Promise.all([data.products(), data.zoneSettings(), loadGarmentPhotos()]);
  productsPanel.innerHTML = `
    <div class="admin-head">
      <div>
        <h2 class="h3">Productos</h2>
        <p class="muted">Precio, visibilidad, colores con sus fotos y stock, y las zonas de estampa con su recargo. Los productos ocultos no aparecen en la tienda, pero los carritos que ya los tienen siguen funcionando.</p>
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
    ${zonePricesForm()}
    <ul class="admin-list" role="list">${state.products.map(productRow).join("")}</ul>`;
  updateCounts();
}

/** Zonas de estampa: cuáles se ofrecen y cuánto suma cada una (el frente también). */
function zonePricesForm() {
  const { zonePrices, disabledZones } = state.zones;
  return `<form class="admin-form" data-zone-prices-form novalidate>
    <h3 class="h3">Zonas de estampa</h3>
    <p class="muted">Cada zona que la clienta estampe suma este recargo por unidad al precio base de la prenda. Si el frente queda en 0, el precio base ya lo incluye. Una zona apagada no aparece en ninguna prenda ni en el editor. Valen para todas las prendas que tienen esa zona.</p>
    <table class="admin-table admin-zones">
      <thead><tr><th scope="col">Zona</th><th scope="col">Se ofrece</th><th scope="col">Recargo (ARS)</th></tr></thead>
      <tbody>
        ${PRICED_ZONES.map((z) => {
          const fixed = ALWAYS_ON_ZONES.includes(z);
          const hint = fixed ? "Siempre se ofrece." : faceHint(z);
          return `<tr><th scope="row">${escapeHtml(faceLabel(z))}${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ""}</th>
            <td><label class="check"><input type="checkbox" name="on-${z}" ${disabledZones.includes(z) ? "" : "checked"} ${fixed ? "disabled" : ""} aria-label="Ofrecer ${escapeHtml(faceLabel(z))}"> Sí</label></td>
            <td><input class="input" id="zp-${z}" name="${z}" type="number" min="0" step="100" inputmode="numeric" value="${zonePrices[z] ?? 0}" aria-label="Recargo ${escapeHtml(faceLabel(z))}"></td></tr>`;
        }).join("")}
      </tbody>
    </table>
    <div class="notice notice--danger form-errors" role="alert" data-zone-prices-errors></div>
    <div class="admin-form__actions"><button class="btn btn--primary" type="submit">Guardar zonas</button></div>
  </form>`;
}

async function saveZonePricesForm(form) {
  const errEl = $("[data-zone-prices-errors]", form);
  const zonePrices = {};
  const disabledZones = [];
  for (const z of PRICED_ZONES) {
    const v = Number(form.elements.namedItem(z).value);
    if (!Number.isInteger(v) || v < 0) {
      errEl.textContent = `El recargo de «${faceLabel(z)}» tiene que ser un número entero, sin centavos.`;
      return;
    }
    zonePrices[z] = v;
    if (!ALWAYS_ON_ZONES.includes(z) && !form.elements.namedItem(`on-${z}`).checked) disabledZones.push(z);
  }
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    state.zones = await data.saveZoneSettings({ zonePrices, disabledZones });
    errEl.textContent = "";
    toast(`Zonas guardadas${SERVER ? ". La tienda las muestra en menos de un minuto" : " (solo en esta sesión de demostración)"}.`, "success");
  } catch (err) {
    errEl.textContent = errText(err, "No se pudieron guardar las zonas.");
  }
  btn.disabled = false;
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
  const sizes = p.sizes.map((s, i) => ({ ...s, surcharge: 0, stock: form[`stock-${i}`].value }));
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
bindPhotos(productsPanel, () => state.products);
productsPanel.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.matches("[data-product-form]")) saveProductForm(e.target);
  if (e.target.matches("[data-new-product-form]")) createProduct(e.target);
  if (e.target.matches("[data-zone-prices-form]")) saveZonePricesForm(e.target);
});

/* ======================= Sitio: cintillo de anuncios ======================= */
const sitePanel = $("[data-panel=sitio]");
// Atajos a cada sección de la pestaña (es larga).
// Son botones y no enlaces con #: cambiar el # de la dirección cambia de pestaña.
const SITE_JUMP = `<nav class="admin-jump" aria-label="Secciones de Sitio">
    <button type="button" data-jump="sitio-cintillo">Cintillo</button><button type="button" data-jump="sitio-oferta">Ventana de oferta</button><button type="button" data-jump="sitio-codigos">Códigos de descuento</button><button type="button" data-jump="sitio-marquesina">Marquesina</button><button type="button" data-jump="sitio-fotos">Fotos del inicio</button><button type="button" data-jump="sitio-textos">Textos de la página</button>
  </nav>`;
sitePanel.addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump]");
  if (b) document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

async function renderSite() {
  const a = (await data.announcement()) || { enabled: false, style: "ciruela", messages: [] };
  const rows = [...a.messages];
  while (rows.length < MAX_MESSAGES) rows.push({ text: "", link: "" });
  sitePanel.innerHTML = `
    <div class="admin-head" id="sitio-cintillo">
      <div>
        <h2 class="h3">Cintillo de anuncios</h2>
        <p class="muted">La franja de arriba de todo de la tienda, para ofertas, envíos o novedades. Con más de un mensaje, van rotando cada 5 segundos.</p>
      </div>
    </div>
    <form class="admin-form" data-announce-form novalidate>
      <label class="check"><input type="checkbox" name="enabled" ${a.enabled ? "checked" : ""}> Mostrar el cintillo en la tienda</label>
      <fieldset class="field">
        <legend>Mensajes</legend>
        <p class="hint">Hasta ${MAX_MESSAGES} mensajes de ${MAX_TEXT} caracteres. Los vacíos no se muestran. El enlace es opcional: una página de la tienda (por ejemplo <code>disenos.html</code> o <code>catalogo.html</code>) o una dirección que empiece con https://.</p>
        <ol class="admin-announce" role="list">
          ${rows
            .map(
              (m, i) => `<li class="admin-announce__row">
              <span class="mono muted">${String(i + 1).padStart(2, "0")}</span>
              <div class="field"><label class="sr-only" for="an-text-${i}">Mensaje ${i + 1}</label>
                <input class="input" id="an-text-${i}" name="text" maxlength="${MAX_TEXT}" placeholder="${i ? "" : "Ej.: 3 cuotas sin interés en remeras"}" value="${escapeHtml(m.text)}"></div>
              <div class="field"><label class="sr-only" for="an-link-${i}">Enlace del mensaje ${i + 1}</label>
                <input class="input" id="an-link-${i}" name="link" placeholder="Enlace (opcional)" value="${escapeHtml(m.link)}"></div>
            </li>`
            )
            .join("")}
        </ol>
      </fieldset>
      <div class="field">
        <label for="an-style">Color</label>
        <select class="input" id="an-style" name="style">
          ${Object.entries(ANNOUNCEMENT_STYLES).map(([k, v]) => `<option value="${k}" ${a.style === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span class="label">Vista previa</span>
        <div class="admin-announce__preview" data-announce-preview></div>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-announce-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar cintillo</button>
      </div>
    </form>
    <div data-popup-admin></div>
    <div data-coupons-admin></div>
    <div data-marquee-admin></div>
    <div data-home-images></div>
    <div data-site-texts></div>`;
  sitePanel.insertAdjacentHTML("afterbegin", SITE_JUMP);
  renderPopupAdmin();
  renderCouponsAdmin();
  renderHomeImages();
  renderSiteContent({ marqueeHost: $("[data-marquee-admin]", sitePanel), textsHost: $("[data-site-texts]", sitePanel) });
  const form = $("[data-announce-form]", sitePanel);
  const read = () => ({
    enabled: form.enabled.checked,
    style: form.style.value,
    messages: $$("input[name=text]", form).map((t, i) => ({ text: t.value, link: $$("input[name=link]", form)[i].value })),
  });
  const preview = () => {
    const v = normalizeAnnouncement({ ...read(), enabled: true }).value;
    $("[data-announce-preview]", form).innerHTML = v.messages.length
      ? announcementBar({ ...v, messages: v.messages.slice(0, 1) }) + (form.enabled.checked ? "" : '<p class="hint">Apagado: no se ve en la tienda.</p>')
      : '<p class="hint">Escribí un mensaje para verlo.</p>';
  };
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  preview();
}

/* ======================= Sitio: ventana de oferta ======================= */
const POPUP_PLACEHOLDERS = {
  kicker: "Ej.: Solo por esta semana",
  title: "Ej.: 15% off en remeras",
  text: "Ej.: En todos los diseños de la casa, hasta el domingo.",
  button: POPUP_DEFAULTS.button,
};

async function renderPopupAdmin() {
  const host = $("[data-popup-admin]", sitePanel);
  if (!host) return;
  const p = await data.popup();
  const field = (f, tag = "input") => {
    const attrs = `class="input" id="po-${f}" name="${f}" maxlength="${POPUP_LIMITS[f]}" placeholder="${escapeHtml(POPUP_PLACEHOLDERS[f])}"`;
    return `<div class="field"><label for="po-${f}">${POPUP_LABELS[f]}${f === "title" || f === "text" ? "" : " (opcional)"}</label>
      ${tag === "textarea" ? `<textarea ${attrs} rows="3">${escapeHtml(p[f])}</textarea>` : `<input ${attrs} value="${escapeHtml(p[f])}">`}</div>`;
  };
  host.innerHTML = `
    <div class="admin-head admin-head--sep" id="sitio-oferta">
      <div>
        <h2 class="h3">Ventana de oferta</h2>
        <p class="muted">Un cartel con tu oferta y un botón que aparece solo en el inicio de la tienda, cada vez que se abre o se recarga. En las otras páginas (prendas, diseños, carrito, etc.) no sale nunca.</p>
      </div>
    </div>
    <form class="admin-form" data-popup-form novalidate>
      <label class="check"><input type="checkbox" name="enabled" ${p.enabled ? "checked" : ""}> Mostrar la ventana en la tienda</label>
      <div class="admin-home__slot">
        <div class="admin-home__thumb">${p.photo ? `<img data-popup-thumb alt="Foto actual">` : `<span class="hint">Sin foto</span>`}</div>
        <div class="admin-home__fields">
          <div class="field"><label for="po-photo">${p.photo ? "Cambiar foto" : "Subir foto"} (opcional)</label>
            <input class="input" id="po-photo" name="photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">
            <p class="hint">Va al costado del texto (arriba en el celu). Queda mejor vertical o cuadrada. Sin foto, la ventana es solo texto.</p></div>
          ${p.photo ? `<label class="check"><input type="checkbox" name="removePhoto"> Quitar la foto</label>` : ""}
        </div>
      </div>
      ${field("kicker")}
      ${field("title")}
      ${field("text", "textarea")}
      <div class="field"><label for="po-code">Código de descuento (opcional)</label>
        <input class="input" id="po-code" name="code" maxlength="20" value="${escapeHtml(p.code)}" placeholder="Ej.: NEVRADO15" style="text-transform:uppercase" list="po-code-list" autocomplete="off">
        <datalist id="po-code-list" data-popup-codes></datalist>
        <p class="hint">Se muestra en la ventana y, con el botón, queda cargado en el carrito de la clienta. Primero crealo en «Códigos de descuento» (más abajo): ahí ponés el porcentaje y las fechas.</p>
        <p class="hint" data-popup-code-check></p></div>
      ${field("button")}
      <div class="field"><label for="po-link">Enlace del botón (opcional)</label>
        <input class="input" id="po-link" name="link" value="${escapeHtml(p.link)}" placeholder="${POPUP_DEFAULTS.link}">
        <p class="hint">Vacío lleva a las prendas (<code>catalogo.html</code>). También podés poner <code>disenos.html</code>, una colección (<code>disenos.html?coleccion=…</code>) o una dirección que empiece con https://.</p></div>
      <div class="field">
        <span class="label">Vista previa</span>
        <div class="admin-popup__preview" data-popup-preview></div>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-popup-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar ventana</button>
      </div>
    </form>`;
  const form = $("[data-popup-form]", host);
  if (p.photo) modelPhotoUrl({ modelPhoto: p.photo }).then((u) => u && ($("[data-popup-thumb]", form).src = u));
  const read = () => ({
    enabled: form.enabled.checked,
    ...Object.fromEntries(Object.keys(POPUP_LIMITS).map((f) => [f, form[f].value])),
    code: form.code.value,
    link: form.link.value,
    removePhoto: !!form.removePhoto?.checked,
  });
  // Avisa si el código de la ventana no existe o no está vigente hoy.
  const coupons = (await data.coupons().catch(() => ({ coupons: [] }))).coupons;
  $("[data-popup-codes]", form).innerHTML = coupons.map((c) => `<option value="${escapeHtml(c.code)}">${c.percent}% off</option>`).join("");
  const checkCode = () => {
    const v = form.code.value.trim();
    const r = v ? findCoupon(coupons, v) : {};
    $("[data-popup-code-check]", form).innerHTML = r.coupon ? `✓ ${escapeHtml(r.coupon.code)}: ${r.coupon.percent}% off en las prendas.` : r.error ? `<b>Ojo:</b> ${escapeHtml(r.error)} Revisalo en «Códigos de descuento».` : "";
  };
  form.code.addEventListener("input", checkCode);
  checkCode();
  let localPhoto = null; // vista previa de una foto elegida y todavía sin guardar
  const preview = () => {
    const v = read();
    const { value } = normalizePopup({ ...v, link: "" });
    const out = $("[data-popup-preview]", form);
    if (!value.title && !value.text) return (out.innerHTML = '<p class="hint">Escribí un título o un texto para verla.</p>');
    const photo = localPhoto ? { url: localPhoto } : v.removePhoto ? null : p.photo;
    out.innerHTML = popupHtml({ ...value, photo }) + (form.enabled.checked ? "" : '<p class="hint">Apagada: no se ve en la tienda.</p>');
    out.querySelector("[data-offer-cta]")?.addEventListener("click", (e) => e.preventDefault());
    const img = out.querySelector("[data-popup-photo]");
    if (img && localPhoto) img.src = localPhoto;
    else if (img) fillPopupPhoto(out, { photo });
  };
  form.addEventListener("input", preview);
  form.addEventListener("change", (e) => {
    if (e.target.name === "photo") {
      if (localPhoto) URL.revokeObjectURL(localPhoto);
      const f = e.target.files[0];
      localPhoto = f ? URL.createObjectURL(f) : null;
    }
    preview();
  });
  preview();
}

async function savePopupForm(form) {
  const errEl = $("[data-popup-errors]", form);
  errEl.textContent = "";
  const btn = form.querySelector("[type=submit]");
  const raw = {
    enabled: form.enabled.checked,
    ...Object.fromEntries(Object.keys(POPUP_LIMITS).map((f) => [f, form[f].value])),
    code: form.code.value,
    link: form.link.value,
    removePhoto: !!form.removePhoto?.checked,
  };
  const { errors } = normalizePopup(raw);
  if (errors.length) return (errEl.innerHTML = errors.map(escapeHtml).join("<br>"));
  btn.disabled = true;
  try {
    const file = form.photo.files[0];
    const saved = await data.savePopup({ ...raw, photo: file ? await preparePhoto(file) : undefined });
    toast(
      saved.enabled
        ? `Ventana guardada${SERVER ? ". En la tienda aparece en un minuto como mucho." : " en este navegador."}`
        : `Ventana apagada${SERVER ? ". Deja de aparecer en un minuto como mucho." : "."}`,
      "success"
    );
    renderPopupAdmin();
  } catch (err) {
    errEl.textContent = errText(err, "No se pudo guardar la ventana.");
    btn.disabled = false;
  }
}

/* ======================= Sitio: códigos de descuento ======================= */
function couponRow(c, i, uses) {
  const id = `cp-${i}`;
  const n = uses[c.code] || 0;
  return `<li class="admin-coupon" data-coupon-row>
    <div class="field"><label for="${id}-code">Código</label>
      <input class="input admin-coupon__code" id="${id}-code" name="code" maxlength="20" value="${escapeHtml(c.code)}" placeholder="Ej.: NEVRADO15" autocomplete="off"></div>
    <div class="field"><label for="${id}-pct">% off</label>
      <input class="input" id="${id}-pct" name="percent" type="number" min="1" max="${MAX_PERCENT}" step="1" inputmode="numeric" value="${c.percent ?? ""}" placeholder="15"></div>
    <div class="field"><label for="${id}-from">Desde (opcional)</label>
      <input class="input" id="${id}-from" name="startsOn" type="date" value="${c.startsOn || ""}"></div>
    <div class="field"><label for="${id}-to">Hasta (opcional)</label>
      <input class="input" id="${id}-to" name="endsOn" type="date" value="${c.endsOn || ""}"></div>
    <label class="check"><input type="checkbox" name="active" ${c.active !== false ? "checked" : ""}> Activo</label>
    <p class="hint admin-coupon__uses">${c.code ? `${n} ${n === 1 ? "pedido pagado" : "pedidos pagados"}` : "Nuevo"}</p>
    <button class="btn btn--sm btn--ghost" type="button" data-coupon-del aria-label="Borrar este código">${icon("trash")}</button>
  </li>`;
}

async function renderCouponsAdmin() {
  const host = $("[data-coupons-admin]", sitePanel);
  if (!host) return;
  const { coupons, uses = {} } = await data.coupons();
  const today = todayAR();
  const rows = coupons.length ? coupons : [{ code: "", percent: "", active: true }];
  host.innerHTML = `
    <div class="admin-head admin-head--sep" id="sitio-codigos">
      <div>
        <h2 class="h3">Códigos de descuento</h2>
        <p class="muted">La clienta escribe el código en el carrito y se le descuenta ese porcentaje de las prendas (el envío no cambia). Mercado Pago cobra el total con el descuento. Las fechas son opcionales: sin «hasta», el código sirve hasta que lo desactives. Hoy es ${today.split("-").reverse().join("/")}.</p>
      </div>
    </div>
    <form class="admin-form" data-coupons-form novalidate>
      <ol class="admin-coupons" role="list" data-coupon-list>${rows.map((c, i) => couponRow(c, i, uses)).join("")}</ol>
      <p><button class="btn btn--sm" type="button" data-coupon-add>${icon("plus")}Agregar otro código</button></p>
      <p class="hint">Para que un código deje de funcionar, destildá «Activo» (así queda el registro de cuántas veces se usó) o borralo. Hasta ${MAX_COUPONS} códigos.</p>
      <div class="notice notice--danger form-errors" role="alert" data-coupons-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar códigos</button>
      </div>
    </form>`;
  const form = $("[data-coupons-form]", host);
  let next = rows.length;
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-coupon-add]")) {
      $("[data-coupon-list]", form).insertAdjacentHTML("beforeend", couponRow({ code: "", percent: "", active: true }, next++, {}));
      $$("[data-coupon-row]", form).at(-1).querySelector("[name=code]").focus();
    }
    const del = e.target.closest("[data-coupon-del]");
    if (del) del.closest("[data-coupon-row]").remove();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveCouponsForm(form);
  });
}

async function saveCouponsForm(form) {
  const errEl = $("[data-coupons-errors]", form);
  const list = $$("[data-coupon-row]", form).map((li) => ({
    code: $("[name=code]", li).value,
    percent: $("[name=percent]", li).value === "" ? NaN : Number($("[name=percent]", li).value),
    startsOn: $("[name=startsOn]", li).value,
    endsOn: $("[name=endsOn]", li).value,
    active: $("[name=active]", li).checked,
  }));
  const { errors } = normalizeCoupons(list);
  if (errors.length) return (errEl.innerHTML = errors.map(escapeHtml).join("<br>"));
  errEl.textContent = "";
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    await data.saveCoupons(list);
    toast(`Códigos guardados${SERVER ? ". Ya se pueden usar en el carrito." : " en este navegador."}`, "success");
    renderCouponsAdmin();
    renderPopupAdmin(); // la lista de códigos de la ventana
  } catch (err) {
    errEl.textContent = errText(err, "No se pudieron guardar los códigos.");
    btn.disabled = false;
  }
}

/* ======================= Sitio: fotos del inicio ======================= */
const SLOT_HINTS = {
  hero: "Las fotos grandes de arriba de todo, a todo el ancho. Pasan solas cada unos segundos y con las flechas. Cargá de 1 a 4; las que no tienen foto no se muestran. Si no cargás ninguna, pasan tus diseños publicados (primero los que tienen «Foto con modelo»). Quedan mejor horizontales o con bastante fondo a la izquierda, porque ahí va el título.",
  lookbook: "Los dos cuadros grandes de «Colecciones», al lado del bloque del editor. Si un cuadro no tiene foto, muestra solo una de tus colecciones con su primer diseño. Poné en el enlace la colección, por ejemplo disenos.html?coleccion=… (lo copiás de la barra del navegador en la página Diseños).",
};
const SLOT_ITEM = { hero: "Foto", lookbook: "Colección" };
const FIELD_PLACEHOLDERS = {
  hero: { kicker: "Ej.: Colección Atardecer · nueva", caption: "Ej.: Diseños que se usan", text: "Ej.: Dibujados y estampados en nuestro taller.", button: "Ej.: Ver la colección" },
  lookbook: { kicker: "Ej.: Atardecer", caption: "Ej.: Colores de fin de tarde", button: "Ej.: Ver colección" },
};

async function renderHomeImages() {
  const host = $("[data-home-images]", sitePanel);
  if (!host) return;
  const imgs = await data.homeImages();
  const slotRow = (key, i, it, slot) => {
    const id = `hi-${key}-${i}`;
    const ph = FIELD_PLACEHOLDERS[key] || {};
    return `<li class="admin-home__slot" data-slot="${key}" data-i="${i}">
      <div class="admin-home__thumb">${it.photo ? `<img data-thumb alt="Foto actual">` : `<span class="hint">Sin foto</span>`}</div>
      <div class="admin-home__fields">
        <p class="label">${SLOT_ITEM[key] || "Foto"} ${i + 1}</p>
        <div class="field"><label for="${id}-file">${it.photo ? "Cambiar foto" : "Subir foto"}</label>
          <input class="input" id="${id}-file" name="photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></div>
        ${it.photo ? `<label class="check"><input type="checkbox" name="removePhoto"> Quitar esta foto</label>` : ""}
        ${slot.fields
          .map(
            (f) => `<div class="field"><label for="${id}-${f}">${FIELD_LABELS[f]} (opcional)</label>
          <input class="input" id="${id}-${f}" name="${f}" maxlength="${FIELD_LIMITS[f]}" value="${escapeHtml(it[f])}" placeholder="${escapeHtml(ph[f] || "")}"></div>`
          )
          .join("")}
        <div class="field"><label for="${id}-link">Enlace del botón (opcional)</label>
          <input class="input" id="${id}-link" name="link" value="${escapeHtml(it.link)}" placeholder="Ej.: disenos.html"></div>
      </div>
    </li>`;
  };
  host.innerHTML = `
    <div class="admin-head admin-head--sep" id="sitio-fotos">
      <div>
        <h2 class="h3">Fotos del inicio</h2>
        <p class="muted">Las fotos de la portada y de las colecciones del inicio, con sus textos. Antes de subirlas las achicamos a 1600 px. Las fotos de «Nuevos diseños» son la «Foto con modelo» de cada diseño, en la pestaña Diseños.</p>
      </div>
    </div>
    <form class="admin-form" data-home-form novalidate>
      ${Object.entries(HOME_IMAGE_SLOTS)
        .map(
          ([key, slot]) => `<fieldset class="field">
            <legend>${escapeHtml(slot.title)}</legend>
            <p class="hint">${SLOT_HINTS[key] || ""}</p>
            <ol class="admin-home" role="list">${imgs[key].map((it, i) => slotRow(key, i, it, slot)).join("")}</ol>
          </fieldset>`
        )
        .join("")}
      <div class="notice notice--danger form-errors" role="alert" data-home-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar fotos</button>
      </div>
    </form>`;
  for (const [key, list] of Object.entries(imgs)) {
    list.forEach((it, i) => {
      const img = $(`[data-slot="${key}"][data-i="${i}"] [data-thumb]`, host);
      if (img && it.photo) modelPhotoUrl({ modelPhoto: it.photo }).then((u) => u && (img.src = u));
    });
  }
}

async function saveHomeImagesForm(form) {
  const errEl = $("[data-home-errors]", form);
  errEl.textContent = "";
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const changes = {};
    for (const li of $$("[data-slot]", form)) {
      const key = li.dataset.slot;
      const file = $("[name=photo]", li).files[0];
      (changes[key] ||= [])[Number(li.dataset.i)] = {
        ...Object.fromEntries(HOME_IMAGE_SLOTS[key].fields.map((f) => [f, $(`[name=${f}]`, li).value])),
        link: $("[name=link]", li).value,
        photo: file ? await preparePhoto(file) : undefined,
        removePhoto: !!$("[name=removePhoto]", li)?.checked,
      };
    }
    // Mismas reglas que el servidor, antes de subir nada.
    const { errors } = normalizeHomeImages(changes);
    if (errors.length) {
      errEl.innerHTML = errors.map(escapeHtml).join("<br>");
      btn.disabled = false;
      return;
    }
    await data.saveHomeImages(changes);
    toast(`Fotos del inicio guardadas${SERVER ? ". En la tienda se ven en un minuto como mucho." : " en este navegador."}`, "success");
    renderHomeImages();
  } catch (err) {
    errEl.textContent = errText(err, "No se pudieron guardar las fotos.");
    btn.disabled = false;
  }
}

sitePanel.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.closest("[data-home-form]")) return saveHomeImagesForm(e.target.closest("[data-home-form]"));
  if (e.target.closest("[data-popup-form]")) return savePopupForm(e.target.closest("[data-popup-form]"));
  const form = e.target.closest("[data-announce-form]");
  if (!form) return;
  const errEl = $("[data-announce-errors]", form);
  const raw = {
    enabled: form.enabled.checked,
    style: form.style.value,
    messages: $$("input[name=text]", form).map((t, i) => ({ text: t.value, link: $$("input[name=link]", form)[i].value })),
  };
  const { errors } = normalizeAnnouncement(raw);
  if (errors.length) {
    errEl.innerHTML = errors.map(escapeHtml).join("<br>");
    return;
  }
  errEl.textContent = "";
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const saved = await data.saveAnnouncement(raw);
    toast(
      saved.enabled
        ? `Cintillo guardado${SERVER ? ". En la tienda se ve en un minuto como mucho." : " en este navegador."}`
        : `Cintillo apagado${SERVER ? ". Deja de verse en un minuto como mucho." : "."}`,
      "success"
    );
    renderSite();
  } catch (err) {
    errEl.textContent = errText(err, "No se pudo guardar el cintillo.");
    btn.disabled = false;
  }
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
  resetCollections();
  removeKey(ANNOUNCEMENT_KEY);
  removeKey(POPUP_KEY);
  removeKey(DEMO_COUPONS_KEY);
  resetSiteContent();
  clearOrders();
  editingDesign = null;
  editingCollection = null;
  creatingProduct = false;
  renderAll();
  toast("Datos de demostración restablecidos.", "success");
});

async function renderAll() {
  await renderProducts(); // primero: los diseños nombran productos
  await renderDesigns();
  await renderSite();
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
