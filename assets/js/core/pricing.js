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

export const PRICING_RULES = {
  /** Suplemento por cada cara estampada por encima de las incluidas. */
  extraFaceSurcharge: 4500,
  /** Técnicas de impresión configurables (por ahora una sola). */
  techniques: {
    dtf: { id: "dtf", name: "DTF (film transfer)", surchargePerFace: 0, minDpi: 150, idealDpi: 300 },
  },
  defaultTechnique: "dtf",
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
  const lines = [{ label: "Prenda base", amount: product.basePrice }];
  const size = product.sizes.find((s) => s.id === variant.sizeId);
  if (size && size.surcharge) lines.push({ label: `Suplemento talle ${size.label}`, amount: size.surcharge });

  const extraFaces = printedFaces.slice(product.includedFaces ?? 1);
  extraFaces.forEach((f) =>
    lines.push({ label: `Estampa adicional (${faceLabel(f).toLowerCase()})`, amount: PRICING_RULES.extraFaceSurcharge })
  );

  // Diseños de la tienda usados en la prenda: cada uno suma su precio una vez por unidad.
  storeDesignsByIds(storeDesignIds).forEach((d) =>
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
