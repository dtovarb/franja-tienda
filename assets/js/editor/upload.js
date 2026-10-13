/**
 * Validación y almacenamiento de archivos subidos.
 *
 * Reglas:
 *  - Solo JPG, PNG y SVG. Se valida extensión, tipo MIME declarado y
 *    "magic bytes" reales del archivo (no alcanza con renombrar un .exe).
 *  - SVG: se analiza como XML y se RECHAZA si contiene scripts, manejadores
 *    on*, foreignObject, iframes o referencias externas. No se modifica el
 *    original: si es peligroso, no se acepta.
 *  - Límite de peso y de dimensiones para no colgar el navegador.
 *  - El original se guarda tal cual (mismo Blob) en IndexedDB, con su SHA-256.
 */
import { UPLOAD_LIMITS } from "./config.js";
import { sha256Hex, putAsset, cacheDisplayUrl } from "../core/asset-store.js";
import { formatBytes } from "../core/format.js";

export class UploadError extends Error {}

const ext = (name) => (name.split(".").pop() || "").toLowerCase();

async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  const text = new TextDecoder().decode(await file.slice(0, 2048).arrayBuffer()).trimStart().toLowerCase();
  if (text.startsWith("<?xml") || text.startsWith("<svg") || text.startsWith("<!--") || text.startsWith("<!doctype svg")) {
    if (text.includes("<svg")) return "image/svg+xml";
  }
  return null;
}

const UNIT_PX = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
function svgLength(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^([\d.]+)\s*(px|pt|pc|mm|cm|in)?$/i);
  if (!m) return null; // porcentajes u otras unidades: se usa viewBox
  return parseFloat(m[1]) * UNIT_PX[(m[2] || "px").toLowerCase()];
}

/** Analiza un SVG. Devuelve { width, height, renderBlob|null } o lanza UploadError. */
async function inspectSvg(file) {
  const text = await file.text();
  if (/<!ENTITY/i.test(text)) throw new UploadError("El SVG declara entidades XML. Exportalo de nuevo sin DOCTYPE personalizado.");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new UploadError("El SVG está dañado o no es un XML válido.");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") throw new UploadError("El archivo no es un SVG válido.");

  const banned = svg.querySelectorAll("script, foreignObject, iframe, embed, object, audio, video");
  if (banned.length) throw new UploadError(`El SVG contiene elementos no permitidos (${banned[0].nodeName}). Exportalo como gráfico simple.`);
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of el.attributes) {
      const n = attr.name.toLowerCase();
      const v = attr.value.trim().toLowerCase();
      if (n.startsWith("on")) throw new UploadError("El SVG contiene código ejecutable (atributos on…). No se puede usar.");
      if ((n === "href" || n === "xlink:href") && v && !v.startsWith("#") && !v.startsWith("data:image/")) {
        throw new UploadError("El SVG enlaza recursos externos (imágenes o fuentes). Incrustalos o convertí los textos a trazos.");
      }
      if (n === "style" && /url\(\s*['"]?(https?:|\/\/)/.test(v)) throw new UploadError("El SVG enlaza recursos externos en estilos.");
    }
  }
  if ([...svg.querySelectorAll("style")].some((s) => /@import|url\(\s*['"]?(https?:|\/\/)/i.test(s.textContent))) {
    throw new UploadError("El SVG importa estilos o fuentes externas.");
  }

  let w = svgLength(svg.getAttribute("width"));
  let h = svgLength(svg.getAttribute("height"));
  const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0;
  let renderBlob = null;
  if (!w || !h) {
    if (!hasVb) throw new UploadError("El SVG no indica su tamaño (width/height ni viewBox).");
    // Copia DERIVADA solo para mostrar: se agregan width/height. El original no se toca.
    const ratio = vb[2] / vb[3];
    w = w || (h ? h * ratio : 1000 * Math.min(1, ratio));
    h = h || w / ratio;
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", String(Math.round(w)));
    clone.setAttribute("height", String(Math.round(h)));
    if (!clone.getAttribute("preserveAspectRatio")) clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    renderBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  }
  return { width: Math.round(w), height: Math.round(h), renderBlob };
}

function decode(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new UploadError("El navegador no pudo leer la imagen. Puede estar dañada."));
    img.src = url;
  });
}

/**
 * Valida un archivo, lo guarda como original y devuelve el registro
 * { id, name, type, size, width, height, isVector, displayUrl }.
 */
export async function processUpload(file) {
  const L = UPLOAD_LIMITS;
  if (!file || !file.size) throw new UploadError("El archivo está vacío.");
  const e = ext(file.name);
  const allowedExt = Object.values(L.accept).flatMap((a) => a.ext);
  if (!allowedExt.includes(e)) throw new UploadError(`Formato .${e || "?"} no admitido. Usá JPG, PNG o SVG.`);
  if (file.size > L.maxBytes) throw new UploadError(`El archivo pesa ${formatBytes(file.size)}. El máximo es ${formatBytes(L.maxBytes)}.`);

  const real = await sniff(file);
  if (!real) throw new UploadError("El contenido del archivo no corresponde a una imagen JPG, PNG o SVG.");
  if (!L.accept[real].ext.includes(e)) {
    throw new UploadError(`El archivo dice ser .${e} pero en realidad es ${L.accept[real].label}. Renombralo o exportalo de nuevo.`);
  }

  const isVector = real === "image/svg+xml";
  let width, height, renderBlob = null;
  if (isVector) ({ width, height, renderBlob } = await inspectSvg(file));

  const displayUrl = URL.createObjectURL(renderBlob || file);
  try {
    const img = await decode(displayUrl);
    if (!isVector) {
      width = img.naturalWidth;
      height = img.naturalHeight;
    }
  } catch (err) {
    URL.revokeObjectURL(displayUrl);
    throw err;
  }
  if (!isVector) {
    if (width < L.minSide || height < L.minSide) {
      URL.revokeObjectURL(displayUrl);
      throw new UploadError(`La imagen mide ${width}×${height} px: es demasiado chica para imprimir (mínimo ${L.minSide} px).`);
    }
    if (width > L.maxSide || height > L.maxSide || width * height > L.maxPixels) {
      URL.revokeObjectURL(displayUrl);
      throw new UploadError(`La imagen mide ${width}×${height} px y supera lo que el navegador puede procesar (máx. ${L.maxSide} px por lado).`);
    }
  }

  const id = await sha256Hex(file);
  // Se guarda el File original sin transformar. `renderBlob` es solo para mostrar.
  await putAsset({ id, blob: file, renderBlob, name: file.name, type: real, size: file.size, width, height, isVector, lastModified: file.lastModified });
  cacheDisplayUrl(id, displayUrl);
  return { id, name: file.name, type: real, size: file.size, width, height, isVector, displayUrl };
}
