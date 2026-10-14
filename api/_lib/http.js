/**
 * Utilidades HTTP. El router trabaja con Request/Response estándar (fetch);
 * `nodeHandler` lo adapta a (req, res) de Node, que es lo que usan tanto
 * las funciones de Vercel como el servidor local.
 */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...headers },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
  console.error(err);
  return json({ error: "Error interno del servidor." }, 500);
}

export const MAX_JSON_BYTES = 2 * 1024 * 1024;

export async function readJson(request, max = MAX_JSON_BYTES) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Se esperaba JSON.");
  const buf = await readBytes(request, max);
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, "El JSON no es válido.");
  }
}

export async function readBytes(request, max) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > max) throw new HttpError(413, "El contenido es demasiado grande.");
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength > max) throw new HttpError(413, "El contenido es demasiado grande.");
  return buf;
}

export function getCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** Adapta un handler fetch-style a (req, res) de Node. */
export function nodeHandler(handle) {
  return async (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
    const url = new URL(req.url, `${proto}://${req.headers.host || "localhost"}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v !== undefined) headers.set(k, v);
    }
    const hasBody = !["GET", "HEAD"].includes(req.method);
    let body;
    if (hasBody) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    let response;
    try {
      response = await handle(new Request(url, { method: req.method, headers, body }));
    } catch (err) {
      response = errorResponse(err);
    }
    res.statusCode = response.status;
    response.headers.forEach((v, k) => {
      if (k !== "set-cookie") res.setHeader(k, v);
    });
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
