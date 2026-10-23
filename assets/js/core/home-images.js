/**
 * Fotos del inicio: las imágenes que la dueña cambia desde el panel
 * (pestaña «Sitio») para la portada y las colecciones del inicio. Con servidor se guardan
 * en site_settings (clave 'home_images'); en la demostración, en este
 * navegador. Un lugar sin foto muestra lo de siempre (las prendas de muestra).
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */
import { safeLink } from "./announcement.js";

/**
 * Lugares con foto. `fields`: los textos que la dueña escribe en cada uno
 * (además de la foto y el enlace). La clave 'lookbook' quedó del inicio
 * anterior: ahora son las dos colecciones del mosaico.
 */
export const HOME_IMAGE_SLOTS = {
  hero: { title: "Portada: fotos que pasan con flechas", count: 4, fields: ["kicker", "caption", "text", "button"] },
  lookbook: { title: "Colecciones del inicio", count: 2, fields: ["kicker", "caption", "button"] },
};
/** Máximo de caracteres por texto. `caption` es el título. */
export const FIELD_LIMITS = { kicker: 40, caption: 70, text: 160, button: 28 };
export const FIELD_LABELS = { kicker: "Línea chica de arriba", caption: "Título", text: "Texto", button: "Texto del botón" };
const TEXT_FIELDS = Object.keys(FIELD_LIMITS);

const emptyItem = () => ({ photo: null, kicker: "", caption: "", text: "", button: "", link: "" });
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
      const texts = {};
      for (const f of TEXT_FIELDS) {
        const v = typeof it[f] === "string" ? it[f].trim().replace(/\s+/g, " ") : "";
        if (v.length > FIELD_LIMITS[f]) errors.push(`${where}: «${FIELD_LABELS[f]}» es demasiado largo (máximo ${FIELD_LIMITS[f]} caracteres).`);
        texts[f] = v.slice(0, FIELD_LIMITS[f]);
      }
      const link = safeLink(it.link);
      if (link === null) errors.push(`${where}: el enlace no es válido. Usá una página del sitio (por ejemplo disenos.html) o una dirección que empiece con https://.`);
      value[key][i] = { photo: cleanPhoto(it.photo), ...texts, link: link || "" };
    }
  }
  return { value, errors };
}
