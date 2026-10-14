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

// Supabase no deja que el límite de un balde supere el límite global del
// proyecto, que en el plan gratuito es 50 MB: con más, el balde no se crea.
export const BUCKETS = {
  pedidos: { public: false, limit: 50 * 1024 * 1024 },
  disenos: { public: true, limit: 25 * 1024 * 1024 },
};

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;
function checkKey(bucket, key) {
  if (!BUCKETS[bucket] || !SAFE_KEY.test(key) || key.includes("..")) throw new HttpError(400, "Ruta de archivo inválida.");
}

export function createStorage(config, fetchImpl = fetch) {
  if (config.supabaseUrl && config.supabaseServiceKey) return supabaseStorage(config, fetchImpl);
  if (!config.onVercel) return localStorage(config);
  return null;
}

/** Falla del almacenamiento: el detalle va al registro y la clienta ve un mensaje claro. */
function unavailable(detail) {
  console.error(`Almacenamiento: ${detail}`);
  return new HttpError(503, "No pudimos guardar los archivos del pedido. Probá de nuevo en unos minutos; si sigue pasando, escribinos.");
}
const reason = async (r) => {
  const t = await r.text().catch(() => "");
  return `${r.status}${t ? ` ${t.slice(0, 300)}` : ""}`;
};

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
        if (r.ok) return;
        const why = await reason(r);
        // No se pudo crear: puede que ya exista (Supabase responde 400 o 409)
        // o que lo hayan creado a mano. Se comprueba que esté y que sea como debe.
        const g = await fetchImpl(`${base}/bucket/${id}`, { headers: auth });
        if (!g.ok) throw unavailable(`no se pudo crear el balde ${id} (${why}) y no existe (${g.status}).`);
        const existing = await g.json().catch(() => ({}));
        if (!b.public && existing.public) throw unavailable(`el balde ${id} es público y tiene que ser privado: cambialo en Supabase → Storage.`);
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
      if (!r.ok) throw unavailable(`Supabase no emitió la URL de subida de ${bucket}/${key} (${await reason(r)}).`);
      const { url } = await r.json();
      return { url: `${base}${url}`, method: "PUT", headers: { "content-type": mime, "x-upsert": "true" } };
    },
    async read(bucket, key) {
      checkKey(bucket, key);
      const r = await fetchImpl(`${base}/object/${bucket}/${key}`, { headers: auth });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw unavailable(`no se pudo leer ${bucket}/${key} (${await reason(r)}).`);
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
      if (!r.ok) throw unavailable(`no se pudo guardar ${bucket}/${key} (${await reason(r)}).`);
    },
    async signedUrl(bucket, key, { expiresIn = 600, downloadName } = {}) {
      checkKey(bucket, key);
      const r = await fetchImpl(`${base}/object/sign/${bucket}/${key}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ expiresIn }),
      });
      if (!r.ok) throw unavailable(`no se pudo firmar ${bucket}/${key} (${await reason(r)}).`);
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
