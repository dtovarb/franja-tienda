/**
 * Conexión con el servidor de la tienda (api/, ver docs/SERVIDOR.md).
 *
 * Al cargar, cada página pregunta una vez si hay servidor listo
 * (GET api/health). Si no responde o no está configurado, la tienda sigue
 * en MODO DEMOSTRACIÓN: catálogo, carrito y panel en este navegador, sin
 * cobros. Así el mismo sitio funciona publicado solo (o en la vista previa)
 * y con servidor.
 */
export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function detect() {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch("api/health", { signal: ctrl.signal, cache: "no-store", headers: { accept: "application/json" } });
    clearTimeout(timer);
    if (!r.ok || !(r.headers.get("content-type") || "").includes("application/json")) return null;
    const h = await r.json();
    return h?.ok && h.ready ? h : null;
  } catch {
    return null;
  }
}

const detected = await detect();
/** Catálogo del servidor ({ colors, products, storeDesigns }) o null. */
export const CATALOG = detected ? await api("catalog").catch(() => null) : null;
/** null = modo demostración; si no, { services: { db, storage, auth, payments } }. */
export const SERVER = CATALOG ? detected : null;

export async function api(path, { method = "GET", body, signal } = {}) {
  const r = await fetch(`api/${path}`, {
    method,
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await r.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!r.ok) throw new ApiError(data.error || `El servidor respondió ${r.status}.`, r.status, data);
  return data;
}

/** Sube un Blob a la URL firmada que dio el servidor. */
export async function putToTarget(target, blob) {
  const r = await fetch(target.url, { method: target.method || "PUT", headers: target.headers || {}, body: blob });
  if (!r.ok) throw new ApiError("No se pudo subir un archivo. Revisá la conexión y probá de nuevo.", r.status);
}
