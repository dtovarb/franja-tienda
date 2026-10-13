/**
 * Persistencia LOCAL del navegador (prototipo).
 * - localStorage: carrito y documentos de diseño (JSON liviano).
 * - IndexedDB (asset-store.js): archivos originales subidos (binarios).
 *
 * Nada de esto llega a un servidor. Los datos viven solo en este navegador
 * y en este dispositivo, y se pierden si se borran los datos del sitio.
 */
const PREFIX = "franja.";

export class StorageError extends Error {}

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
    throw new StorageError(
      quota
        ? "El almacenamiento local del navegador está lleno. Eliminá artículos del carrito o diseños viejos."
        : "No se pudo guardar en el almacenamiento local del navegador."
    );
  }
}

export function storageAvailable() {
  try {
    localStorage.setItem(PREFIX + "_t", "1");
    localStorage.removeItem(PREFIX + "_t");
    return true;
  } catch {
    return false;
  }
}
