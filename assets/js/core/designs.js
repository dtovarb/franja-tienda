/**
 * Documentos de diseño editables (localStorage, prototipo).
 *
 * Un documento contiene, por cada cara, el JSON de Fabric.js con las
 * imágenes referenciadas por `assetId` (hash del original), nunca con el
 * binario embebido. Los originales viven en IndexedDB (asset-store.js).
 */
import { readJSON, writeJSON } from "./storage.js";
import { uid } from "./format.js";

const KEY = "designs.v1";
export const DESIGN_SCHEMA = "nevrado.design/v1";

const all = () => readJSON(KEY, {});

export function getDesign(id) {
  return all()[id] || null;
}

export function saveDesign(doc) {
  const map = all();
  const next = { ...doc, id: doc.id || uid("dsg"), schema: DESIGN_SCHEMA, updatedAt: new Date().toISOString() };
  map[next.id] = next;
  writeJSON(KEY, map);
  return next;
}

export function deleteDesign(id) {
  const map = all();
  delete map[id];
  writeJSON(KEY, map);
}

export function listDesigns() {
  return Object.values(all());
}

/** Ids de todos los originales referenciados por un documento. */
export function collectAssetIds(doc) {
  const ids = new Set();
  Object.values(doc?.faces || {}).forEach((face) =>
    (face?.objects || []).forEach((o) => o.assetId && ids.add(o.assetId))
  );
  return [...ids];
}
