/**
 * Editor de prendas — punto de entrada.
 *
 * Responsabilidades de este módulo: estado del editor, canvas Fabric.js,
 * escalado responsive, guías del área imprimible, historial, caras,
 * autoguardado y atajos. Paneles y finalización viven en módulos aparte.
 */
/* global fabric */
import { injectSprite, toast, confirmDialog, icon } from "../core/ui.js";
import { getProduct, getColor, defaultVariant, validateVariant } from "../data/catalog.js";
import { STAGE, garmentSvg, getPrintSpec, faceLabel, luminance } from "../data/garments.js";
import { computePrice } from "../core/pricing.js";
import { getDesign, saveDesign } from "../core/designs.js";
import { getItem } from "../core/cart.js";
import { params, debounce, uid, formatPrice, escapeHtml } from "../core/format.js";
import { CUSTOM_PROPS, FONTS } from "./config.js";
import { History } from "./history.js";
import { snapshot, restoreInto, boundsOf, isInside } from "./serialize.js";
import { processUpload, UploadError } from "./upload.js";
import { createProps } from "./props.js";
import { createLayers } from "./layers.js";
import { renderProductPanel } from "./product-panel.js";
import { openFinalize } from "./finalize.js";

injectSprite();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = $("[data-editor]");
const isMobile = () => matchMedia("(max-width: 900px)").matches;

/* ======================= Estado ======================= */
const q = params();
const sourceDesign = q.get("design") ? getDesign(q.get("design")) : null;
const product = getProduct(sourceDesign?.productId || q.get("product"));

function fatal(msg) {
  $("[data-loading]").innerHTML = `<div class="notice notice--danger" style="max-width:420px">${icon("alert")}<div><b>${escapeHtml(msg)}</b><br><a href="catalogo.html">Volver al catálogo</a></div></div>`;
  root.setAttribute("aria-busy", "false");
}

if (!product) {
  fatal(q.get("design") ? "No encontramos ese diseño en este navegador." : "No se indicó una prenda válida.");
  throw new Error("Editor sin producto");
}
if (!window.fabric) {
  fatal("No se pudo cargar el motor del editor (Fabric.js). Revisá que la carpeta vendor/ esté completa.");
  throw new Error("Fabric.js no disponible");
}

function initialVariant() {
  const item = q.get("item") ? getItem(q.get("item")) : null;
  if (item) return { colorId: item.variant.colorId, sizeId: item.variant.sizeId, qty: item.qty };
  if (sourceDesign?.variant) return { ...sourceDesign.variant };
  const def = defaultVariant(product);
  const v = { colorId: q.get("color") || def.colorId, sizeId: q.get("size") || def.sizeId, qty: parseInt(q.get("qty"), 10) || 1 };
  const check = validateVariant(product, v);
  if (!check.ok) {
    toast(`Ajustamos la selección: ${check.errors.join(" ")}`, "warning", 6000);
    return def;
  }
  return check.variant;
}

export const ed = {
  product,
  variant: initialVariant(),
  face: product.faces[0],
  faces: Object.fromEntries(product.faces.map((f) => [f, sourceDesign?.faces?.[f]?.objects || sourceDesign?.faces?.[f] || []])),
  histories: Object.fromEntries(product.faces.map((f) => [f, new History()])),
  // Al editar desde el carrito se trabaja sobre una COPIA: si no se finaliza,
  // el artículo del carrito conserva su diseño anterior intacto.
  designId: q.get("item") ? null : sourceDesign?.id || null,
  cartItemId: q.get("item") || null,
  replacesDesignId: q.get("item") ? sourceDesign?.id : null,
  restoring: false,
  canvas: null,
  zoom: 1,
  uploads: new Map(),
};
// Normaliza: faces[f] siempre es un array de objetos serializados
for (const f of product.faces) if (!Array.isArray(ed.faces[f])) ed.faces[f] = [];

export const spec = (face = ed.face) => getPrintSpec(product.type, face);
export const color = () => getColor(ed.variant.colorId);
export const printedFaces = () => product.faces.filter((f) => (f === ed.face ? ed.canvas.getObjects().length : ed.faces[f].length) > 0);
export const price = () => computePrice(product, ed.variant, { printedFaces: printedFaces() });

/* ======================= Fabric ======================= */
const BRAND = "#A50062";
// Precisión del JSON: por defecto Fabric redondea a 2 decimales (p. ej. una
// escala 0.0896 pasaría a 0.09), lo que altera el tamaño impreso.
fabric.Object.NUM_FRACTION_DIGITS = 6;
const DANGER = "#B3261E";
fabric.Object.prototype.set({
  originX: "center",
  originY: "center",
  transparentCorners: false,
  cornerColor: "#ffffff",
  cornerStrokeColor: BRAND,
  borderColor: BRAND,
  cornerStyle: "circle",
  cornerSize: 14,
  touchCornerSize: 40,
  padding: 6,
  borderScaleFactor: 2,
  lockSkewingX: true,
  lockSkewingY: true,
  lockScalingFlip: true,
  minScaleLimit: 0.02,
});
// Escalado siempre proporcional: se ocultan los tiradores laterales.
["ml", "mr", "mt", "mb"].forEach((k) => (fabric.Object.prototype.controls[k].visible = false));
fabric.Object.prototype.controls.mtr.offsetY = -34;

const canvas = new fabric.Canvas("design-canvas", {
  preserveObjectStacking: true,
  uniformScaling: true,
  uniScaleKey: null,
  selectionColor: "rgba(165,0,98,.08)",
  selectionBorderColor: BRAND,
  selectionLineWidth: 1.5,
  controlsAboveOverlay: true,
  stopContextMenu: true,
  targetFindTolerance: 10,
});
ed.canvas = canvas;

/* ======================= Layout responsive ======================= */
const stageWrap = $("[data-stage-wrap]");
const stage = $("[data-stage]");
const mockupEl = $("[data-mockup]");
const guidesEl = $("[data-guides]");

function layout() {
  const cs = getComputedStyle(stageWrap);
  const availW = stageWrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stageWrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (availW <= 0 || availH <= 0) return;
  const z = Math.min(availW / STAGE.width, availH / STAGE.height);
  const w = Math.floor(STAGE.width * z);
  const h = Math.floor(STAGE.height * z);
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  canvas.setDimensions({ width: w, height: h });
  ed.zoom = w / STAGE.width;
  canvas.setZoom(ed.zoom);
  canvas.calcOffset();
  positionOverlays();
}
new ResizeObserver(() => requestAnimationFrame(layout)).observe(stageWrap);

function renderMockup() {
  mockupEl.innerHTML = garmentSvg(product.type, ed.face, color().hex);
}

function renderGuides() {
  const s = spec();
  const a = s.area;
  const cx = a.x + a.w / 2;
  const label = `ÁREA DE IMPRESIÓN · ${s.widthCm} × ${s.heightCm} CM`;
  guidesEl.setAttribute("viewBox", `0 0 ${STAGE.width} ${STAGE.height}`);
  guidesEl.innerHTML = `
    <line class="center-v" x1="${cx}" y1="${a.y}" x2="${cx}" y2="${a.y + a.h}"/>
    <rect class="area" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/>
    <rect class="area-label-bg" x="${a.x}" y="${a.y - 30}" width="${label.length * 12.2 + 12}" height="26"/>
    <text class="area-label" x="${a.x + 6}" y="${a.y - 10}">${label}</text>`;
}

/* ======================= Área imprimible ======================= */
const statusEl = $("[data-stage-status]");

export function checkBounds() {
  const area = spec().area;
  let out = 0;
  canvas.getObjects().forEach((o) => {
    const inside = isInside(boundsOf(o), area);
    o.outOfArea = !inside;
    o.set({ borderColor: inside ? BRAND : DANGER, cornerStrokeColor: inside ? BRAND : DANGER });
    if (!inside) out++;
  });
  guidesEl.dataset.out = String(out > 0);
  renderStatus(out);
  return out;
}

function renderStatus(out) {
  if (!out) {
    statusEl.innerHTML = "";
    return;
  }
  statusEl.innerHTML = `
    <div class="notice notice--danger" role="alert">${icon("alert")}
      <span><b>${out === 1 ? "Un elemento sale" : `${out} elementos salen`} del área de impresión.</b> Lo que quede afuera no se imprime.</span>
      <button class="btn btn--sm btn--dark" type="button" data-action="fit-all">Ajustar</button>
    </div>`;
}

/** Escala (si hace falta) y mueve el objeto para que quede dentro del área. */
export function fitToArea(o) {
  const a = spec().area;
  let b = boundsOf(o);
  if (b.w > a.w || b.h > a.h) {
    const k = Math.min(a.w / b.w, a.h / b.h) * 0.98;
    o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
    b = boundsOf(o);
  }
  let dx = 0, dy = 0;
  if (b.x < a.x) dx = a.x - b.x;
  if (b.x + b.w > a.x + a.w) dx = a.x + a.w - (b.x + b.w);
  if (b.y < a.y) dy = a.y - b.y;
  if (b.y + b.h > a.y + a.h) dy = a.y + a.h - (b.y + b.h);
  o.set({ left: o.left + dx, top: o.top + dy });
  o.setCoords();
}

/* ======================= Overlays (toolbar contextual / vacío) ======================= */
const ctxEl = $("[data-ctx]");
const emptyEl = $("[data-empty]");
let transforming = false;

function positionOverlays() {
  const a = spec().area;
  const z = ed.zoom;
  const isEmpty = canvas.getObjects().length === 0;
  emptyEl.hidden = !isEmpty;
  if (isEmpty) {
    emptyEl.style.left = `${(a.x + a.w / 2) * z}px`;
    emptyEl.style.top = `${(a.y + a.h / 2) * z}px`;
  }
  const act = canvas.getActiveObject();
  if (!act || transforming || act.isEditing) {
    ctxEl.hidden = true;
    return;
  }
  const r = act.getBoundingRect(); // en píxeles de pantalla
  ctxEl.hidden = false;
  let top = r.top - 46;
  if (top < 30) top = r.top + r.height + 54;
  const left = Math.min(Math.max(r.left + r.width / 2, 70), stage.clientWidth - 70);
  ctxEl.style.left = `${left}px`;
  ctxEl.style.top = `${Math.min(top, stage.clientHeight + 30)}px`;
}

/* ======================= Historial y guardado ======================= */
const saveStatus = $("[data-save-status]");
const undoBtn = $('[data-action="undo"]');
const redoBtn = $('[data-action="redo"]');

export function commit() {
  if (ed.restoring) return;
  const snap = snapshot(canvas);
  ed.faces[ed.face] = snap;
  if (ed.histories[ed.face].push(snap)) scheduleSave();
  refresh();
}
export const commitSoon = debounce(commit, 350);

function persist() {
  try {
    const doc = saveDesign({
      id: ed.designId,
      productId: product.id,
      variant: ed.variant,
      faces: Object.fromEntries(Object.entries(ed.faces).map(([f, objs]) => [f, { objects: objs }])),
      status: "draft",
      basedOn: ed.replacesDesignId || null,
    });
    if (!ed.designId) {
      ed.designId = doc.id;
      const url = new URL(location.href);
      url.searchParams.set("design", doc.id);
      history.replaceState(null, "", url);
    }
    const t = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    saveStatus.dataset.state = "saved";
    saveStatus.textContent = `Borrador guardado en este navegador · ${t}`;
    saveStatus.title = "Se guarda solo en este navegador. No se envía a ningún servidor.";
  } catch (err) {
    saveStatus.dataset.state = "error";
    saveStatus.textContent = "No se pudo guardar el borrador";
    toast(err.message, "error", 7000);
  }
}
export const scheduleSave = debounce(persist, 500);

async function applyHistoryState(objs) {
  ed.restoring = true;
  try {
    await restoreInto(canvas, objs);
    ed.faces[ed.face] = objs;
  } catch (err) {
    toast(err.message, "error");
  } finally {
    ed.restoring = false;
  }
  refresh();
  scheduleSave();
}

export function undo() {
  const s = ed.histories[ed.face].undo();
  if (s) applyHistoryState(s).then(() => announce("Cambio deshecho"));
}
export function redo() {
  const s = ed.histories[ed.face].redo();
  if (s) applyHistoryState(s).then(() => announce("Cambio rehecho"));
}

function announce(msg) {
  saveStatus.textContent = msg;
  saveStatus.dataset.state = "";
  setTimeout(() => scheduleSave(), 900);
}

/* ======================= Caras ======================= */
const facesEl = $("[data-faces]");
function renderFaceButtons() {
  facesEl.innerHTML = product.faces
    .map((f) => {
      const has = (f === ed.face ? canvas.getObjects().length : ed.faces[f].length) > 0;
      return `<button type="button" data-face="${f}" aria-pressed="${f === ed.face}" class="${has ? "has-content" : ""}" ${has ? `aria-label="${faceLabel(f)}, con diseño"` : ""}>${faceLabel(f)}</button>`;
    })
    .join("");
}

export async function setFace(f) {
  if (f === ed.face || !product.faces.includes(f)) return;
  ed.faces[ed.face] = snapshot(canvas);
  canvas.discardActiveObject();
  ed.face = f;
  renderMockup();
  renderGuides();
  ed.restoring = true;
  try {
    await restoreInto(canvas, ed.faces[f]);
  } catch (err) {
    toast(err.message, "error");
  } finally {
    ed.restoring = false;
  }
  refresh();
  announce(`Editando ${faceLabel(f).toLowerCase()}`);
}
facesEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-face]");
  if (b) setFace(b.dataset.face);
});

/* ======================= Agregar elementos ======================= */
const fileInput = $("[data-file-input]");
const dropzone = $("[data-dropzone]");
const uploadError = $("[data-upload-error]");

function placeImage(asset) {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(asset.displayUrl, (img) => {
      if (!img || !img.width) return reject(new UploadError("No se pudo colocar la imagen en el lienzo."));
      const a = spec().area;
      const s = Math.min((a.w * 0.8) / img.width, (a.h * 0.8) / img.height);
      img.set({
        left: a.x + a.w / 2,
        top: a.y + a.h / 2,
        scaleX: s,
        scaleY: s,
        assetId: asset.id,
        assetName: asset.name,
        srcWidth: asset.width,
        srcHeight: asset.height,
        isVector: asset.isVector,
        uid: uid("obj"),
        kind: "image",
      });
      canvas.add(img);
      canvas.setActiveObject(img);
      resolve(img);
    });
  });
}

export async function handleFiles(files) {
  uploadError.hidden = true;
  const list = [...files];
  if (!list.length) return;
  dropzone.dataset.busy = "true";
  const title = $("[data-dropzone-title]");
  const errors = [];
  for (const file of list) {
    title.textContent = `Procesando ${file.name}…`;
    try {
      const asset = await processUpload(file);
      ed.uploads.set(asset.id, asset);
      await placeImage(asset);
      commit();
      toast(`${file.name} agregada. Original guardado sin cambios.`, "success");
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof UploadError ? err.message : "no se pudo procesar el archivo."}`);
      if (!(err instanceof UploadError)) console.warn(err);
    }
  }
  title.textContent = "Subir imagen";
  dropzone.dataset.busy = "false";
  fileInput.value = "";
  if (errors.length) {
    uploadError.innerHTML = `${icon("alert")}<div>${errors.map(escapeHtml).join("<br>")}</div>`;
    uploadError.hidden = false;
    toast(errors[0], "error", 6000);
  }
  renderUploads();
  if (isMobile() && !errors.length) closeSheet();
}

fileInput.addEventListener("change", () => handleFiles(fileInput.files));
["dragenter", "dragover"].forEach((t) =>
  [dropzone, stageWrap].forEach((el) =>
    el.addEventListener(t, (e) => {
      e.preventDefault();
      dropzone.dataset.over = "true";
    })
  )
);
["dragleave", "drop"].forEach((t) =>
  [dropzone, stageWrap].forEach((el) => el.addEventListener(t, () => (dropzone.dataset.over = "false")))
);
[dropzone, stageWrap].forEach((el) =>
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  })
);

function renderUploads() {
  const ul = $("[data-uploads]");
  ul.innerHTML = [...ed.uploads.values()]
    .map(
      (a) => `<li><button type="button" data-reuse="${a.id}" title="Agregar otra vez: ${escapeHtml(a.name)}" aria-label="Agregar otra vez ${escapeHtml(a.name)}">
        <img src="${a.displayUrl}" alt=""><span class="badge">${a.isVector ? "SVG" : `${a.width}px`}</span></button></li>`
    )
    .join("");
}
$("[data-uploads]").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-reuse]");
  if (!b) return;
  await placeImage(ed.uploads.get(b.dataset.reuse));
  commit();
});

export function addText(str = "TU TEXTO") {
  const a = spec().area;
  const dark = luminance(color().hex) < 0.18;
  const t = new fabric.IText(str, {
    left: a.x + a.w / 2,
    top: a.y + a.h * 0.3,
    fontFamily: FONTS[0].family,
    fontSize: 64,
    fontWeight: "normal",
    fill: dark ? "#ffffff" : "#121212",
    textAlign: "center",
    lineHeight: 1.05,
    uid: uid("obj"),
    kind: "text",
    editingBorderColor: BRAND,
    cursorColor: BRAND,
  });
  canvas.add(t);
  if (t.getScaledWidth() > a.w * 0.9) t.scale((a.w * 0.9) / t.width);
  canvas.setActiveObject(t);
  commit();
  if (isMobile()) openSheet("props");
  return t;
}

$("[data-quicktext]").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#quicktext");
  const text = input.value.trim();
  addText(text || "TU TEXTO");
  input.value = "";
});

/* ======================= Edición ======================= */
export function duplicateSelection() {
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  canvas.discardActiveObject();
  let pending = active.length;
  const clones = [];
  active.forEach((o) =>
    o.clone((c) => {
      c.set({ left: o.left + 24, top: o.top + 24, uid: uid("obj") });
      canvas.add(c);
      clones.push(c);
      if (--pending === 0) {
        canvas.setActiveObject(clones.length > 1 ? new fabric.ActiveSelection(clones, { canvas }) : clones[0]);
        commit();
        toast(clones.length > 1 ? `${clones.length} elementos duplicados` : "Elemento duplicado", "info", 2000);
      }
    }, CUSTOM_PROPS)
  );
}

export function deleteSelection() {
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  canvas.discardActiveObject();
  active.forEach((o) => canvas.remove(o));
  commit();
  toast(active.length > 1 ? `${active.length} elementos eliminados. Podés deshacer.` : "Elemento eliminado. Podés deshacer.", "info", 2500);
}

async function clearFace() {
  if (!canvas.getObjects().length) return toast("Esta cara ya está vacía.", "info");
  const ok = await confirmDialog({
    title: `¿Vaciar ${faceLabel(ed.face).toLowerCase()}?`,
    body: "Se quitan todos los elementos de esta cara. La otra cara no cambia. Podés deshacerlo con Deshacer.",
    confirmLabel: "Vaciar",
    danger: true,
  });
  if (!ok) return;
  canvas.discardActiveObject();
  canvas.remove(...canvas.getObjects());
  commit();
}

/* ======================= Paneles (sheet móvil y pestañas) ======================= */
export function openSheet(which) {
  const [panel, tab] = which.split(":");
  root.dataset.sheet = panel;
  if (tab) selectTab(tab);
  $$("[data-sheet-open]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.sheetOpen === which || (b.dataset.sheetOpen === panel && !tab))));
}
export function closeSheet() {
  root.dataset.sheet = "";
  $$("[data-sheet-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
}
$$("[data-sheet-open]").forEach((b) =>
  b.addEventListener("click", () => {
    const already = root.dataset.sheet && b.getAttribute("aria-expanded") === "true";
    already ? closeSheet() : openSheet(b.dataset.sheetOpen);
  })
);
$$("[data-close-sheet]").forEach((b) => b.addEventListener("click", closeSheet));

function selectTab(name) {
  $$("[data-tab]").forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
}
const tablist = $(".ed-tabs");
tablist.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (t) selectTab(t.dataset.tab);
});
tablist.addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const tabs = $$("[data-tab]");
  const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
  selectTab(n.dataset.tab);
  n.focus();
});

/* ======================= Barra superior / producto ======================= */
export function renderTop() {
  const c = color();
  $("[data-product-name]").textContent = product.name;
  $("[data-variant-line]").innerHTML = `<span class="swatch swatch--sm" style="--sw:${c.hex}"></span>${escapeHtml(c.name)} · Talle ${escapeHtml(ed.variant.sizeId)} · ${ed.variant.qty} u.`;
  $("[data-unit-price]").textContent = formatPrice(price().unit);
  const back = new URLSearchParams({ id: product.id, color: ed.variant.colorId, size: ed.variant.sizeId, qty: ed.variant.qty });
  $("[data-back]").href = ed.cartItemId ? "carrito.html" : `producto.html?${back}`;
  $("[data-back]").setAttribute("aria-label", ed.cartItemId ? "Volver al carrito" : "Volver a la prenda");
}

export function setVariant(patch) {
  ed.variant = { ...ed.variant, ...patch };
  if ("colorId" in patch) renderMockup();
  renderTop();
  productPanel.render();
  scheduleSave();
}

/* ======================= Refresco general ======================= */
const props = createProps({ ed, canvas, commit, commitSoon, checkBounds, fitToArea, spec, duplicateSelection, deleteSelection });
const layers = createLayers({ ed, canvas, commit, spec, openSheet, isMobile, checkBounds });
const productPanel = renderProductPanel({ ed, product, setVariant, price, printedFaces });

export function refresh() {
  checkBounds();
  undoBtn.disabled = !ed.histories[ed.face].canUndo;
  redoBtn.disabled = !ed.histories[ed.face].canRedo;
  renderFaceButtons();
  layers.render();
  props.render();
  productPanel.render();
  renderTop();
  positionOverlays();
  canvas.requestRenderAll();
}

/* ======================= Eventos del canvas ======================= */
const snapGuide = () => guidesEl;
canvas.on({
  "object:moving": (e) => {
    transforming = true;
    const o = e.target;
    const a = spec().area;
    const cx = a.x + a.w / 2;
    const near = Math.abs(o.left - cx) < 8 / ed.zoom;
    if (near && !(o.type === "activeSelection")) o.set({ left: cx });
    snapGuide().dataset.snap = String(near);
    checkBounds();
    props.sync();
  },
  "object:scaling": () => ((transforming = true), checkBounds(), props.sync()),
  "object:rotating": () => ((transforming = true), checkBounds(), props.sync()),
  "object:modified": () => {
    transforming = false;
    snapGuide().dataset.snap = "false";
    commit();
  },
  "mouse:up": () => {
    if (transforming) {
      transforming = false;
      snapGuide().dataset.snap = "false";
    }
    positionOverlays();
  },
  "selection:created": () => (props.render(true), layers.render(), positionOverlays()),
  "selection:updated": () => (props.render(true), layers.render(), positionOverlays()),
  "selection:cleared": () => (props.render(true), layers.render(), positionOverlays()),
  "after:render": () => !transforming && positionOverlays(),
  "text:changed": () => {
    props.sync();
    commitSoon();
  },
  "text:editing:entered": () => positionOverlays(),
  "text:editing:exited": (e) => {
    const t = e.target;
    if (!t.text.trim()) {
      canvas.remove(t);
      toast("Texto vacío eliminado.", "info", 2000);
    }
    commit();
  },
});

/* ======================= Acciones (delegación) ======================= */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const act = b.dataset.action;
  if (act === "undo") undo();
  else if (act === "redo") redo();
  else if (act === "duplicate") duplicateSelection();
  else if (act === "delete") deleteSelection();
  else if (act === "props") openSheet("props");
  else if (act === "clear") clearFace();
  else if (act === "pick-file") fileInput.click();
  else if (act === "add-text") addText();
  else if (act === "fit-all") {
    canvas.getObjects().forEach((o) => o.outOfArea && fitToArea(o));
    commit();
    toast("Elementos ajustados al área de impresión.", "success", 2500);
  } else if (act === "finalize") {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    ed.faces[ed.face] = snapshot(canvas);
    persist();
    openFinalize({ ed, product, price, printedFaces, setFace, refresh, persist });
  }
});

/* ======================= Teclado ======================= */
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  const inField = e.target.closest("input, textarea, select, [contenteditable='true']");
  const active = canvas.getActiveObject();
  if (active?.isEditing) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z" && !inField) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (mod && k === "y" && !inField) {
    e.preventDefault();
    redo();
  } else if (inField) {
    return;
  } else if (mod && k === "d") {
    e.preventDefault();
    duplicateSelection();
  } else if ((e.key === "Delete" || e.key === "Backspace") && active) {
    e.preventDefault();
    deleteSelection();
  } else if (active && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (k === "arrowleft") active.left -= step;
    if (k === "arrowright") active.left += step;
    if (k === "arrowup") active.top -= step;
    if (k === "arrowdown") active.top += step;
    active.setCoords();
    canvas.requestRenderAll();
    checkBounds();
    props.sync();
    commitSoon();
  } else if (e.key === "Escape" && active) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
});

/* ======================= Arranque ======================= */
async function boot() {
  const loadingText = $("[data-loading-text]");
  loadingText.textContent = "Cargando tipografías…";
  await Promise.all(
    FONTS.flatMap((f) => [document.fonts.load(`400 40px "${f.family}"`), f.bold ? document.fonts.load(`700 40px "${f.family}"`) : null]).filter(Boolean)
  ).catch(() => toast("Algunas tipografías no cargaron; se usará una alternativa.", "warning"));

  renderMockup();
  renderGuides();
  layout();
  product.faces.forEach((f) => ed.histories[f].reset(ed.faces[f]));

  if (sourceDesign) {
    loadingText.textContent = "Recuperando diseño guardado…";
    // Reconstruye los recursos subidos para la lista de "subidos"
    const { getAssets, assetDisplayUrl } = await import("../core/asset-store.js");
    const ids = [...new Set(Object.values(ed.faces).flat().filter((o) => o.assetId).map((o) => o.assetId))];
    for (const a of await getAssets(ids)) ed.uploads.set(a.id, { ...a, displayUrl: await assetDisplayUrl(a.id) });
    renderUploads();
    ed.restoring = true;
    try {
      await restoreInto(canvas, ed.faces[ed.face]);
    } catch (err) {
      toast(err.message, "error", 8000);
    } finally {
      ed.restoring = false;
    }
    if (ed.cartItemId) toast("Editando un artículo del carrito. Los cambios se aplican al finalizar.", "info", 5000);
  }
  $("[data-loading]").hidden = true;
  root.setAttribute("aria-busy", "false");
  refresh();
  if (sourceDesign && !ed.cartItemId) {
    saveStatus.dataset.state = "saved";
    saveStatus.textContent = "Borrador recuperado de este navegador";
  }
}
boot();

// Exponer para pruebas automatizadas (no se usa en la interfaz).
window.__editor = { ed, canvas, undo, redo, setFace, addText, commit, checkBounds };
