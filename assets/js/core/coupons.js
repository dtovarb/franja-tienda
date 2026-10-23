/**
 * Códigos de descuento: la dueña los crea en el panel (pestaña «Sitio») y la
 * clienta los escribe en el carrito. Cada código descuenta un porcentaje de
 * las prendas (el envío no) y puede tener fecha de inicio y de fin. Con
 * servidor se guardan en site_settings (clave 'coupons'); en la
 * demostración, en este navegador.
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/orders.js), para calcular con las mismas reglas.
 */
export const MAX_COUPONS = 30;
export const MAX_PERCENT = 90;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mayúsculas, sin espacios: «nevrado 15» → «NEVRADO15». */
export const cleanCode = (v) => (typeof v === "string" ? v.toUpperCase().replace(/\s+/g, "") : "");
export const validCode = (code) => /^[A-Z0-9_-]{3,20}$/.test(code);

/** Fecha de hoy en Argentina (AAAA-MM-DD), para comparar con desde/hasta. */
export const todayAR = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Cordoba" });

/** Valida y limpia la lista del panel. Devuelve { value, errors }; las filas sin código se descartan. */
export function normalizeCoupons(raw) {
  const errors = [];
  const list = Array.isArray(raw) ? raw : [];
  const value = [];
  const seen = new Set();
  list.forEach((c, i) => {
    if (!c || typeof c !== "object") return;
    const code = cleanCode(c.code);
    if (!code) return;
    const where = `Código ${i + 1} (${code})`;
    if (!validCode(code)) errors.push(`${where}: usá de 3 a 20 letras o números, sin espacios ni acentos.`);
    if (seen.has(code)) errors.push(`${where}: está repetido.`);
    seen.add(code);
    const percent = Number(c.percent);
    if (!Number.isInteger(percent) || percent < 1 || percent > MAX_PERCENT) errors.push(`${where}: el descuento tiene que ser un número entero entre 1 y ${MAX_PERCENT} (%).`);
    const date = (v, label) => {
      const s = typeof v === "string" ? v.trim() : "";
      if (!s) return null;
      if (!DATE.test(s) || Number.isNaN(Date.parse(s))) {
        errors.push(`${where}: la fecha «${label}» no es válida.`);
        return null;
      }
      return s;
    };
    const startsOn = date(c.startsOn, "desde");
    const endsOn = date(c.endsOn, "hasta");
    if (startsOn && endsOn && endsOn < startsOn) errors.push(`${where}: la fecha «hasta» es anterior a «desde».`);
    value.push({ code, percent: Math.min(MAX_PERCENT, Math.max(1, Math.round(percent) || 1)), active: c.active !== false, startsOn, endsOn });
  });
  if (value.length > MAX_COUPONS) errors.push(`Hay más de ${MAX_COUPONS} códigos.`);
  return { value: value.slice(0, MAX_COUPONS), errors };
}

/**
 * Busca un código para usarlo hoy. Devuelve { coupon } o { error } con el
 * mensaje para la clienta.
 */
export function findCoupon(list, rawCode, today = todayAR()) {
  const code = cleanCode(rawCode);
  if (!code) return { error: "Escribí el código." };
  const c = (list || []).find((x) => x.code === code);
  if (!c || !c.active) return { error: `El código ${code} no existe o ya no está activo.` };
  if (c.startsOn && today < c.startsOn) return { error: `El código ${code} todavía no empezó.` };
  if (c.endsOn && today > c.endsOn) return { error: `El código ${code} ya venció.` };
  return { coupon: { code: c.code, percent: c.percent } };
}

/** Pesos que descuenta un porcentaje sobre las prendas (redondeado al peso). */
export const discountFor = (subtotal, percent) => Math.round((subtotal * percent) / 100);
