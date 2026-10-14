/**
 * Validación de archivos en el servidor. El navegador ya controla tipo y
 * tamaño, pero acá se repite con los bytes reales: el navegador no es de
 * fiar.
 */
import { createHash } from "node:crypto";
import { HttpError } from "./http.js";

export const FILE_RULES = {
  // Originales de la clienta y archivos de diseños de la tienda.
  original: { mimes: ["image/png", "image/jpeg", "image/svg+xml"], max: 25 * 1024 * 1024 },
  // Generados en el navegador a partir del diseño.
  preview: { mimes: ["image/png", "image/jpeg"], max: 15 * 1024 * 1024 },
  // 50 MB: el máximo por archivo de Supabase en el plan gratuito (ver BUCKETS en storage.js).
  print: { mimes: ["image/png"], max: 50 * 1024 * 1024 },
  design: { mimes: ["application/json"], max: 2 * 1024 * 1024 },
};

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "application/json": "json" };
export const extFor = (mime) => EXT[mime] || "bin";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Clave del archivo en el balde: por rol y hash (contenido direccionable). */
export const storageKeyFor = (role, hash, mime) => `${role}/${hash.slice(0, 2)}/${hash}.${extFor(mime)}`;

export function checkDeclared(file) {
  const rule = FILE_RULES[file?.role];
  if (!rule) throw new HttpError(422, "Tipo de archivo desconocido.");
  if (!/^[0-9a-f]{64}$/.test(file.sha256 || "")) throw new HttpError(422, "Falta el hash del archivo.");
  if (!rule.mimes.includes(file.mime)) throw new HttpError(422, `Formato no permitido para ${file.role}: ${file.mime}.`);
  if (!Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > rule.max) {
    throw new HttpError(422, `El archivo pesa demasiado (máximo ${Math.round(rule.max / 1024 / 1024)} MB).`);
  }
  return rule;
}

/** Comprueba que los bytes subidos sean los declarados. Devuelve un mensaje de error o null. */
export function inspectBytes(bytes, { mime, sha256: expected, bytes: size }) {
  if (!bytes) return "El archivo no llegó al almacenamiento.";
  if (bytes.byteLength !== size) return "El archivo subido no tiene el tamaño esperado.";
  if (sha256(bytes) !== expected) return "El archivo subido no coincide con el original (hash distinto).";
  const head = bytes.subarray(0, 16);
  const is = (...sig) => sig.every((b, i) => head[i] === b);
  if (mime === "image/png" && !is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "No es un PNG válido.";
  if (mime === "image/jpeg" && !is(0xff, 0xd8, 0xff)) return "No es un JPG válido.";
  if (mime === "image/svg+xml") return svgProblem(new TextDecoder().decode(bytes));
  if (mime === "application/json") {
    try {
      JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return "El diseño editable no es JSON válido.";
    }
  }
  return null;
}

/**
 * Los SVG con código o con referencias externas se rechazan (no se "limpian"):
 * el archivo que se guarda tiene que ser exactamente el que mandó la clienta.
 */
export function svgProblem(text) {
  if (!/<svg[\s>]/i.test(text)) return "No es un SVG válido.";
  if (/<script[\s>]/i.test(text)) return "El SVG tiene código (script) y no se acepta.";
  if (/\son[a-z]+\s*=/i.test(text)) return "El SVG tiene código (eventos) y no se acepta.";
  if (/javascript:/i.test(text)) return "El SVG tiene enlaces con código y no se acepta.";
  if (/<foreignObject[\s>]/i.test(text)) return "El SVG tiene contenido HTML incrustado y no se acepta.";
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)) return "El SVG carga recursos externos y no se acepta.";
  if (/@import|url\(\s*['"]?(?:https?:|\/\/)/i.test(text)) return "El SVG carga estilos o fuentes externas y no se acepta.";
  if (/<!ENTITY/i.test(text)) return "El SVG declara entidades y no se acepta.";
  return null;
}
