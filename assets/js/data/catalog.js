/**
 * Catálogo de DEMOSTRACIÓN.
 * Precios, stock y productos son ficticios. En la versión con backend,
 * este módulo se reemplaza por una llamada a GET /api/products y la
 * estructura se mantiene (ver docs/ARQUITECTURA.md).
 *
 * El panel de la tienda (admin.html) puede editar el catálogo: los cambios
 * se guardan en el localStorage de ESTE navegador y reemplazan a la lista
 * semilla de abajo. No hay servidor: nadie más ve esos cambios.
 *
 * Los colores de prenda son colores reales de indumentaria y son
 * independientes de la paleta de marca.
 */

import { readJSON, writeJSON, removeKey } from "../core/storage.js";
import { GARMENTS, setUploadedPhotos } from "./garments.js";
import { CATALOG } from "../core/api.js";
import { enabledFaces } from "../core/zones.js";
import { normalizeGarmentPhotos, GARMENT_PHOTOS_KEY } from "../core/garment-photos.js";

export const CURRENCY = { code: "ARS", locale: "es-AR" };

// Los tonos salen de las fotos de cada prenda (mediana de la tela en el pecho),
// así la muestra de color coincide con lo que se ve.
export const GARMENT_COLORS = {
  blanco: { id: "blanco", name: "Blanco", hex: "#eceae7" },
  negro: { id: "negro", name: "Negro", hex: "#171717" },
  grafito: { id: "grafito", name: "Grafito", hex: "#4c4f54" },
  gris: { id: "gris", name: "Gris", hex: "#bab2b2" },
  "rosa-palo": { id: "rosa-palo", name: "Rosa palo", hex: "#cf9b90" },
  nude: { id: "nude", name: "Nude", hex: "#e4cec4" },
  "marron-claro": { id: "marron-claro", name: "Marrón claro", hex: "#9c7b6b" },
  melange: { id: "melange", name: "Gris melange", hex: "#a3a3a1" },
  arena: { id: "arena", name: "Arena", hex: "#ceb797" },
  marino: { id: "marino", name: "Azul marino", hex: "#202636" },
  militar: { id: "militar", name: "Verde militar", hex: "#4a5229" },
  bordo: { id: "bordo", name: "Bordó", hex: "#630d27" },
  rojo: { id: "rojo", name: "Rojo", hex: "#9d1222" },
  rosa: { id: "rosa", name: "Rosa", hex: "#dfb9b6" },
  marron: { id: "marron", name: "Marrón", hex: "#5d3526" },
  crudo: { id: "crudo", name: "Crudo", hex: "#ddcebc" },
  naranja: { id: "naranja", name: "Naranja lavado", hex: "#b34726" },
  verde: { id: "verde", name: "Verde lavado", hex: "#41533c" },
  azul: { id: "azul", name: "Azul lavado", hex: "#5f8fce" },
  celeste: { id: "celeste", name: "Celeste lavado", hex: "#b0c3d0" },
};

/** stock: "ok" | "low" | "out" (disponibilidad de ejemplo) */
const size = (id, surcharge = 0, stock = "ok") => ({ id, label: id, surcharge, stock });

/** Talles por defecto según el tipo de prenda (para productos nuevos del panel). */
export function defaultSizesFor(type) {
  return ["cap", "tote"].includes(type) ? [size("Único")] : ["S", "M", "L", "XL", "XXL"].map((s) => size(s));
}

export const SEED_PRODUCTS = [
  {
    id: "remera-clasica",
    sku: "DEMO-TEE-01",
    type: "tee",
    name: "Remera Clásica",
    tagline: "Algodón peinado 24/1, corte regular.",
    description:
      "La base de todo. Cuello redondo con ribete, costuras reforzadas en hombros y una caída que funciona sola o debajo de un buzo.",
    basePrice: 18900,
    colors: ["blanco", "negro", "arena", "grafito", "gris", "rosa-palo", "nude", "marron-claro"],
    sizes: [size("S"), size("M"), size("L"), size("XL", 0, "low")],
    faces: Object.keys(GARMENTS.tee.faces),
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
    colors: ["negro", "blanco", "arena", "grafito", "gris", "rosa-palo", "nude", "marron-claro"],
    sizes: [size("S"), size("M"), size("L", 0, "low"), size("XL"), size("XXL", 0, "out")],
    faces: Object.keys(GARMENTS.oversize.faces),
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
    colors: ["negro", "blanco"],
    sizes: [size("S"), size("M"), size("L"), size("XL"), size("XXL", 0, "low")],
    faces: Object.keys(GARMENTS.hoodie.faces),
    includedFaces: 1,
    featured: true,
    demoArt: "hecho",
    badge: "Abrigo",
  },
  {
    id: "buzo-cuello-redondo",
    sku: "DEMO-CRW-01",
    type: "crewneck",
    name: "Buzo cuello redondo",
    tagline: "Frisa 300 g, cuello, puños y cintura con rib.",
    description:
      "El buzo de todos los días, sin capucha. Frente liso para una estampa grande en el pecho y espalda completa.",
    basePrice: 34900,
    colors: ["negro", "blanco", "marino", "bordo", "rojo", "rosa", "marron"],
    sizes: [size("S"), size("M"), size("L"), size("XL"), size("XXL")],
    faces: Object.keys(GARMENTS.crewneck.faces),
    includedFaces: 1,
    featured: true,
    demoArt: "sol",
    badge: "Nuevo",
  },
  {
    id: "gorra",
    sku: "DEMO-CAP-01",
    type: "cap",
    name: "Gorra",
    tagline: "Seis paneles, gabardina lavada, regulable.",
    description:
      "Gabardina de algodón con lavado gastado, visera curva y cierre regulable atrás. Estampa en el frente, hasta 11 × 7 cm.",
    basePrice: 14900,
    colors: ["naranja", "verde", "azul", "celeste"],
    sizes: [size("Único")],
    faces: Object.keys(GARMENTS.cap.faces),
    includedFaces: 1,
    featured: false,
    demoArt: "franja",
    badge: "Nuevo",
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
    faces: Object.keys(GARMENTS.tote.faces),
    includedFaces: 1,
    featured: false,
    demoArt: "hecho",
    badge: null,
  },
];

const KEY = "catalog.v1";

/** Catálogo vigente: el editado en el panel (si existe) o la semilla. */
// Se descartan productos de tipos de prenda que ya no existen (p. ej. un
// catálogo guardado antes de sacar el buzo con capucha).
// Con servidor, el catálogo (y los colores) salen de la base; si no, del navegador.
if (CATALOG) Object.assign(GARMENT_COLORS, CATALOG.colors);
// Fotos por color subidas en el panel: reemplazan a las de la carpeta.
setUploadedPhotos(normalizeGarmentPhotos(CATALOG ? CATALOG.garmentPhotos : readJSON(GARMENT_PHOTOS_KEY, null)));
// Las zonas apagadas en el panel no se ofrecen en ninguna prenda.
export const PRODUCTS = (CATALOG?.products || (readJSON(KEY, null) || structuredClone(SEED_PRODUCTS)).map((p) => ({ ...p, faces: Object.keys(GARMENTS[p.type]?.faces || {}) })))
  .filter((p) => GARMENTS[p.type])
  .map((p) => ({ ...p, faces: enabledFaces(p.faces) }));

/** Productos visibles en la tienda (los ocultos siguen valiendo para el carrito). */
export function activeProducts() {
  return PRODUCTS.filter((p) => p.active !== false);
}

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

export function saveProducts(list) {
  writeJSON(KEY, list);
  PRODUCTS.splice(0, PRODUCTS.length, ...list);
}

export function resetProducts() {
  removeKey(KEY);
  PRODUCTS.splice(0, PRODUCTS.length, ...structuredClone(SEED_PRODUCTS));
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
