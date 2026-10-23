/**
 * Servidor local: sirve el sitio y la API en http://localhost:3000.
 *
 *   npm install
 *   npm run dev            (PUERTO=4000 npm run dev para otro puerto)
 *
 * Sin variables de entorno usa una base PGlite en .data/db y guarda los
 * archivos en .data/archivos: no hace falta ninguna cuenta. Para entrar al
 * panel, primero: npm run usuaria -- tu@mail.com
 * Con un archivo .env (ver .env.example) usa Supabase y Mercado Pago reales.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
try {
  process.loadEnvFile?.(".env");
} catch {
  /* sin .env: modo local */
}
const { createApp } = await import("../api/_lib/app.js");
const { nodeHandler } = await import("../api/_lib/http.js");

const PORT = Number(process.env.PUERTO || process.env.PORT || 3000);
const app = createApp();
const api = nodeHandler(app.handle);

const TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", woff2: "font/woff2", ico: "image/x-icon",
};
const PRIVATE = /^\/(api|tools|tests|node_modules|\.data|\.git|supabase|docs)(\/|$)|^\/\./;

const server = http.createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, "http://x");
  // Las mismas reescrituras que vercel.json.
  const ficha = pathname.match(/^\/diseno\/([^/]+)$/);
  if (ficha) {
    const q = new URLSearchParams(search);
    q.set("nombre", decodeURIComponent(ficha[1]));
    req.url = `/api/pagina-diseno?${q}`;
    return api(req, res);
  }
  if (pathname === "/sitemap.xml") {
    req.url = "/api/sitemap";
    return api(req, res);
  }
  if (pathname.startsWith("/api/")) return api(req, res);
  if (PRIVATE.test(pathname)) {
    res.statusCode = 404;
    return res.end("No existe.");
  }
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.setHeader("content-type", TYPES[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream");
    res.setHeader("cache-control", "no-cache");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("No existe.");
  }
});

await app.init().catch((err) => {
  console.error("No se pudo preparar la base:", err.message);
  process.exit(1);
});
server.listen(PORT, () => {
  const c = app.config;
  console.log(`nevrado en http://localhost:${PORT}`);
  console.log(`  base: ${c.databaseUrl ? "Postgres (DATABASE_URL)" : `PGlite en ${c.localDbDir}`}`);
  console.log(`  archivos: ${c.supabaseServiceKey ? "Supabase Storage" : c.localFilesDir}`);
  console.log(`  pagos: ${c.mpAccessToken ? "Mercado Pago" : "sin configurar"}`);
});
