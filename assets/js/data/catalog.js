/**
 * Catálogo de DEMOSTRACIÓN.
 * Precios, stock y productos son ficticios. En la versión con backend,
 * este módulo se reemplaza por una llamada a GET /api/products y la
 * estructura se mantiene (ver docs/ARQUITECTURA.md).
 *
 * Los colores de prenda son colores reales de indumentaria y son
 * independientes de la paleta de marca.
 */

export const CURRENCY = { code: "ARS", locale: "es-AR" };

export const GARMENT_COLORS = {
  blanco: { id: "blanco", name: "Blanco", hex: "#f4f4f1" },
  negro: { id: "negro", name: "Negro", hex: "#171717" },
  melange: { id: "melange", name: "Gris melange", hex: "#a3a3a1" },
  arena: { id: "arena", name: "Arena", hex: "#d9c9a6" },
  marino: { id: "marino", name: "Azul marino", hex: "#1f2a44" },
  militar: { id: "militar", name: "Verde militar", hex: "#4a5229" },
  bordo: { id: "bordo", name: "Bordó", hex: "#5c1a28" },
  crudo: { id: "crudo", name: "Crudo", hex: "#ece4d2" },
};

/** stock: "ok" | "low" | "out" (disponibilidad de ejemplo) */
const size = (id, surcharge = 0, stock = "ok") => ({ id, label: id, surcharge, stock });

export const PRODUCTS = [
  {
    id: "remera-clasica",
    sku: "DEMO-TEE-01",
    type: "tee",
    name: "Remera Clásica",
    tagline: "Algodón peinado 24/1, corte regular.",
    description:
      "La base de todo. Cuello redondo con ribete, costuras reforzadas en hombros y una caída que funciona sola o debajo de un buzo.",
    basePrice: 18900,
    colors: ["blanco", "negro", "melange", "arena", "marino"],
    sizes: [size("S"), size("M"), size("L"), size("XL", 0, "low"), size("XXL", 1500)],
    faces: ["front", "back"],
    includedFaces: 1,
    featured: true,
    demoArt: "sol",
    badge: "Básico",
  },
  {
    id: "remera-oversize",
    sku: "DEMO-OVR-01",
    type: "oversize",
    name: "Remera Oversize",
    tagline: "Hombro caído, jersey pesado 220 g.",
    description:
      "Corte amplio y cuerpo recto. Más superficie de estampa en la espalda para piezas grandes.",
    basePrice: 23500,
    colors: ["negro", "blanco", "militar", "arena", "bordo"],
    sizes: [size("S"), size("M"), size("L", 0, "low"), size("XL"), size("XXL", 2000, "out")],
    faces: ["front", "back"],
    includedFaces: 1,
    featured: true,
    demoArt: "franja",
    badge: "Nuevo",
  },
  {
    id: "buzo-canguro",
    sku: "DEMO-HOD-01",
    type: "hoodie",
    name: "Buzo Canguro",
    tagline: "Frisa invisible 300 g, capucha forrada.",
    description:
      "Bolsillo canguro, puños y cintura con rib. Estampa frontal sobre el bolsillo y espalda completa.",
    basePrice: 42900,
    colors: ["negro", "melange", "marino", "bordo"],
    sizes: [size("S"), size("M"), size("L"), size("XL"), size("XXL", 2500, "low")],
    faces: ["front", "back"],
    includedFaces: 1,
    featured: true,
    demoArt: "hecho",
    badge: "Abrigo",
  },
  {
    id: "tote-bag",
    sku: "DEMO-TOT-01",
    type: "tote",
    name: "Tote Bag",
    tagline: "Lienzo de algodón 10 oz, 38 × 42 cm.",
    description: "Manijas largas para llevar al hombro. Estampa en una o en las dos caras.",
    basePrice: 12500,
    colors: ["crudo", "negro"],
    sizes: [size("Único")],
    faces: ["front", "back"],
    includedFaces: 1,
    featured: false,
    demoArt: "hecho",
    badge: null,
  },
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

export function getColor(id) {
  return GARMENT_COLORS[id] || null;
}

export function stockLabel(stock) {
  return { ok: "Disponible", low: "Pocas unidades", out: "Sin stock" }[stock] || "";
}

/** Valida y normaliza una selección de variante. Devuelve { ok, errors, variant }. */
export function validateVariant(product, { colorId, sizeId, qty }) {
  const errors = [];
  if (!product) return { ok: false, errors: ["Producto inexistente."] };
  if (!product.colors.includes(colorId)) errors.push("Elegí un color disponible.");
  const s = product.sizes.find((x) => x.id === sizeId);
  if (!s) errors.push("Elegí un talle.");
  else if (s.stock === "out") errors.push(`El talle ${s.label} no tiene stock.`);
  const q = Number(qty);
  if (!Number.isInteger(q) || q < 1 || q > 50) errors.push("La cantidad debe estar entre 1 y 50.");
  return { ok: errors.length === 0, errors, variant: { colorId, sizeId, qty: q } };
}

/** Variante por defecto (primer color y primer talle con stock). */
export function defaultVariant(product) {
  const s = product.sizes.find((x) => x.stock !== "out") || product.sizes[0];
  return { colorId: product.colors[0], sizeId: s.id, qty: 1 };
}
