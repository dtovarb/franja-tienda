/**
 * Ventana de oferta: el cartel que aparece al entrar a la tienda (una vez
 * por visita) con una oferta y un botón, por ejemplo a las prendas. Se edita
 * en el panel (pestaña «Sitio») y, con servidor, se guarda en site_settings
 * (clave 'popup'); en la demostración, en este navegador.
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */
import { safeLink } from "./announcement.js";
import { cleanPhoto } from "./home-images.js";

export const POPUP_LIMITS = { kicker: 40, title: 70, text: 220, button: 28 };
export const POPUP_LABELS = { kicker: "Línea chica de arriba", title: "Título", text: "Texto", button: "Texto del botón" };
export const POPUP_DEFAULTS = { button: "Ver productos", link: "catalogo.html" };
const TEXT_FIELDS = Object.keys(POPUP_LIMITS);

export const emptyPopup = () => ({ enabled: false, photo: null, kicker: "", title: "", text: "", button: "", link: "", updatedAt: null });

/**
 * Valida y limpia. Devuelve { value, errors }. Botón y enlace vacíos quedan
 * vacíos (se muestran «Ver productos» y catalogo.html); para prenderla hace
 * falta al menos un título o un texto.
 */
export function normalizePopup(raw) {
  const errors = [];
  const src = raw && typeof raw === "object" ? raw : {};
  const value = emptyPopup();
  for (const f of TEXT_FIELDS) {
    const v = typeof src[f] === "string" ? src[f].trim().replace(f === "text" ? /[ \t]+/g : /\s+/g, " ").replace(/\n{3,}/g, "\n\n") : "";
    if (v.length > POPUP_LIMITS[f]) errors.push(`«${POPUP_LABELS[f]}» es demasiado largo (máximo ${POPUP_LIMITS[f]} caracteres).`);
    value[f] = v.slice(0, POPUP_LIMITS[f]);
  }
  const link = safeLink(src.link);
  if (link === null) errors.push("El enlace del botón no es válido: usá una página del sitio (por ejemplo catalogo.html) o una dirección que empiece con https://.");
  value.link = link || "";
  value.photo = cleanPhoto(src.photo);
  value.enabled = !!src.enabled;
  if (value.enabled && !value.title && !value.text) errors.push("Para mostrar la ventana escribí al menos un título o un texto.");
  value.updatedAt = typeof src.updatedAt === "string" && !Number.isNaN(Date.parse(src.updatedAt)) ? src.updatedAt : null;
  return { value, errors };
}
