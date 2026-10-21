/**
 * Zonas de estampa que se prenden y apagan desde el panel. Módulo aparte y
 * sin dependencias del catálogo, así lo pueden usar el catálogo y los precios.
 */
import { CATALOG } from "./api.js";

/** Zonas que siempre se ofrecen: el panel no las puede apagar. */
export const ALWAYS_ON_ZONES = ["front"];

/** Zonas apagadas desde el panel: no aparecen en la prenda ni en el editor. */
export const DISABLED_ZONES = new Set((CATALOG?.disabledZones || []).filter((z) => !ALWAYS_ON_ZONES.includes(z)));

/** Zonas de una prenda que se ofrecen, sin las apagadas. */
export function enabledFaces(faces, disabled = DISABLED_ZONES) {
  const set = disabled instanceof Set ? disabled : new Set(disabled);
  return faces.filter((f) => ALWAYS_ON_ZONES.includes(f) || !set.has(f));
}
