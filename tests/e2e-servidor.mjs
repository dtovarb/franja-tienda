/**
 * Pruebas de punta a punta CON servidor: levanta tools/servidor-local.mjs
 * con una base y una carpeta de archivos temporales (sin cuentas), y recorre
 * el circuito real: login del panel, catálogo desde la base, diseño,
 * checkout con archivos, estado del pedido y producción.
 *
 *   node tests/e2e-servidor.mjs
 *
 * (tests/e2e.mjs sigue probando el modo demostración, sin servidor.)
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/node22/lib/node_modules/")("playwright"));
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIX = join(HERE, "fixtures");
const SHOTS = join(HERE, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "nevrado-e2e-srv-"));
const env = { ...process.env, LOCAL_DB_DIR: join(TMP, "db"), LOCAL_FILES_DIR: join(TMP, "archivos"), PUERTO: String(PORT), SESSION_SECRET: "e2e" };
// Correo Argentino (MiCorreo) falso, para ver las opciones de envío en el checkout.
const fakeMiCorreo = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url.endsWith("/token")) return res.end(JSON.stringify({ token: "t", expires: new Date(Date.now() + 3600e3).toISOString() }));
  res.end(JSON.stringify({ rates: [
    { deliveredType: "D", productType: "CP", productName: "Paq.ar Clásico", price: 6100 },
    { deliveredType: "D", productType: "EP", productName: "Paq.ar Expreso", price: 8900 },
  ] }));
});
await new Promise((r) => fakeMiCorreo.listen(3199, r));
Object.assign(env, { MICORREO_API_URL: "http://127.0.0.1:3199/micorreo/v1", MICORREO_USER: "u", MICORREO_PASSWORD: "p", MICORREO_CUSTOMER_ID: "1" });
for (const k of ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MP_ACCESS_TOKEN"]) delete env[k];

const results = [];
const consoleErrors = [];
async function t(group, name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true });
    console.log(`  ✓ [${group}] ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ ok: false });
    console.log(`  ✗ [${group}] ${name} — ${String(err.message).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const digits = (s) => Number(String(s).replace(/\D/g, ""));

execFileSync("node", [join(ROOT, "tools/crear-usuaria.mjs"), "duena@nevrado.test"], { env: { ...env, CLAVE: "clave-de-prueba-1" }, stdio: "ignore" });
const server = spawn("node", [join(ROOT, "tools/servidor-local.mjs")], { env, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("nevrado en") && resolve());
  server.on("exit", (c) => reject(new Error(`el servidor terminó (${c})`)));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(e.message));

try {
  await t("Servidor", "La tienda detecta el servidor y lee el catálogo de la base", async () => {
    await page.goto(`${BASE}/catalogo.html`, { waitUntil: "networkidle" });
    const bar = await page.textContent(".demo-bar");
    assert(/Tienda en preparación/.test(bar) && /cobro online todavía sin activar/.test(bar), bar);
    assert((await page.locator("[data-card]").count()) === 6, "catálogo");
    return bar.trim();
  });

  await t("Panel", "Pide login; con la cuenta correcta muestra pedidos, productos y envíos", async () => {
    await page.goto(`${BASE}/admin.html`);
    await page.waitForSelector("[data-login]");
    assert(await page.locator(".admin-tabs").isHidden(), "las pestañas no deberían verse");
    await page.fill("#lg-email", "duena@nevrado.test");
    await page.fill("#lg-pass", "mala");
    await page.click("[data-login] [type=submit]");
    await page.waitForFunction(() => document.querySelector("[data-login-errors]").textContent.length > 0);
    await page.fill("#lg-pass", "clave-de-prueba-1");
    await page.click("[data-login] [type=submit]");
    await page.waitForSelector("[data-design-row]");
    assert(/duena@nevrado\.test/.test(await page.textContent(".admin-warning")), "sesión");
    await page.click("#tab-envios");
    await page.waitForSelector("[data-rate]");
    assert((await page.locator("[data-rate] .tag").count()) === 2, "tarifas de ejemplo marcadas");
    await page.screenshot({ path: join(SHOTS, "servidor-panel-envios.png"), fullPage: true });
    return "login rechaza la clave mala y entra con la buena";
  });

  await t("Panel", "Cambiar el precio de un producto se ve en la tienda", async () => {
    await page.click("#tab-productos");
    await page.click('[data-product-row="tote-bag"] summary');
    await page.fill("#p-price-tote-bag", "13500");
    await page.click('[data-product-form="tote-bag"] [type=submit]');
    await page.waitForSelector('[data-product-row="tote-bag"] .hint:has-text("13.500")');
    await page.goto(`${BASE}/producto.html?id=tote-bag`);
    await page.waitForSelector("[data-unit-price], .price");
    assert(/13\.500/.test(await page.textContent("main")), "precio nuevo en la ficha");
    return "tote $13.500 en la base y en la ficha";
  });

  let orderUrl;
  await t("Checkout", "Diseño → carrito → datos y envío → pedido creado con sus archivos", async () => {
    await page.goto(`${BASE}/editor.html?product=remera-clasica&color=negro&size=M&qty=2`);
    await page.waitForSelector("[data-loading]", { state: "hidden", timeout: 15000 });
    await page.setInputFiles("[data-file-input]", join(FIX, "grafica-alta.png"));
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 1, null, { timeout: 10000 });
    await page.fill("#quicktext", "CÓRDOBA");
    await page.click("[data-quicktext] button");
    await page.click('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    if (await page.locator("[data-ack]").count()) await page.check("[data-ack]");
    await page.click("[data-add-cart]");
    await page.waitForURL(/carrito\.html/);
    await page.click("[data-checkout]");
    await page.waitForSelector("[data-checkout-form]");
    await page.click("[data-co-submit]");
    assert(/nombre/.test(await page.textContent("[data-co-errors]")), "valida datos");
    await page.fill("#co-name", "Flor Prueba");
    await page.fill("#co-email", "flor@example.com");
    await page.fill("#co-phone", "351 555 1234");
    // Opciones del correo, se elige una y cambia el total.
    await page.fill("#co-postalCode", "1425");
    await page.waitForSelector(".ship-option");
    assert((await page.locator(".ship-option").count()) === 2, "opciones de envío");
    assert(digits(await page.textContent("[data-total]")) === 37800 + 6100, "total con la más barata");
    await page.check('.ship-option input[value="correo-argentino:EP"]');
    assert(digits(await page.textContent("[data-total]")) === 37800 + 8900, "total con expreso");
    await page.screenshot({ path: join(SHOTS, "servidor-checkout-envios.png") });
    await page.fill("#co-street", "San Martín");
    await page.fill("#co-number", "123");
    await page.fill("#co-city", "Córdoba");
    assert(digits(await page.textContent("[data-total]")) === 37800 + 8900, "total con expreso");
    await page.screenshot({ path: join(SHOTS, "servidor-checkout.png"), fullPage: true });
    await page.click("[data-co-submit]");
    await page.waitForURL(/pedido\.html\?id=.+&t=.+&nuevo=1/, { timeout: 60000 });
    await page.waitForSelector(".order-view");
    orderUrl = page.url();
    const text = await page.textContent("main");
    assert(/Pedido n\.º 1001/.test(text) && /Esperando el pago/.test(text) && /46\.700/.test(text), text.slice(0, 200));
    assert((await page.textContent("[data-cart-count]")) === "0", "el carrito debería quedar vacío");
    await page.screenshot({ path: join(SHOTS, "servidor-pedido.png"), fullPage: true });
    return "pedido n.º 1001 por $46.700 (expreso de Correo Argentino)";
  });

  await t("Producción", "El panel ve el pedido, baja los archivos y avanza el estado", async () => {
    await page.goto(`${BASE}/admin.html#pedidos`);
    await page.waitForSelector('[data-order-row] summary:has-text("1001")');
    await page.click('[data-order-row] summary:has-text("1001")');
    await page.waitForSelector("[data-status-form]");
    const links = page.locator(".order-admin__files a");
    assert((await links.count()) === 3, `archivos: ${await links.count()}`); // original, vista previa, impresión
    const [d] = await Promise.all([page.waitForEvent("download"), links.filter({ hasText: "Original" }).click()]);
    const got = readFileSync(await d.path());
    assert(sha(got) === sha(readFileSync(join(FIX, "grafica-alta.png"))), "el original no es idéntico");
    const [p] = await Promise.all([page.waitForEvent("download"), links.filter({ hasText: "Impresión" }).click()]);
    const print = readFileSync(await p.path());
    assert(print.subarray(1, 4).toString() === "PNG" && print.includes(Buffer.from("pHYs")), "archivo de impresión");
    await page.screenshot({ path: join(SHOTS, "servidor-panel-pedido.png"), fullPage: true });
    for (const st of ["pagado", "produccion"]) {
      await page.selectOption("[data-status-form] select", st);
      await page.click("[data-status-form] [type=submit]");
      await page.waitForSelector(`[data-order-row] .tag:has-text("${st === "pagado" ? "Pagado" : "En producción"}")`);
      await page.waitForSelector("[data-status-form]");
    }
    const options = await page.locator("[data-status-form] option").allTextContents();
    assert(!options.some((o) => /Cancelado/.test(o)), "en producción no se puede cancelar");
    return `original idéntico (${got.length} B), impresión PNG con DPI; pagado → producción`;
  });

  await t("Clienta", "El enlace del pedido muestra el estado nuevo; sin token, nada", async () => {
    await page.goto(orderUrl.replace("&nuevo=1", ""));
    await page.waitForSelector('.order-steps [aria-current="step"]');
    assert(/En producción/.test(await page.textContent('.order-steps [aria-current="step"]')), "estado");
    await page.goto(orderUrl.replace(/&t=[^&]+/, "&t=otro"));
    await page.waitForSelector(".notice--danger");
    return "producción visible; token inválido rechazado";
  });

  await t("Móvil", "Checkout y pedido sin desborde horizontal", async () => {
    const m = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(orderUrl);
    await mp.waitForSelector(".order-view");
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await mp.screenshot({ path: join(SHOTS, "servidor-movil-pedido.png"), fullPage: true });
    await m.close();
    assert(over <= 1, `desborde ${over}px`);
  });
} finally {
  await browser.close();
  server.kill();
  fakeMiCorreo.close();
  rmSync(TMP, { recursive: true, force: true });
}

const ok = results.filter((r) => r.ok).length;
if (consoleErrors.length) console.log(`Errores de consola:\n  ${[...new Set(consoleErrors)].join("\n  ")}`);
console.log(`${ok}/${results.length} pruebas con servidor OK`);
process.exit(ok === results.length ? 0 : 1);
