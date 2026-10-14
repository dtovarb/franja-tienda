/**
 * Almacenamiento de archivos.
 *
 * Dos "baldes":
 *   pedidos  PRIVADO. Originales de las clientas, vistas previas, archivos
 *            de impresión y diseños editables. Solo se leen con enlaces
 *            firmados que vencen, emitidos por el panel.
 *   disenos  público. Archivos de los diseños de la tienda (se muestran en
 *            el sitio a cualquiera).
 *
 * Producción: Supabase Storage (API REST, clave de servicio solo en el
 * servidor). Las subidas van directo del navegador al balde con una URL
 * firmada de un solo uso, sin pasar por la función (límite de 4,5 MB).
 *
 * Desarrollo: carpeta local (.data/archivos) con las mismas operaciones y
 * enlaces firmados con HMAC servidos por la propia API.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./http.js";

export const BUCKETS = {
  pedidos: { public: false, limit: 60 * 1024 * 1024 },
  disenos: { public: true, limit: 25 * 1024 * 1024 },
};

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;
function checkKey(bucket, key) {
  if (!BUCKETS[bucket] || !SAFE_KEY.test(key) || key.includes("..")) throw new HttpError(400, "Ruta de archivo inválida.");
}

export function createStorage(config) {
  if (config.supabaseUrl && config.supabaseServiceKey) return supabaseStorage(config);
  if (!config.onVercel) return localStorage(config);
  return null;
}

/* ------------------------------ Supabase ------------------------------ */
function supabaseStorage({ supabaseUrl, supabaseServiceKey }, fetchImpl = fetch) {
  const base = `${supabaseUrl}/storage/v1`;
  const auth = { authorization: `Bearer ${supabaseServiceKey}`, apikey: supabaseServiceKey };
  let bucketsReady = null;
  const ensureBuckets = () =>
    (bucketsReady ||= Promise.all(
      Object.entries(BUCKETS).map(async ([id, b]) => {
        const r = await fetchImpl(`${base}/bucket`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ id, name: id, public: b.public, file_size_limit: b.limit }),
        });
        // 400/409 = ya existe.
        if (!r.ok && ![400, 409].includes(r.status)) throw new Error(`No se pudo crear el balde ${id}: ${r.status}`);
      })
    ).catch((e) => {
      bucketsReady = null;
      throw e;
    }));

  return {
    kind: "supabase",
    async uploadTarget(bucket, key, mime) {
      checkKey(bucket, key);
      await ensureBuckets();
      const r = await fetchImpl(`${base}/object/upload/sign/${bucket}/${key}`, { method: "POST", headers: { ...auth, "x-upsert": "true" } });
      if (!r.ok) throw new Error(`Supabase no emitió la URL de subida (${r.status}).`);
      const { url } = await r.json();
      return { url: `${base}${url}`, method: "PUT", headers: { "content-type": mime, "x-upsert": "true" } };
    },
    async read(bucket, key) {
      checkKey(bucket, key);
      const r = await fetchImpl(`${base}/object/${bucket}/${key}`, { headers: auth });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`No se pudo leer ${bucket}/${key} (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async write(bucket, key, bytes, mime) {
      checkKey(bucket, key);
      await ensureBuckets();
      const r = await fetchImpl(`${base}/object/${bucket}/${key}`, {
        method: "POST",
        headers: { ...auth, "content-type": mime, "x-upsert": "true" },
        body: bytes,
      });
      if (!r.ok) throw new Error(`No se pudo guardar ${bucket}/${key} (${r.status}).`);
    },
    async signedUrl(bucket, key, { expiresIn = 600, downloadName } = {}) {
      checkKey(bucket, key);
      const r = await fetchImpl(`${base}/object/sign/${bucket}/${key}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ expiresIn }),
      });
      if (!r.ok) throw new Error(`No se pudo firmar ${bucket}/${key} (${r.status}).`);
      const { signedURL } = await r.json();
      return `${base}${signedURL}${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ""}`;
    },
    publicUrl(bucket, key) {
      checkKey(bucket, key);
      return `${base}/object/public/${bucket}/${key}`;
    },
  };
}

/* ------------------------------- Local -------------------------------- */
function localStorage({ localFilesDir, sessionSecret }) {
  const root = path.resolve(localFilesDir);
  const file = (bucket, key) => path.join(root, bucket, ...key.split("/"));
  const sign = (payload) => createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const token = (obj) => {
    const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
    return `${p}.${sign(p)}`;
  };
  return {
    kind: "local",
    async uploadTarget(bucket, key, mime) {
      checkKey(bucket, key);
      const t = token({ op: "put", bucket, key, mime, exp: Date.now() + 15 * 60_000 });
      return { url: `/api/archivos-locales?t=${t}`, method: "PUT", headers: { "content-type": mime } };
    },
    async read(bucket, key) {
      checkKey(bucket, key);
      try {
        return new Uint8Array(await readFile(file(bucket, key)));
      } catch {
        return null;
      }
    },
    async write(bucket, key, bytes) {
      checkKey(bucket, key);
      await mkdir(path.dirname(file(bucket, key)), { recursive: true });
      await writeFile(file(bucket, key), bytes);
    },
    async exists(bucket, key) {
      return stat(file(bucket, key)).then(() => true, () => false);
    },
    async signedUrl(bucket, key, { expiresIn = 600, downloadName } = {}) {
      checkKey(bucket, key);
      return `/api/archivos-locales?t=${token({ op: "get", bucket, key, name: downloadName, exp: Date.now() + expiresIn * 1000 })}`;
    },
    publicUrl(bucket, key) {
      checkKey(bucket, key);
      return `/api/archivos-locales?t=${token({ op: "get", bucket, key, exp: 8640000000000000 })}`;
    },
    /** Verifica un token emitido por este almacenamiento. */
    verify(t) {
      const [p, s] = String(t || "").split(".");
      if (!p || !s) return null;
      const a = Buffer.from(sign(p));
      const b = Buffer.from(s);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      const obj = JSON.parse(Buffer.from(p, "base64url").toString());
      return obj.exp > Date.now() ? obj : null;
    },
  };
}
