/**
 * Catálogo en la base: colores, productos (con colores y talles) y diseños
 * de la tienda. Devuelve objetos con la MISMA forma que usa el sitio
 * (assets/js/data/catalog.js), así las páginas no cambian.
 */
import { GARMENTS } from "../../assets/js/data/garments.js";
import { HttpError } from "./http.js";
import { insertProduct } from "./seed.js";
import { DEFAULT_ZONE_PRICES, PRICED_ZONES } from "../../assets/js/core/pricing.js";

export async function loadColors(q) {
  const rows = await q.query("select id, name, hex from garment_colors order by sort, id");
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: r.name, hex: r.hex }]));
}

export async function loadProducts(q, { onlyActive = false } = {}) {
  const products = await q.query(`select * from products ${onlyActive ? "where active" : ""} order by sort, created_at`);
  const colors = await q.query("select product_id, color_id from product_colors order by sort");
  const sizes = await q.query("select * from product_sizes order by sort");
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    type: p.type,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    basePrice: p.base_price,
    colors: colors.filter((c) => c.product_id === p.id).map((c) => c.color_id),
    sizes: sizes
      .filter((s) => s.product_id === p.id)
      .map((s) => ({ id: s.size_id, label: s.label, surcharge: s.surcharge, stock: s.stock })),
    faces: p.faces,
    includedFaces: p.included_faces,
    featured: p.featured,
    active: p.active,
    badge: p.badge,
    demoArt: p.demo_art,
  }));
}

export async function getProduct(q, id) {
  return (await loadProducts(q)).find((p) => p.id === id) || null;
}

const designRow = (r) => ({
  id: r.id,
  schema: "nevrado.store-design/v1",
  name: r.name,
  description: r.description,
  price: r.price,
  status: r.status,
  productIds: r.product_ids,
  source: r.source,
  createdAt: isoDate(r.created_at),
  updatedAt: isoDate(r.updated_at),
});

/** Fecha en ISO; una fecha rara no tiene que tirar abajo el catálogo entero. */
function isoDate(v) {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function loadStoreDesigns(q, { publishedOnly = false } = {}) {
  const rows = await q.query(
    `select * from store_designs where deleted_at is null ${publishedOnly ? "and status = 'published'" : ""} order by sort, created_at`
  );
  return rows.map(designRow);
}

/** Diseños por id, incluidos los borrados (un pedido viejo los sigue nombrando). */
export async function storeDesignsByIds(q, ids) {
  if (!ids.length) return [];
  const rows = await q.query("select * from store_designs where id = any($1::text[])", [ids]);
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((r) => ({ ...designRow(r), deleted: !!r.deleted_at }));
}

/* ------------------------- Edición desde el panel ------------------------- */

const int = (v, min, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new HttpError(422, `${label} tiene que ser un número entero${min > 0 ? " mayor a 0" : ", 0 o más"}.`);
  return n;
};
const text = (v, max, label, { required = false } = {}) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new HttpError(422, `Falta ${label}.`);
  if (s.length > max) throw new HttpError(422, `${label} es demasiado largo (máximo ${max} caracteres).`);
  return s;
};

export async function updateProduct(q, id, body) {
  const current = await getProduct(q, id);
  if (!current) throw new HttpError(404, "Ese producto no existe.");
  const validColors = await loadColors(q);
  const colors = Array.isArray(body.colors) ? body.colors : current.colors;
  if (!colors.length || colors.some((c) => !validColors[c])) throw new HttpError(422, "Elegí al menos un color válido.");
  const sizes = Array.isArray(body.sizes) ? body.sizes : current.sizes;
  const sizeIds = new Set(current.sizes.map((s) => s.id));
  for (const s of sizes) {
    if (!sizeIds.has(s.id)) throw new HttpError(422, `El talle ${s.id} no existe en este producto.`);
    int(s.surcharge ?? 0, 0, `El recargo del talle ${s.id}`);
    if (!["ok", "low", "out"].includes(s.stock)) throw new HttpError(422, `El stock del talle ${s.id} no es válido.`);
  }
  const next = {
    name: body.name !== undefined ? text(body.name, 60, "el nombre", { required: true }) : current.name,
    tagline: body.tagline !== undefined ? text(body.tagline, 80, "La bajada") : current.tagline,
    description: body.description !== undefined ? text(body.description, 300, "La descripción") : current.description,
    badge: body.badge !== undefined ? text(body.badge, 16, "La etiqueta") || null : current.badge,
    basePrice: body.basePrice !== undefined ? int(body.basePrice, 1, "El precio base") : current.basePrice,
    active: body.active !== undefined ? !!body.active : current.active,
    featured: body.featured !== undefined ? !!body.featured : current.featured,
  };
  await q.query(
    `update products set name=$2, tagline=$3, description=$4, badge=$5, base_price=$6, active=$7, featured=$8, updated_at=now() where id=$1`,
    [id, next.name, next.tagline, next.description, next.badge, next.basePrice, next.active, next.featured]
  );
  await q.query("delete from product_colors where product_id=$1", [id]);
  let i = 0;
  for (const c of colors) await q.query("insert into product_colors (product_id, color_id, sort) values ($1,$2,$3)", [id, c, i++]);
  for (const s of sizes) {
    await q.query("update product_sizes set surcharge=$3, stock=$4 where product_id=$1 and size_id=$2", [id, s.id, s.surcharge ?? 0, s.stock]);
  }
  return getProduct(q, id);
}

export async function createProduct(q, body, defaultSizesFor) {
  const type = body.type;
  if (!GARMENTS[type]) throw new HttpError(422, "Elegí un tipo de prenda válido.");
  const name = text(body.name, 60, "el nombre", { required: true });
  const basePrice = int(body.basePrice, 1, "El precio base");
  const [{ n }] = await q.query("select count(*)::int as n from products");
  const id = `prd-${crypto.randomUUID().slice(0, 8)}`;
  const colors = await loadColors(q);
  const p = {
    id,
    sku: `NEV-${type.slice(0, 3).toUpperCase()}-${String(n + 1).padStart(2, "0")}-${id.slice(4, 8).toUpperCase()}`,
    type,
    name,
    tagline: "",
    description: "",
    basePrice,
    colors: ["negro", "blanco"].filter((c) => colors[c]),
    sizes: defaultSizesFor(type),
    faces: Object.keys(GARMENTS[type].faces),
    includedFaces: 1,
    featured: false,
    active: true,
    demoArt: null,
    badge: "Nuevo",
  };
  await insertProduct(q, p, n);
  return getProduct(q, id);
}

export async function saveStoreDesign(q, id, body, { source } = {}) {
  const name = text(body.name, 60, "el nombre", { required: true });
  const description = text(body.description ?? "", 200, "La descripción");
  const price = int(body.price ?? 0, 0, "El precio del diseño");
  const status = body.status === "draft" ? "draft" : "published";
  const productIds = Array.isArray(body.productIds) ? body.productIds.filter((x) => typeof x === "string") : [];
  if (productIds.length) {
    const known = new Set((await loadProducts(q)).map((p) => p.id));
    if (productIds.some((p) => !known.has(p))) throw new HttpError(422, "Alguna de las prendas elegidas no existe.");
  }
  if (id) {
    const [cur] = await q.query("select * from store_designs where id=$1 and deleted_at is null", [id]);
    if (!cur) throw new HttpError(404, "Ese diseño no existe.");
    await q.query(
      `update store_designs set name=$2, description=$3, price=$4, status=$5, product_ids=$6::text::jsonb, source=$7::text::jsonb, updated_at=now() where id=$1`,
      [id, name, description, price, status, JSON.stringify(productIds), JSON.stringify(source || cur.source)]
    );
  } else {
    if (!source) throw new HttpError(422, "Falta el archivo del diseño.");
    id = `sd-${crypto.randomUUID().slice(0, 8)}`;
    const [{ n }] = await q.query("select coalesce(max(sort),0)+1 as n from store_designs");
    await q.query(
      `insert into store_designs (id, name, description, price, status, product_ids, source, sort) values ($1,$2,$3,$4,$5,$6::text::jsonb,$7::text::jsonb,$8)`,
      [id, name, description, price, status, JSON.stringify(productIds), JSON.stringify(source), n]
    );
  }
  return (await storeDesignsByIds(q, [id]))[0];
}

export async function deleteStoreDesign(q, id) {
  const rows = await q.query("update store_designs set deleted_at=now() where id=$1 and deleted_at is null returning id", [id]);
  if (!rows.length) throw new HttpError(404, "Ese diseño no existe.");
}

/* ------------------------- Recargos por zona ------------------------- */
/** Recargo de cada zona de estampa: los del panel sobre los valores iniciales. */
export async function loadZonePrices(q) {
  const rows = await q.query("select zone, price from zone_prices");
  return { ...DEFAULT_ZONE_PRICES, ...Object.fromEntries(rows.map((r) => [r.zone, r.price])) };
}

export async function saveZonePrices(q, prices) {
  if (!prices || typeof prices !== "object") throw new HttpError(422, "Faltan los recargos.");
  for (const [zone, value] of Object.entries(prices)) {
    if (!PRICED_ZONES.includes(zone)) throw new HttpError(422, `Zona desconocida: ${zone}.`);
    const price = Number(value);
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) throw new HttpError(422, "Cada recargo tiene que ser un número entero, sin centavos.");
    await q.query(
      "insert into zone_prices (zone, price) values ($1, $2) on conflict (zone) do update set price = excluded.price, updated_at = now()",
      [zone, price]
    );
  }
  return loadZonePrices(q);
}
