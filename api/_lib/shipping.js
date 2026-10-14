/**
 * Envío por código postal (Andreani o Correo Argentino, sin retiro).
 * La tarifa sale de la tabla shipping_rates: gana la primera regla, en
 * orden, cuyo rango incluya el código postal. CP 5000 (centro de Córdoba
 * Capital) es gratis.
 */
import { HttpError } from "./http.js";

/** Acepta "5000" o el CPA "X5000ABC" y devuelve el número de 4 dígitos. */
export function normalizePostalCode(raw) {
  const m = String(raw || "").toUpperCase().replace(/\s+/g, "").match(/^(?:[A-Z])?(\d{4})(?:[A-Z]{3})?$/);
  return m ? Number(m[1]) : null;
}

export async function listRates(q) {
  return q.query("select id, name, cp_from, cp_to, price, example, sort from shipping_rates order by sort, id");
}

export async function quoteShipping(q, rawPostalCode) {
  const cp = normalizePostalCode(rawPostalCode);
  if (!cp || cp < 1000) throw new HttpError(422, "Escribí un código postal válido (4 números, por ejemplo 5000).");
  const rate = (await listRates(q)).find((r) => cp >= r.cp_from && cp <= r.cp_to);
  if (!rate) throw new HttpError(422, "Todavía no tenemos tarifa para ese código postal. Escribinos y lo resolvemos.");
  return { postalCode: String(cp), rateId: rate.id, zone: rate.name, price: rate.price, free: rate.price === 0, example: rate.example };
}

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
    return { id, name, cp_from: cpFrom, cp_to: cpTo, price, example: !!prev?.example && prev.price === price, sort: i };
  });
  await q.query("delete from shipping_rates");
  for (const r of clean) {
    await q.query("insert into shipping_rates (id, name, cp_from, cp_to, price, example, sort) values ($1,$2,$3,$4,$5,$6,$7)", [
      r.id, r.name, r.cp_from, r.cp_to, r.price, r.example, r.sort,
    ]);
  }
  return listRates(q);
}
