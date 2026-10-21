/**
 * Envío por código postal (Andreani o Correo Argentino, a domicilio, sin retiro).
 *
 * 1. Si en el panel está prendida la promo de envío gratis (site_settings,
 *    clave 'shipping'), no se calcula nada: envío gratis a todo el país.
 * 2. Si la zona de la tabla del panel (shipping_rates) que incluye ese CP
 *    está marcada con envío gratis (o tiene precio 0), esa es la única opción.
 * 3. Si no, se cotiza en vivo con las empresas configuradas (carriers.js)
 *    según el peso y tamaño del pedido, y la clienta elige.
 * 4. Si no hay ninguna configurada o ninguna responde, se usa la tabla del
 *    panel (gana la primera fila, en orden, cuyo rango incluya el CP).
 */
import { HttpError } from "./http.js";
import { parcelFor } from "./carriers.js";

/** Acepta "5000" o el CPA "X5000ABC" y devuelve el número de 4 dígitos. */
export function normalizePostalCode(raw) {
  const m = String(raw || "").toUpperCase().replace(/\s+/g, "").match(/^(?:[A-Z])?(\d{4})(?:[A-Z]{3})?$/);
  return m ? Number(m[1]) : null;
}

/** Ajustes de envío del panel: la promo de envío gratis se prende y se apaga a mano. */
export const DEFAULT_SHIPPING_SETTINGS = { freeShipping: false };

export function normalizeShippingSettings(raw) {
  return { freeShipping: raw?.freeShipping === true };
}

export async function loadShippingSettings(q) {
  const [row] = await q.query("select value from site_settings where key = 'shipping'");
  return row ? normalizeShippingSettings(row.value) : { ...DEFAULT_SHIPPING_SETTINGS };
}

export async function saveShippingSettings(q, body) {
  if (typeof body?.freeShipping !== "boolean") throw new HttpError(422, "Falta indicar si el envío gratis está prendido.");
  const value = normalizeShippingSettings(body);
  await q.query(
    "insert into site_settings (key, value) values ('shipping', $1::text::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [JSON.stringify(value)]
  );
  return value;
}

export const FREE_SHIPPING_OPTION = { id: "promo:envio-gratis", carrier: "Envío gratis", service: "Promoción a todo el país", price: 0, days: null, example: false };

export async function listRates(q) {
  return q.query("select id, name, cp_from, cp_to, price, free, example, sort from shipping_rates order by sort, id");
}

/**
 * @param lines [{ type, qty }] prendas del pedido (para peso y tamaño)
 * @returns { postalCode, free, live, options: [{ id, carrier, service, price, days, example }] }
 */
export async function quoteShipping(q, rawPostalCode, { carriers = [], lines = [] } = {}) {
  const cp = normalizePostalCode(rawPostalCode);
  if (!cp || cp < 1000) throw new HttpError(422, "Escribí un código postal válido (4 números, por ejemplo 5000).");
  const base = { postalCode: String(cp) };
  if ((await loadShippingSettings(q)).freeShipping) return { ...base, free: true, live: false, promo: true, options: [{ ...FREE_SHIPPING_OPTION }] };
  const rate = (await listRates(q)).find((r) => cp >= r.cp_from && cp <= r.cp_to);
  if (rate && (rate.free || rate.price === 0)) {
    return { ...base, free: true, live: false, options: [{ id: `tabla:${rate.id}`, carrier: "Envío gratis", service: rate.name, price: 0, days: null, example: false }] };
  }
  const parcel = parcelFor(lines.length ? lines : [{ type: "tee", qty: 1 }]);
  const results = await Promise.allSettled(carriers.map((c) => withTimeout(c.quote({ postalCode: cp, parcel }), 8000)));
  const live = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`Cotización de ${carriers[i].name} falló:`, r.reason?.message);
    return [];
  });
  if (live.length) return { ...base, free: false, live: true, options: live.sort((a, b) => a.price - b.price).map((o) => ({ ...o, example: false })) };
  if (!rate) throw new HttpError(422, "Todavía no tenemos tarifa para ese código postal. Escribinos y lo resolvemos.");
  return {
    ...base,
    free: false,
    live: false,
    options: [{ id: `tabla:${rate.id}`, carrier: "Andreani o Correo Argentino", service: rate.name, price: rate.price, days: null, example: rate.example }],
  };
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo de espera agotado")), ms).unref?.())]);

export async function replaceRates(q, list) {
  if (!Array.isArray(list) || !list.length || list.length > 50) throw new HttpError(422, "La lista de tarifas no es válida.");
  const before = new Map((await listRates(q)).map((r) => [r.id, r]));
  const clean = list.map((r, i) => {
    const cpFrom = Number(r.cp_from), cpTo = Number(r.cp_to), price = Number(r.price);
    const name = String(r.name || "").trim().slice(0, 60);
    if (!name) throw new HttpError(422, `La tarifa ${i + 1} no tiene nombre.`);
    if (![cpFrom, cpTo].every((n) => Number.isInteger(n) && n >= 1000 && n <= 9999) || cpTo < cpFrom) {
      throw new HttpError(422, `El rango de códigos postales de «${name}» no es válido.`);
    }
    if (!Number.isInteger(price) || price < 0) throw new HttpError(422, `El precio de «${name}» no es válido.`);
    const id = String(r.id || "").match(/^[a-z0-9-]{1,40}$/) ? r.id : `zona-${i + 1}`;
    // Una tarifa de ejemplo deja de serlo cuando se le cambia el precio.
    const prev = before.get(id);
    if (r.free !== undefined && typeof r.free !== "boolean") throw new HttpError(422, `Falta indicar si «${name}» tiene envío gratis.`);
    return { id, name, cp_from: cpFrom, cp_to: cpTo, price, free: r.free === true, example: !!prev?.example && prev.price === price, sort: i };
  });
  await q.query("delete from shipping_rates");
  for (const r of clean) {
    await q.query("insert into shipping_rates (id, name, cp_from, cp_to, price, free, example, sort) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
      r.id, r.name, r.cp_from, r.cp_to, r.price, r.free, r.example, r.sort,
    ]);
  }
  return listRates(q);
}
