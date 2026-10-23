/**
 * Códigos de descuento: la dueña los crea en el panel (pestaña «Sitio») y la
 * clienta los escribe en el carrito. Cada código descuenta un porcentaje de
 * las prendas (el envío no) y puede tener fecha de inicio y de fin, una
 * colección (solo cuentan y se descuentan las prendas con diseños de esa
 * colección) y un mínimo de prendas. Con
 * servidor se guardan en site_settings (clave 'coupons'); en la
 * demostración, en este navegador.
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/orders.js), para calcular con las mismas reglas.
 */
export const MAX_COUPONS = 30;
export const MAX_PERCENT = 90;
export const MAX_MIN_QTY = 50;
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
    const collectionId = typeof c.collectionId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(c.collectionId) ? c.collectionId : null;
    let minQty = c.minQty === "" || c.minQty == null ? null : Number(c.minQty);
    if (minQty !== null && (!Number.isInteger(minQty) || minQty < 1 || minQty > MAX_MIN_QTY)) {
      errors.push(`${where}: el mínimo de prendas tiene que ser un número entero entre 1 y ${MAX_MIN_QTY}, o quedar vacío.`);
      minQty = null;
    }
    if (minQty === 1) minQty = null;
    value.push({ code, percent: Math.min(MAX_PERCENT, Math.max(1, Math.round(percent) || 1)), active: c.active !== false, startsOn, endsOn, collectionId, minQty });
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
  return { coupon: { code: c.code, percent: c.percent, collectionId: c.collectionId || null, minQty: c.minQty || null } };
}

/**
 * Cuánto descuenta un código en un carrito. `lines`: [{ total, qty,
 * collectionIds }] (las colecciones de los diseños de la tienda de cada
 * prenda). Devuelve { discount } o { discount: 0, missing } con lo que le falta
 * a la clienta para que valga (`coupon.collectionName` es el nombre para mostrar).
 */
export function couponDiscount(coupon, lines) {
  const name = coupon.collectionName ? `de la colección ${coupon.collectionName}` : "de esa colección";
  const eligible = coupon.collectionId ? lines.filter((l) => (l.collectionIds || []).includes(coupon.collectionId)) : lines;
  const qty = eligible.reduce((n, l) => n + l.qty, 0);
  if (!qty) return { discount: 0, missing: `El código ${coupon.code} es para prendas con diseños ${name}.` };
  if (coupon.minQty && qty < coupon.minQty) {
    const falta = coupon.minQty - qty;
    return {
      discount: 0,
      missing: `El código ${coupon.code} vale desde ${coupon.minQty} prendas${coupon.collectionId ? ` ${name}` : ""}: te ${falta === 1 ? "falta 1" : `faltan ${falta}`}.`,
    };
  }
  return { discount: discountFor(eligible.reduce((n, l) => n + l.total, 0), coupon.percent) };
}

/** Pesos que descuenta un porcentaje sobre las prendas (redondeado al peso). */
export const discountFor = (subtotal, percent) => Math.round((subtotal * percent) / 100);
