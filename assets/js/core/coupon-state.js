/**
 * Código de descuento de la clienta en este navegador: el que escribió en el
 * carrito o el que trajo de la ventana de oferta. Solo se guarda el código;
 * el porcentaje se pregunta a la tienda cada vez (y el servidor lo vuelve a
 * validar al crear el pedido).
 */
import { SERVER, api } from "./api.js";
import { readJSON, writeJSON, removeKey } from "./storage.js";
import { cleanCode, findCoupon, normalizeCoupons, couponDiscount } from "./coupons.js";
import { getCart, priceItem } from "./cart.js";
import { getStoreDesign, listCollections } from "./store-designs.js";

const KEY = "cupon.v1";
/** En la demostración, los códigos que se cargan en el panel de este navegador. */
export const DEMO_COUPONS_KEY = "cupones.v1";

export const savedCouponCode = () => cleanCode(readJSON(KEY, null)?.code);

export function rememberCoupon(code) {
  try {
    writeJSON(KEY, { code: cleanCode(code) });
  } catch {
    /* sin almacenamiento: la clienta lo escribe a mano */
  }
}
export const forgetCoupon = () => removeKey(KEY);

/** Pregunta si el código sirve hoy. Devuelve { coupon: { code, percent } } o { error }. */
export async function checkCoupon(code) {
  const clean = cleanCode(code);
  if (!clean) return { error: "Escribí el código." };
  if (!SERVER) {
    const r = findCoupon(normalizeCoupons(readJSON(DEMO_COUPONS_KEY, [])).value, clean);
    if (r.coupon?.collectionId) r.coupon.collectionName = listCollections().find((c) => c.id === r.coupon.collectionId)?.name || null;
    return r;
  }
  try {
    return await api("coupons/check", { method: "POST", body: { code: clean } });
  } catch (err) {
    return { error: err.status === 404 ? err.message : "No pudimos revisar el código. Probá de nuevo en un rato." };
  }
}

/** Descuento del código en el carrito de ahora: { discount } o { discount: 0, missing }. */
export function cartCouponDiscount(coupon) {
  const lines = getCart().items.map((i) => ({
    total: priceItem(i)?.total || 0,
    qty: i.qty,
    collectionIds: (i.storeDesignIds || []).map((id) => getStoreDesign(id)?.collectionId).filter(Boolean),
  }));
  return couponDiscount(coupon, lines);
}
