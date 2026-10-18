/**
 * Cintillo de anuncios: la franja de arriba de todo del sitio (ofertas,
 * envíos, avisos). Se edita en el panel (pestaña «Sitio») y, con servidor,
 * se guarda en la tabla site_settings, así cambia sin publicar código.
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */
export const ANNOUNCEMENT_STYLES = {
  ciruela: "Ciruela",
  terracota: "Terracota",
  tinta: "Negro",
  franjas: "Franjas de la marca",
};
export const MAX_MESSAGES = 5;
export const MAX_TEXT = 120;
export const EMPTY_ANNOUNCEMENT = { enabled: false, style: "ciruela", messages: [] };

/**
 * Enlace permitido: una página del sitio («catalogo.html», «/disenos.html?coleccion=x»,
 * «#taller») o una dirección https. Cualquier otra cosa (javascript:, http:, mailto:…) no.
 */
export function safeLink(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (s.length > 300 || /\s/.test(s)) return null;
  if (/^https:\/\/[^/]+\.[^/]+/i.test(s)) return s;
  if (/^(\/|#|[a-z0-9_-]+\.html([?#]|$))/i.test(s) && !s.startsWith("//")) return s;
  return null;
}

/**
 * Valida y limpia lo que llega del panel. Devuelve { value, errors }:
 * mensajes vacíos se descartan; un enlace raro es un error.
 */
export function normalizeAnnouncement(raw) {
  const errors = [];
  const src = raw && typeof raw === "object" ? raw : {};
  const style = Object.hasOwn(ANNOUNCEMENT_STYLES, src.style) ? src.style : "ciruela";
  const list = Array.isArray(src.messages) ? src.messages : [];
  const messages = [];
  list.forEach((m, i) => {
    const text = typeof m?.text === "string" ? m.text.trim().replace(/\s+/g, " ") : "";
    const link = safeLink(m?.link);
    if (!text) {
      if (m?.link) errors.push(`El mensaje ${i + 1} tiene enlace pero no tiene texto.`);
      return;
    }
    if (text.length > MAX_TEXT) errors.push(`El mensaje ${i + 1} es demasiado largo (máximo ${MAX_TEXT} caracteres).`);
    if (link === null) errors.push(`El enlace del mensaje ${i + 1} no es válido: usá una página del sitio (por ejemplo disenos.html) o una dirección que empiece con https://.`);
    messages.push({ text: text.slice(0, MAX_TEXT), link: link || "" });
  });
  if (messages.length > MAX_MESSAGES) errors.push(`Hay más de ${MAX_MESSAGES} mensajes.`);
  const enabled = !!src.enabled;
  if (enabled && !messages.length) errors.push("Para mostrar el cintillo escribí al menos un mensaje.");
  return { value: { enabled, style, messages: messages.slice(0, MAX_MESSAGES) }, errors };
}
