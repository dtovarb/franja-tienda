/**
 * Almacén local de archivos ORIGINALES (IndexedDB).
 *
 * Cada archivo subido se guarda tal cual llegó (mismo Blob, mismos bytes),
 * identificado por su hash SHA-256. Nunca se reemplaza por una versión
 * comprimida ni transformada. Si el editor necesita una copia derivada para
 * mostrar (p. ej. un SVG sin width/height), se guarda aparte en `renderBlob`.
 *
 * En producción este módulo se reemplaza por subida a almacenamiento privado
 * (S3/GCS/R2) mediante URLs firmadas emitidas por el backend.
 */
const DB_NAME = "nevrado-assets";
const STORE = "assets";
let dbPromise = null;
const urlCache = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("Este navegador no soporta IndexedDB."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir IndexedDB."));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("Transacción cancelada (¿almacenamiento lleno?)."));
      })
  );
}

const reqToPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Guarda un original. Si ya existe (mismo hash) no lo duplica. */
export async function putAsset(record) {
  const existing = await getAsset(record.id);
  if (existing) return existing;
  const rec = { ...record, createdAt: new Date().toISOString() };
  await tx("readwrite", (s) => s.put(rec));
  return rec;
}

export function getAsset(id) {
  return tx("readonly", (s) => reqToPromise(s.get(id)));
}

export async function getAssets(ids) {
  const out = [];
  for (const id of new Set(ids)) {
    const a = await getAsset(id);
    if (a) out.push(a);
  }
  return out;
}

/** URL de objeto para mostrar el recurso en el editor (copia derivada si existe). */
export async function assetDisplayUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const a = await getAsset(id);
  if (!a) return null;
  const url = URL.createObjectURL(a.renderBlob || a.blob);
  urlCache.set(id, url);
  return url;
}

export function cacheDisplayUrl(id, url) {
  urlCache.set(id, url);
}

export async function deleteAssets(ids) {
  await tx("readwrite", (s) => ids.forEach((id) => s.delete(id)));
  ids.forEach((id) => {
    const u = urlCache.get(id);
    if (u) URL.revokeObjectURL(u);
    urlCache.delete(id);
  });
}
