/**
 * Diseños de la tienda: gráficas listas que la clienta elige y aplica a una
 * prenda. Al elegirlo, el diseño entra al editor como una imagen más, así
 * se puede mover, escalar o completar con texto.
 *
 * PROTOTIPO: la lista se guarda en el localStorage de este navegador y los
 * archivos que se suben desde el panel, en IndexedDB (asset-store.js).
 * En producción esto es la tabla `store_designs` + el bucket de originales
 * (ver docs/ARQUITECTURA.md).
 */
import { readJSON, writeJSON, removeKey } from "./storage.js";
import { uid } from "./format.js";
import { assetDisplayUrl } from "./asset-store.js";

const KEY = "store-designs.v1";
export const STORE_DESIGN_SCHEMA = "nevrado.store-design/v1";

const seed = (id, name, description, price, file, extra = {}) => ({
  id,
  schema: STORE_DESIGN_SCHEMA,
  name,
  description,
  price,
  status: "published",
  productIds: [], // vacío = disponible en todas las prendas
  source: { kind: "url", url: `assets/designs/${file}`, name: file },
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  ...extra,
});

export const SEED_STORE_DESIGNS = [
  seed("sd-sol", "Sol de cinco franjas", "Un sol partido en cinco tonos. Va bien grande en la espalda.", 3500, "sol-cinco-franjas.svg"),
  seed("sd-lunas", "Dos lunas", "Dos lunas espalda con espalda. Chica en el pecho o en la gorra.", 3000, "dos-lunas.svg"),
  seed("sd-ramito", "Ramito", "Tres tulipanes atados con una cinta.", 4000, "ramito.svg", {
    productIds: ["remera-clasica", "remera-oversize", "buzo-canguro", "buzo-capucha", "tote-bag"],
  }),
  seed("sd-ola", "Ola", "Cinco franjas en movimiento.", 3000, "ola.svg"),
  seed("sd-logo", "nevrado", "El logo de la casa. Sin costo de diseño.", 0, "nevrado-logo.svg"),
];

function all() {
  return readJSON(KEY, null) || structuredClone(SEED_STORE_DESIGNS);
}

export function listStoreDesigns({ publishedOnly = false, productId = null } = {}) {
  return all().filter(
    (d) => (!publishedOnly || d.status === "published") && (!productId || !d.productIds?.length || d.productIds.includes(productId))
  );
}

export function getStoreDesign(id) {
  return all().find((d) => d.id === id) || null;
}

export function isAvailableFor(design, productId) {
  return !!design && design.status === "published" && (!design.productIds?.length || design.productIds.includes(productId));
}

export function saveStoreDesign(design) {
  const list = all();
  const now = new Date().toISOString();
  const next = { ...design, id: design.id || uid("sd"), schema: STORE_DESIGN_SCHEMA, updatedAt: now, createdAt: design.createdAt || now };
  const i = list.findIndex((d) => d.id === next.id);
  if (i >= 0) list[i] = next;
  else list.unshift(next);
  writeJSON(KEY, list);
  return next;
}

export function deleteStoreDesign(id) {
  writeJSON(KEY, all().filter((d) => d.id !== id));
}

export function resetStoreDesigns() {
  removeKey(KEY);
}

/** URL para mostrar el diseño (archivo del sitio o original guardado en este navegador). */
export async function storeDesignImageUrl(design) {
  if (!design) return null;
  if (design.source?.kind === "url") return design.source.url;
  if (design.source?.kind === "asset") return assetDisplayUrl(design.source.assetId);
  return null;
}

/** Diseños de la tienda (vigentes) referenciados por una lista de ids, sin repetir. */
export function storeDesignsByIds(ids = []) {
  return [...new Set(ids)].map(getStoreDesign).filter(Boolean);
}

/** Arte para garmentSvg: la imagen del diseño dentro del área (viewBox 0 0 100 100). */
export const designArt = (url) =>
  url ? `<image href="${url}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>` : "";
