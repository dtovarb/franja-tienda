// Genera assets/img/og-nevrado-v2.png (la imagen que muestran WhatsApp,
// Instagram y Facebook al compartir un link) desde tools/imagen-compartir.html.
// Uso: node tools/imagen-compartir.mjs  (necesita playwright)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const page = fileURLToPath(new URL("./imagen-compartir.html", import.meta.url));
const out = fileURLToPath(new URL("../assets/img/og-nevrado-v2.png", import.meta.url));
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.goto(`file://${page}`);
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: out });
await browser.close();
console.log(out);
