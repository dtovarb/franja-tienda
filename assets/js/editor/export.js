/**
 * Exportaciones: vista previa, archivo de impresión, diseño editable y
 * paquete ZIP. Todo se genera en el navegador a partir del JSON del diseño,
 * nunca a partir de lo que se ve en pantalla: la resolución de exportación
 * es independiente de la del editor.
 */
/* global fabric */
import { STAGE, garmentSvg, garmentPhoto, getPrintSpec, faceLabel, editorWindow } from "../data/garments.js";
import { getColor } from "../data/catalog.js";
import { getTechnique } from "../core/pricing.js";
import { getAssets } from "../core/asset-store.js";
import { DESIGN_SCHEMA } from "../core/designs.js";
import { slugify, round } from "../core/format.js";
import { staticCanvasFor, enliven, hydrate } from "./serialize.js";
import { setPngDpi, makeZip } from "./zip.js";

const canvasToBlob = (canvas, type = "image/png", q) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo generar la imagen (¿demasiado grande?)."))), type, q)
  );

function loadBitmap(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

function loadSvgImage(svgString, w, h) {
  const withSize = svgString.replace("<svg ", `<svg width="${w}" height="${h}" `);
  const url = URL.createObjectURL(new Blob([withSize], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error("No se pudo dibujar el mockup."));
    img.src = url;
  });
}

/* ---------------- Resolución ---------------- */

/** DPI efectivo de una imagen tal como quedó ubicada en la prenda. */
export function effectiveDpi(o, cmPerUnit) {
  if (o.isVector) return Infinity;
  const widthCm = o.width * Math.abs(o.scaleX) * cmPerUnit;
  const heightCm = o.height * Math.abs(o.scaleY) * cmPerUnit;
  const dx = o.srcWidth / (widthCm / 2.54);
  const dy = o.srcHeight / (heightCm / 2.54);
  return Math.round(Math.min(dx, dy));
}

export function dpiLevel(dpi, technique = getTechnique()) {
  if (dpi === Infinity) return "vector";
  if (dpi >= technique.idealDpi) return "good";
  if (dpi >= technique.minDpi) return "fair";
  return "low";
}

/** Informe de resolución de todas las imágenes de todas las caras. */
export function resolutionReport(productType, faces, sizeId) {
  const tech = getTechnique();
  const rows = [];
  for (const [face, objs] of Object.entries(faces)) {
    const { cmPerUnit } = getPrintSpec(productType, face, sizeId);
    for (const o of objs) {
      if (o.type !== "image") continue;
      const dpi = effectiveDpi(o, cmPerUnit);
      rows.push({
        face,
        name: o.assetName,
        assetId: o.assetId,
        dpi,
        level: dpiLevel(dpi, tech),
        widthCm: round(o.width * Math.abs(o.scaleX) * cmPerUnit),
        heightCm: round(o.height * Math.abs(o.scaleY) * cmPerUnit),
      });
    }
  }
  return rows;
}

/* ---------------- Vista previa ---------------- */

export async function renderPreview({ productType, colorHex, colorId = null, face, objects, scale = 1.2, background = "#f5f5f3", type = "image/png", quality }) {
  const W = Math.round(STAGE.width * scale);
  const H = Math.round(STAGE.height * scale);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
  }
  const photo = garmentPhoto(productType, face, colorId);
  // Zonas chicas (logos, mangas, etiqueta): la vista previa es un acercamiento, como en el editor.
  const win = editorWindow(productType, face);
  const k = W / win.w; // píxeles por unidad del escenario
  const draw = async (layer, op = "source-over") => {
    // Las fotos se dibujan directo: una <image> dentro de un SVG cargado como imagen no se descarga.
    const { img, url } = photo
      ? { img: await loadBitmap(photo[layer]), url: null }
      : await loadSvgImage(garmentSvg(productType, face, colorHex, { layer, viewBox: win }), W, H);
    ctx.globalCompositeOperation = op;
    if (photo) {
      const u = img.naturalWidth / STAGE.width; // píxeles de la foto por unidad del escenario
      ctx.drawImage(img, win.x * u, win.y * u, win.w * u, win.h * u, 0, 0, W, H);
    } else ctx.drawImage(img, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    if (url) URL.revokeObjectURL(url);
  };
  await draw("base");
  if (objects.length) {
    const sc = await staticCanvasFor(objects, { width: W, height: H, viewportTransform: [k, 0, 0, k, -win.x * k, -win.y * k] });
    ctx.drawImage(sc.lowerCanvasEl, 0, 0);
    sc.dispose();
  }
  // Sombras y brillos de la tela encima del diseño, igual que en el editor.
  await draw("shade", "multiply");
  await draw("light", "screen");
  return canvasToBlob(out, type, quality);
}

/* ---------------- Archivo de impresión ---------------- */

/**
 * Exporta SOLO el área imprimible (o el contenido recortado), sin mockup,
 * guías ni controles, con fondo transparente y DPI declarado en el PNG.
 * @param sizeId talle del pedido: define la medida en cm del archivo
 * @param mode "area" | "content"
 */
export async function renderPrintFile({ productType, face, sizeId, objects, dpi = 300, mode = "area" }) {
  const spec = getPrintSpec(productType, face, sizeId);
  let region = { ...spec.area };

  if (mode === "content" && objects.length) {
    const live = await enliven(await hydrate(objects));
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    live.forEach((o) => {
      const r = o.getBoundingRect(true, true);
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.left + r.width);
      y2 = Math.max(y2, r.top + r.height);
    });
    const a = spec.area;
    x1 = Math.max(x1, a.x);
    y1 = Math.max(y1, a.y);
    x2 = Math.min(x2, a.x + a.w);
    y2 = Math.min(y2, a.y + a.h);
    if (x2 > x1 && y2 > y1) region = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  const widthCm = region.w * spec.cmPerUnit;
  const heightCm = region.h * spec.cmPerUnit;
  const widthPx = Math.round((widthCm / 2.54) * dpi);
  const heightPx = Math.round((heightCm / 2.54) * dpi);
  const s = widthPx / region.w;
  const sc = await staticCanvasFor(objects, {
    width: widthPx,
    height: heightPx,
    viewportTransform: [s, 0, 0, s, -region.x * s, -region.y * s],
  });
  const png = await canvasToBlob(sc.lowerCanvasEl, "image/png");
  sc.dispose();
  const blob = await setPngDpi(png, dpi);
  return { blob, widthPx, heightPx, widthCm: round(widthCm), heightCm: round(heightCm), dpi, mode, region };
}

/* ---------------- Diseño editable ---------------- */

export async function buildDesignDocument({ designId, product, variant, faces, pricing }) {
  const color = getColor(variant.colorId);
  const assetIds = [...new Set(Object.values(faces).flatMap((objs) => objs.filter((o) => o.assetId).map((o) => o.assetId)))];
  const assets = await getAssets(assetIds);
  const facesOut = {};
  for (const [face, objs] of Object.entries(faces)) {
    if (!objs.length) continue;
    const spec = getPrintSpec(product.type, face, variant.sizeId);
    facesOut[face] = {
      label: faceLabel(face),
      stage: { ...STAGE, unit: "unidad lógica" },
      printArea: spec.area,
      physical: { widthCm: spec.widthCm, heightCm: spec.heightCm, cmPerUnit: spec.cmPerUnit, sizeId: variant.sizeId },
      fabric: { version: fabric.version, objects: objs },
    };
  }
  return {
    schema: DESIGN_SCHEMA,
    designId,
    exportedAt: new Date().toISOString(),
    generator: "nevrado prototipo (navegador)",
    note: "Las imágenes se referencian por assetId (SHA-256 del original). Los binarios van en /originals.",
    product: { id: product.id, sku: product.sku, name: product.name, type: product.type },
    variant: { colorId: color.id, colorName: color.name, colorHex: color.hex, sizeId: variant.sizeId, qty: variant.qty },
    technique: getTechnique().id,
    pricing,
    faces: facesOut,
    assets: assets.map((a) => ({
      id: a.id,
      sha256: a.id,
      filename: a.name,
      mime: a.type,
      bytes: a.size,
      widthPx: a.width,
      heightPx: a.height,
      isVector: !!a.isVector,
      path: `originals/${a.id.slice(0, 12)}-${slugify(a.name)}`,
    })),
  };
}

/* ---------------- Paquete ZIP ---------------- */

export async function buildZip({ doc, previews, prints }) {
  const files = [{ name: "diseno.json", data: JSON.stringify(doc, null, 2) }];
  const originals = await getAssets(doc.assets.map((a) => a.id));
  for (const a of originals) {
    const meta = doc.assets.find((x) => x.id === a.id);
    files.push({ name: meta.path, data: a.blob }); // bytes originales, sin tocar
  }
  for (const [face, blob] of Object.entries(previews)) files.push({ name: `vista-previa/${face}.png`, data: blob });
  for (const [face, p] of Object.entries(prints)) files.push({ name: `impresion/${face}-${p.dpi}dpi-${p.widthCm}x${p.heightCm}cm.png`, data: p.blob });
  files.push({
    name: "LEEME.txt",
    data: [
      "nevrado: paquete de diseño (prototipo)",
      "",
      "diseno.json        Diseño editable (JSON de Fabric.js por cara + referencias a originales).",
      "originals/         Archivos tal como los subió el cliente (sin modificar). Verificables por SHA-256.",
      "vista-previa/      Imagen de la prenda personalizada (para el cliente).",
      "impresion/         Área imprimible sin prenda ni guías, fondo transparente, DPI declarado.",
      "",
      "La resolución exportada no garantiza calidad: revisar el informe de DPI efectivo de cada imagen.",
    ].join("\n"),
  });
  return makeZip(files);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
