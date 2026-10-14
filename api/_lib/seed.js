/**
 * Datos iniciales de la base: los mismos del prototipo (catálogo, colores,
 * diseños de la tienda y opiniones de ejemplo), leídos de los módulos del
 * sitio para que haya una sola fuente. Se cargan una única vez; después
 * se editan desde el panel.
 */
import { SEED_PRODUCTS, GARMENT_COLORS } from "../../assets/js/data/catalog.js";
import { SEED_STORE_DESIGNS } from "../../assets/js/core/store-designs.js";
import { DEMO_REVIEWS } from "../../assets/js/data/reviews.js";

/**
 * Tarifas de envío por código postal. Solo el centro de Córdoba Capital
 * (CP 5000) es una regla real de la tienda: envío gratis. Los demás importes
 * son de EJEMPLO hasta tener las tarifas reales de Andreani y Correo
 * Argentino; el panel los marca así y se cambian desde ahí.
 */
export const SEED_SHIPPING_RATES = [
  { id: "cordoba-centro", name: "Córdoba Capital, centro", cp_from: 5000, cp_to: 5000, price: 0, example: false, sort: 0 },
  { id: "cordoba-provincia", name: "Provincia de Córdoba", cp_from: 5001, cp_to: 5999, price: 4500, example: true, sort: 1 },
  { id: "resto-del-pais", name: "Resto del país", cp_from: 1000, cp_to: 9999, price: 7500, example: true, sort: 2 },
];

export async function seedData(q) {
  let i = 0;
  for (const c of Object.values(GARMENT_COLORS)) {
    await q.query("insert into garment_colors (id, name, hex, sort) values ($1,$2,$3,$4) on conflict (id) do nothing", [c.id, c.name, c.hex, i++]);
  }
  i = 0;
  for (const p of SEED_PRODUCTS) await insertProduct(q, p, i++);
  i = 0;
  for (const d of SEED_STORE_DESIGNS) {
    await q.query(
      `insert into store_designs (id, name, description, price, status, product_ids, source, sort)
       values ($1,$2,$3,$4,$5,$6::text::jsonb,$7::text::jsonb,$8) on conflict (id) do nothing`,
      [d.id, d.name, d.description, d.price, d.status, JSON.stringify(d.productIds || []), JSON.stringify(d.source), i++]
    );
  }
  for (const r of DEMO_REVIEWS) {
    await q.query(
      `insert into reviews (id, product_id, author, city, rating, title, body, size, color_id, date, verified_purchase, demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true) on conflict (id) do nothing`,
      [r.id, r.productId, r.author, r.city, r.rating, r.title, r.body, r.size, r.colorId, r.date]
    );
  }
  for (const s of SEED_SHIPPING_RATES) {
    await q.query(
      "insert into shipping_rates (id, name, cp_from, cp_to, price, example, sort) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing",
      [s.id, s.name, s.cp_from, s.cp_to, s.price, s.example, s.sort]
    );
  }
}

export async function insertProduct(q, p, sort = 0) {
  await q.query(
    `insert into products (id, sku, type, name, tagline, description, base_price, faces, included_faces, featured, active, badge, demo_art, sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8::text::jsonb,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing`,
    [
      p.id, p.sku, p.type, p.name, p.tagline || "", p.description || "", p.basePrice, JSON.stringify(p.faces),
      p.includedFaces ?? 1, !!p.featured, p.active !== false, p.badge || null, p.demoArt || null, sort,
    ]
  );
  let j = 0;
  for (const c of p.colors) await q.query("insert into product_colors (product_id, color_id, sort) values ($1,$2,$3) on conflict do nothing", [p.id, c, j++]);
  j = 0;
  for (const s of p.sizes) {
    await q.query(
      "insert into product_sizes (product_id, size_id, label, surcharge, stock, sort) values ($1,$2,$3,$4,$5,$6) on conflict do nothing",
      [p.id, s.id, s.label, s.surcharge || 0, s.stock || "ok", j++]
    );
  }
}
