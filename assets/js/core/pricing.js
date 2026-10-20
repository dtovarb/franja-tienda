/**
 * Cálculo de precios. Única fuente de verdad en el cliente.
 * Toda pantalla (selector, editor, resumen, carrito) llama a computePrice,
 * así los suplementos se aplican igual en todos lados.
 *
 * En producción el backend recalcula el precio al crear el pedido:
 * el cliente nunca es fuente de verdad para importes cobrados.
 */
import { faceLabel } from "../data/garments.js";
import { storeDesignsByIds } from "./store-designs.js";
import { CATALOG } from "./api.js";

/**
 * Recargo de cada zona de estampa. El precio base de la prenda incluye el
 * frente; cada otra zona estampada suma lo suyo. Son los valores iniciales:
 * con servidor, los que se cargan en el panel (tabla zone_prices) los
 * reemplazan.
 */
export const DEFAULT_ZONE_PRICES = {
  front: 0,
  back: 4500,
  chest: 2500,
  heart: 2500,
  "front-low": 2500,
  "sleeve-left": 2500,
  "sleeve-right": 2500,
  label: 1500,
};

/** Zonas que tienen recargo editable en el panel, en orden. */
export const PRICED_ZONES = Object.keys(DEFAULT_ZONE_PRICES).filter((z) => z !== "front");

export const ZONE_PRICES = { ...DEFAULT_ZONE_PRICES, ...(CATALOG?.zonePrices || {}) };

export const PRICING_RULES = {
  /** Técnicas de impresión configurables (por ahora una sola). */
  techniques: {
    dtg: { id: "dtg", name: "DTG (impresión directa)", surchargePerFace: 0, minDpi: 150, idealDpi: 300 },
  },
  defaultTechnique: "dtg",
};

export function getTechnique(id = PRICING_RULES.defaultTechnique) {
  return PRICING_RULES.techniques[id] || PRICING_RULES.techniques[PRICING_RULES.defaultTechnique];
}

/**
 * @param product   producto del catálogo
 * @param variant   { sizeId, qty }
 * @param options   { printedFaces: ['front','back'], technique, storeDesignIds: ['sd-…'] }
 * @returns { lines, unit, qty, total }
 */
export function computePrice(product, variant, { printedFaces = [], technique, storeDesignIds = [] } = {}) {
  return priceWith(product, variant, { printedFaces, technique, storeDesigns: storeDesignsByIds(storeDesignIds), zonePrices: ZONE_PRICES });
}

/**
 * Mismo cálculo con los diseños de la tienda ya resueltos. Es la función que
 * usa el servidor (api/_lib/orders.js) con los diseños de la base, así la
 * regla de precios es una sola.
 */
export function priceWith(product, variant, { printedFaces = [], technique, storeDesigns = [], zonePrices = DEFAULT_ZONE_PRICES } = {}) {
  const lines = [{ label: "Prenda base", amount: product.basePrice }];
  const size = product.sizes.find((s) => s.id === variant.sizeId);
  if (size && size.surcharge) lines.push({ label: `Suplemento talle ${size.label}`, amount: size.surcharge });

  // El frente está incluido en el precio base; cada otra zona suma su recargo.
  printedFaces.forEach((f) => {
    const amount = zonePrices[f] ?? DEFAULT_ZONE_PRICES[f] ?? 0;
    if (amount) lines.push({ label: `Estampa: ${faceLabel(f).toLowerCase()}`, amount, zone: f });
  });

  // Diseños de la tienda usados en la prenda: cada uno suma su precio una vez por unidad.
  storeDesigns.forEach((d) =>
    lines.push({ label: `Diseño «${d.name}»${d.price ? "" : " (sin costo)"}`, amount: d.price || 0, storeDesignId: d.id })
  );

  const tech = getTechnique(technique);
  if (tech.surchargePerFace && printedFaces.length) {
    lines.push({ label: `Técnica ${tech.name}`, amount: tech.surchargePerFace * printedFaces.length });
  }

  const unit = lines.reduce((sum, l) => sum + l.amount, 0);
  const qty = Math.max(1, Number(variant.qty) || 1);
  return { lines, unit, qty, total: unit * qty };
}
