/**
 * Fotos del inicio: las imágenes que la dueña cambia desde el panel
 * (pestaña «Sitio») para la portada y el lookbook. Con servidor se guardan
 * en site_settings (clave 'home_images'); en la demostración, en este
 * navegador. Un lugar sin foto muestra lo de siempre (las prendas de muestra).
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */
import { safeLink } from "./announcement.js";

export const HOME_IMAGE_SLOTS = {
  hero: { title: "Portada", count: 1 },
  lookbook: { title: "Lookbook «Ropa para compartir»", count: 3 },
};
export const MAX_CAPTION = 60;

const emptyItem = () => ({ photo: null, caption: "", link: "" });
export const emptyHomeImages = () =>
  Object.fromEntries(Object.entries(HOME_IMAGE_SLOTS).map(([k, s]) => [k, Array.from({ length: s.count }, emptyItem)]));

/** Solo lo que hace falta para mostrar la foto: con servidor `url`, en la demo `assetId`. */
function cleanPhoto(p) {
  if (!p || typeof p !== "object") return null;
  const side = (v) => (Number.isInteger(v) && v > 0 && v <= 10000 ? v : null);
  const base = { name: String(p.name || "foto").slice(0, 120), width: side(p.width), height: side(p.height) };
  if (typeof p.url === "string" && /^(https:\/\/|\/)/.test(p.url) && !p.url.startsWith("//")) {
    return { url: p.url, ...base, sha256: typeof p.sha256 === "string" ? p.sha256 : null, mime: p.mime || null, bytes: Number.isInteger(p.bytes) ? p.bytes : null };
  }
  if (typeof p.assetId === "string" && /^[a-f0-9]{64}$/.test(p.assetId)) return { assetId: p.assetId, ...base };
  return null;
}

/**
 * Valida y limpia. Devuelve { value, errors }: siempre con todos los lugares
 * (los que faltan quedan vacíos), textos recortados y enlaces seguros.
 */
export function normalizeHomeImages(raw) {
  const errors = [];
  const src = raw && typeof raw === "object" ? raw : {};
  const value = emptyHomeImages();
  for (const [key, slot] of Object.entries(HOME_IMAGE_SLOTS)) {
    const list = Array.isArray(src[key]) ? src[key] : [];
    for (let i = 0; i < slot.count; i++) {
      const it = list[i] && typeof list[i] === "object" ? list[i] : {};
      const where = slot.count > 1 ? `${slot.title}, foto ${i + 1}` : slot.title;
      const caption = typeof it.caption === "string" ? it.caption.trim().replace(/\s+/g, " ") : "";
      if (caption.length > MAX_CAPTION) errors.push(`${where}: el texto es demasiado largo (máximo ${MAX_CAPTION} caracteres).`);
      const link = safeLink(it.link);
      if (link === null) errors.push(`${where}: el enlace no es válido. Usá una página del sitio (por ejemplo disenos.html) o una dirección que empiece con https://.`);
      value[key][i] = { photo: cleanPhoto(it.photo), caption: caption.slice(0, MAX_CAPTION), link: link || "" };
    }
  }
  return { value, errors };
}
