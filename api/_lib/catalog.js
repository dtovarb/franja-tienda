/**
 * Catálogo en la base: colores, productos (con colores y talles) y diseños
 * de la tienda. Devuelve objetos con la MISMA forma que usa el sitio
 * (assets/js/data/catalog.js), así las páginas no cambian.
 */
import { GARMENTS } from "../../assets/js/data/garments.js";
import { HttpError } from "./http.js";
import { insertProduct } from "./seed.js";
import { DEFAULT_ZONE_PRICES, PRICED_ZONES, ALWAYS_ON_ZONES, enabledFaces } from "../../assets/js/core/pricing.js";
import { EMPTY_ANNOUNCEMENT, normalizeAnnouncement } from "../../assets/js/core/announcement.js";
import { emptyHomeImages, normalizeHomeImages } from "../../assets/js/core/home-images.js";
import { DEFAULT_MARQUEE, normalizeMarquee, normalizeSiteTexts } from "../../assets/js/core/site-texts.js";

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
    // Las zonas salen del código (GARMENTS): una zona nueva aparece sin
    // migrar la base. La columna faces queda como respaldo.
    faces: GARMENTS[p.type] ? Object.keys(GARMENTS[p.type].faces) : p.faces,
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
  collectionId: r.collection_id || null,
  source: r.source,
  modelPhoto: r.model_photo || null,
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
  // Sin recargo por talle: se guarda siempre en 0, venga lo que venga.
  for (const s of sizes) {
    await q.query("update product_sizes set surcharge=0, stock=$3 where product_id=$1 and size_id=$2", [id, s.id, s.stock]);
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

/**
 * `modelPhoto`: undefined = deja la que había, null = la quita, objeto = la reemplaza.
 */
export async function saveStoreDesign(q, id, body, { source, modelPhoto } = {}) {
  const name = text(body.name, 60, "el nombre", { required: true });
  // Sin `collectionId` en el cuerpo, al editar se conserva la que tenía.
  let collectionId = typeof body.collectionId === "string" && body.collectionId ? body.collectionId : null;
  if (id && body.collectionId === undefined) {
    const [cur] = await q.query("select collection_id from store_designs where id=$1", [id]);
    collectionId = cur?.collection_id || null;
  } else if (collectionId) {
    const [col] = await q.query("select id from design_collections where id=$1", [collectionId]);
    if (!col) throw new HttpError(422, "Esa colección no existe.");
  }
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
      `update store_designs set name=$2, description=$3, price=$4, status=$5, product_ids=$6::text::jsonb, source=$7::text::jsonb, collection_id=$8, model_photo=$9::text::jsonb, updated_at=now() where id=$1`,
      [id, name, description, price, status, JSON.stringify(productIds), JSON.stringify(source || cur.source), collectionId, jsonOrNull(modelPhoto === undefined ? cur.model_photo : modelPhoto)]
    );
  } else {
    if (!source) throw new HttpError(422, "Falta el archivo del diseño.");
    id = `sd-${crypto.randomUUID().slice(0, 8)}`;
    const [{ n }] = await q.query("select coalesce(max(sort),0)+1 as n from store_designs");
    await q.query(
      `insert into store_designs (id, name, description, price, status, product_ids, source, sort, collection_id, model_photo) values ($1,$2,$3,$4,$5,$6::text::jsonb,$7::text::jsonb,$8,$9,$10::text::jsonb)`,
      [id, name, description, price, status, JSON.stringify(productIds), JSON.stringify(source), n, collectionId, jsonOrNull(modelPhoto)]
    );
  }
  return (await storeDesignsByIds(q, [id]))[0];
}

const jsonOrNull = (v) => (v ? JSON.stringify(v) : null);

export async function deleteStoreDesign(q, id) {
  const rows = await q.query("update store_designs set deleted_at=now() where id=$1 and deleted_at is null returning id", [id]);
  if (!rows.length) throw new HttpError(404, "Ese diseño no existe.");
}

/* ------------------------- Colecciones de diseños ------------------------- */
const collectionRow = (r) => ({ id: r.id, name: r.name, description: r.description });

export async function loadDesignCollections(q) {
  return (await q.query("select id, name, description from design_collections order by sort, created_at")).map(collectionRow);
}

export async function saveDesignCollection(q, id, body) {
  const name = text(body.name, 40, "el nombre", { required: true });
  const description = text(body.description ?? "", 200, "La descripción");
  if (id) {
    const rows = await q.query("update design_collections set name=$2, description=$3, updated_at=now() where id=$1 returning *", [id, name, description]);
    if (!rows.length) throw new HttpError(404, "Esa colección no existe.");
    return collectionRow(rows[0]);
  }
  const [{ n }] = await q.query("select coalesce(max(sort),0)+1 as n from design_collections");
  const [row] = await q.query(
    "insert into design_collections (id, name, description, sort) values ($1,$2,$3,$4) returning *",
    [`col-${crypto.randomUUID().slice(0, 8)}`, name, description, n]
  );
  return collectionRow(row);
}

/** Borra la colección; sus diseños siguen en la tienda, sin colección. */
export async function deleteDesignCollection(q, id) {
  const rows = await q.query("delete from design_collections where id=$1 returning id", [id]);
  if (!rows.length) throw new HttpError(404, "Esa colección no existe.");
}

/* ------------------------- Recargos por zona ------------------------- */
/** Recargo de cada zona de estampa: los del panel sobre los valores iniciales. */
export async function loadZonePrices(q) {
  return (await loadZoneSettings(q)).zonePrices;
}

/**
 * Recargos y zonas apagadas, en una sola consulta. Una zona sin fila vale lo
 * de DEFAULT_ZONE_PRICES y está prendida.
 */
export async function loadZoneSettings(q) {
  const rows = await q.query("select zone, price, enabled from zone_prices");
  return {
    zonePrices: { ...DEFAULT_ZONE_PRICES, ...Object.fromEntries(rows.map((r) => [r.zone, r.price])) },
    disabledZones: rows.filter((r) => r.enabled === false && PRICED_ZONES.includes(r.zone) && !ALWAYS_ON_ZONES.includes(r.zone)).map((r) => r.zone),
  };
}

/** Saca de cada producto las zonas apagadas en el panel. */
export function withoutDisabledZones(products, disabledZones) {
  if (!disabledZones?.length) return products;
  return products.map((p) => ({ ...p, faces: enabledFaces(p.faces, disabledZones) }));
}

/**
 * Guarda recargos ({ zona: precio }) y, si viene, la lista de zonas apagadas
 * (las que no están en la lista quedan prendidas). El frente no se apaga.
 */
export async function saveZoneSettings(q, { zonePrices = {}, disabledZones } = {}) {
  if (!zonePrices || typeof zonePrices !== "object") throw new HttpError(422, "Faltan los recargos.");
  if (disabledZones !== undefined && !Array.isArray(disabledZones)) throw new HttpError(422, "La lista de zonas apagadas no es válida.");
  for (const zone of disabledZones || []) {
    if (!PRICED_ZONES.includes(zone)) throw new HttpError(422, `Zona desconocida: ${zone}.`);
    if (ALWAYS_ON_ZONES.includes(zone)) throw new HttpError(422, "El frente no se puede apagar: es la zona principal de cada prenda.");
  }
  for (const [zone, value] of Object.entries(zonePrices)) {
    if (!PRICED_ZONES.includes(zone)) throw new HttpError(422, `Zona desconocida: ${zone}.`);
    const price = Number(value);
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) throw new HttpError(422, "Cada recargo tiene que ser un número entero, sin centavos.");
    await q.query(
      "insert into zone_prices (zone, price) values ($1, $2) on conflict (zone) do update set price = excluded.price, updated_at = now()",
      [zone, price]
    );
  }
  if (disabledZones !== undefined) {
    const off = new Set(disabledZones);
    const current = await loadZonePrices(q);
    for (const zone of PRICED_ZONES) {
      await q.query(
        "insert into zone_prices (zone, price, enabled) values ($1, $2, $3) on conflict (zone) do update set enabled = excluded.enabled, updated_at = now()",
        [zone, current[zone] ?? 0, !off.has(zone)]
      );
    }
  }
  return loadZoneSettings(q);
}

/** Compatibilidad: guardar solo recargos. */
export async function saveZonePrices(q, prices) {
  return (await saveZoneSettings(q, { zonePrices: prices })).zonePrices;
}

/* ------------------------- Cintillo de anuncios ------------------------- */
export async function loadAnnouncement(q) {
  const [row] = await q.query("select value from site_settings where key = 'announcement'");
  return row ? normalizeAnnouncement(row.value).value : { ...EMPTY_ANNOUNCEMENT };
}

export async function saveAnnouncement(q, body) {
  const { value, errors } = normalizeAnnouncement(body);
  if (errors.length) throw new HttpError(422, errors.join(" "));
  await q.query(
    "insert into site_settings (key, value) values ('announcement', $1::text::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [JSON.stringify(value)]
  );
  return value;
}

/* ------------------------- Fotos del inicio ------------------------- */
export async function loadHomeImages(q) {
  const [row] = await q.query("select value from site_settings where key = 'home_images'");
  return row ? normalizeHomeImages(row.value).value : emptyHomeImages();
}

export async function saveHomeImages(q, body) {
  const { value, errors } = normalizeHomeImages(body);
  if (errors.length) throw new HttpError(422, errors.join(" "));
  await q.query(
    "insert into site_settings (key, value) values ('home_images', $1::text::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [JSON.stringify(value)]
  );
  return value;
}

/* ------------------------- Textos del sitio y marquesina ------------------------- */
async function saveSetting(q, key, value) {
  await q.query(
    "insert into site_settings (key, value) values ($1, $2::text::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [key, JSON.stringify(value)]
  );
  return value;
}

export async function loadSiteTexts(q) {
  const [row] = await q.query("select value from site_settings where key = 'site_texts'");
  return normalizeSiteTexts(row?.value).value;
}

export async function saveSiteTexts(q, body) {
  const { value, errors } = normalizeSiteTexts(body);
  if (errors.length) throw new HttpError(422, errors.join(" "));
  return saveSetting(q, "site_texts", value);
}

export async function loadMarquee(q) {
  const [row] = await q.query("select value from site_settings where key = 'marquee'");
  return row ? normalizeMarquee(row.value).value : structuredClone(DEFAULT_MARQUEE);
}

export async function saveMarquee(q, body) {
  const { value, errors } = normalizeMarquee(body && typeof body === "object" ? body : {});
  if (errors.length) throw new HttpError(422, errors.join(" "));
  return saveSetting(q, "marquee", value);
}

/**
 * Cintillo, fotos del inicio, textos, marquesina y promo de envío gratis en UNA consulta, para el catálogo público
 * (cada consulta de más se nota al arrancar en frío).
 */
export async function loadSiteSettings(q) {
  const rows = await q.query("select key, value from site_settings where key in ('announcement', 'home_images', 'shipping', 'site_texts', 'marquee')");
  const get = (k) => rows.find((r) => r.key === k)?.value;
  return {
    announcement: get("announcement") ? normalizeAnnouncement(get("announcement")).value : { ...EMPTY_ANNOUNCEMENT },
    homeImages: get("home_images") ? normalizeHomeImages(get("home_images")).value : emptyHomeImages(),
    freeShipping: get("shipping")?.freeShipping === true,
    siteTexts: normalizeSiteTexts(get("site_texts")).value,
    marquee: get("marquee") ? normalizeMarquee(get("marquee")).value : structuredClone(DEFAULT_MARQUEE),
  };
}
