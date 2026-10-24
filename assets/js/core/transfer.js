/**
 * Pago por transferencia con descuento (pedido de la tienda, 24/10/2026).
 * La dueña carga en el panel (pestaña «Cobros») el porcentaje y sus datos
 * bancarios; la clienta elige «Transferencia» en el checkout, ve el monto
 * con el descuento y los datos para transferir, y la dueña marca el pedido
 * como pagado a mano cuando le llega la plata.
 *
 * El descuento es un porcentaje de las prendas (el envío no). Si se suma con
 * los códigos, se calcula sobre el precio ya con el código; si no, con un
 * código aplicado no hay descuento por transferencia.
 *
 * Un pedido por transferencia sin pagar se cancela solo a las `expiresHours`
 * horas (72 por pedido de la tienda; 0 = nunca). Si la transferencia llega
 * tarde, la dueña lo puede pasar igual a «Pagado» desde el panel.
 *
 * Con servidor se guarda en site_settings (clave 'transfer'). Este archivo no
 * depende del navegador: lo usan el sitio, el panel y el servidor.
 */
export const MAX_TRANSFER_PERCENT = 50;
export const MAX_EXPIRES_HOURS = 24 * 14;

export const emptyTransfer = () => ({ enabled: false, percent: 5, alias: "", cbu: "", holder: "", bank: "", cuit: "", stacksWithCoupons: true, expiresHours: 72 });

const text = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Valida y limpia lo que manda el panel. Devuelve { value, errors }. */
export function normalizeTransfer(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const errors = [];
  const percent = Number(r.percent);
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_TRANSFER_PERCENT) {
    errors.push(`El descuento tiene que ser un número entero entre 0 y ${MAX_TRANSFER_PERCENT} (%).`);
  }
  const alias = text(r.alias, 40).toLowerCase();
  if (alias && !/^[a-z0-9.-]{6,20}$/.test(alias)) errors.push("El alias tiene de 6 a 20 letras, números, puntos o guiones, sin espacios.");
  const cbu = text(r.cbu, 40).replace(/[\s-]/g, "");
  if (cbu && !/^\d{22}$/.test(cbu)) errors.push("El CBU o CVU tiene 22 números.");
  const cuit = text(r.cuit, 20).replace(/[\s-]/g, "");
  if (cuit && !/^\d{11}$/.test(cuit)) errors.push("El CUIT o CUIL tiene 11 números.");
  const hours = r.expiresHours === "" || r.expiresHours == null ? 72 : Number(r.expiresHours);
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_EXPIRES_HOURS) errors.push(`El plazo para transferir tiene que ser un número entero de horas entre 0 y ${MAX_EXPIRES_HOURS} (0 = no vence).`);
  const value = {
    enabled: r.enabled === true,
    percent: Number.isInteger(percent) ? Math.min(MAX_TRANSFER_PERCENT, Math.max(0, percent)) : 5,
    alias,
    cbu,
    holder: text(r.holder, 80),
    bank: text(r.bank, 60),
    cuit,
    stacksWithCoupons: r.stacksWithCoupons !== false,
    expiresHours: Number.isInteger(hours) ? Math.min(MAX_EXPIRES_HOURS, Math.max(0, hours)) : 72,
  };
  if (value.enabled && !value.alias && !value.cbu) errors.push("Para ofrecer transferencia cargá el alias o el CBU/CVU.");
  if (value.enabled && !value.holder) errors.push("Para ofrecer transferencia cargá el nombre del titular de la cuenta.");
  return { value, errors };
}

/** Se ofrece solo si está prendida y tiene adónde transferir. */
export const transferReady = (t) => !!(t && t.enabled && (t.alias || t.cbu) && t.holder);

/** Lo que necesita el sitio para mostrar la opción (los datos bancarios van con cada pedido). */
export const publicTransfer = (t) => (transferReady(t) ? { percent: t.percent, stacksWithCoupons: t.stacksWithCoupons, expiresHours: t.expiresHours } : null);

/** Datos para transferir que ve la clienta en su pedido y en el mail. */
export const bankDetails = (t) => ({ alias: t.alias, cbu: t.cbu, holder: t.holder, bank: t.bank, cuit: t.cuit });

/** Hasta cuándo se espera la transferencia de un pedido (null = no vence). */
export const transferDeadline = (createdAt, t) => (t?.expiresHours ? new Date(new Date(createdAt).getTime() + t.expiresHours * 3600e3) : null);

/**
 * Pesos que se descuentan por pagar con transferencia.
 * `goods` es el precio de las prendas ya con el código; `hasCoupon`, si hay uno.
 */
export function transferDiscount(t, goods, { hasCoupon = false } = {}) {
  if (!t || !t.percent || goods <= 0) return 0;
  if (hasCoupon && !t.stacksWithCoupons) return 0;
  return Math.round((goods * t.percent) / 100);
}
