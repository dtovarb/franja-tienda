/**
 * Pruebas funcionales de punta a punta con Playwright + Chromium.
 *
 * Uso:
 *   python3 -m http.server 8080            (en la raíz del proyecto, otra terminal)
 *   python3 tests/make-fixtures.py         (una vez; requiere Pillow)
 *   node tests/e2e.mjs [http://localhost:8080]
 *
 * Requiere el paquete "playwright" (npm i -D playwright o instalado global).
 * Genera tests/results.json y capturas en tests/screenshots/.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
const FIX = join(HERE, "fixtures");
const SHOTS = join(HERE, "screenshots");
const DL = join(tmpdir(), "nevrado-e2e-downloads");
const BASE = process.argv[2] || "http://localhost:8080";
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
async function t(group, name, fn) {
  try {
    const detail = await fn();
    results.push({ group, name, ok: true, detail: detail ?? "" });
    console.log(`  ✓ [${group}] ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ group, name, ok: false, detail: String(err.message || err).split("\n")[0] });
    console.log(`  ✗ [${group}] ${name} — ${err.message}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const fixture = (n) => join(FIX, n);

function watch(page, label) {
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${label}: ${m.text()}`));
  page.on("pageerror", (e) => consoleErrors.push(`${label}: ${e.message}`));
}

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function editorReady(page) {
  await page.waitForSelector("[data-loading]", { state: "hidden", timeout: 15000 });
}
const objs = (page) => page.evaluate(() => window.__editor.canvas.getObjects().map((o) => ({ type: o.type, left: o.left, top: o.top, sx: o.scaleX, sy: o.scaleY, angle: o.angle, text: o.text, fontFamily: o.fontFamily, fontWeight: o.fontWeight, fill: o.fill, textAlign: o.textAlign, fontSize: o.fontSize, out: !!o.outOfArea })));
const select = (page, i) => page.evaluate((i) => { const c = window.__editor.canvas; c.setActiveObject(c.getObjects()[i]); c.requestRenderAll(); c.fire("selection:created"); }, i);

/** Centro del objeto i en coordenadas de página. */
async function objCenter(page, i) {
  return page.evaluate((i) => {
    const { canvas } = window.__editor;
    const o = canvas.getObjects()[i];
    const r = canvas.upperCanvasEl.getBoundingClientRect();
    const p = o.getCenterPoint();
    const z = canvas.getZoom();
    return { x: r.left + p.x * z, y: r.top + p.y * z };
  }, i);
}

async function upload(page, name) {
  await page.setInputFiles("[data-file-input]", fixture(name));
  await page.waitForFunction(() => document.querySelector("[data-dropzone]").dataset.busy !== "true");
  await page.waitForTimeout(150);
}

async function download(page, selector) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click(selector)]);
  const path = join(DL, d.suggestedFilename());
  await d.saveAs(path);
  return { path, name: d.suggestedFilename(), buf: readFileSync(path) };
}

function pngInfo(buf) {
  assert(buf.subarray(1, 4).toString() === "PNG", "no es PNG");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), colorType = buf[25];
  let dpi = null, p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.subarray(p + 4, p + 8).toString();
    if (type === "pHYs") dpi = Math.round(buf.readUInt32BE(p + 8) * 0.0254);
    if (type === "IDAT") break;
    p += 12 + len;
  }
  return { w, h, colorType, dpi };
}

/* =========================================================== */
const browser = await chromium.launch();

/* ------------------------- ESCRITORIO ------------------------- */
console.log("\nEscritorio 1440×900");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, "desktop");

  await t("Tienda", "Inicio carga con header, hero, destacados y footer", async () => {
    await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
    assert(await page.locator(".hero__title").isVisible(), "sin hero");
    const n = await page.locator("[data-featured] .pcard").count();
    assert(n === 4, `destacados: ${n}`);
    assert(!(await page.locator(".hero__garment svg, .ed-card svg svg").count()), "las prendas del inicio no deberían tener estampa");
    assert(!/buzo canguro/i.test(await page.textContent("[data-editorial]")), "el lookbook no debería tener el buzo canguro");
    assert(await page.locator(".site-footer").isVisible(), "sin footer");
    assert((await page.locator("[data-cart-count]").textContent()) === "0", "carrito no vacío");
    assert((await overflowX(page)) <= 0, "desborde horizontal");
    await page.screenshot({ path: join(SHOTS, "desktop-inicio.png"), fullPage: true });
    return "4 destacados, sin desborde";
  });

  await t("Tienda", "Catálogo lista prendas y filtra por tipo", async () => {
    await page.click("text=Ver todo el catálogo");
    await page.waitForSelector("[data-grid] .pcard");
    const all = await page.locator("[data-grid] .pcard").count();
    await page.click('[data-filter="hoodie"]');
    const hood = await page.locator("[data-grid] .pcard").count();
    assert(all === 6 && hood === 1, `todo=${all} buzo=${hood}`);
    await page.click('[data-filter="all"]');
    await page.screenshot({ path: join(SHOTS, "desktop-catalogo.png"), fullPage: true });
    return `${all} tarjetas; filtro buzo=${hood}`;
  });

  await t("Producto", "Selección de color, talle y cantidad con precio", async () => {
    await page.click('.pcard:has-text("Remera Clásica") .btn--primary');
    await page.waitForSelector("[data-form]");
    await page.click('[data-color="negro"]');
    await page.click('[data-size="XXL"]');
    let unit = await page.textContent("[data-unit]");
    assert(unit.replace(/\D/g, "") === "20400", `XXL unit=${unit}`);
    await page.click('[data-size="L"]');
    await page.click('[data-qty="1"]');
    unit = await page.textContent("[data-unit]");
    assert(unit.replace(/\D/g, "") === "18900", `L unit=${unit}`);
    const sizeOut = await page.locator('[data-size="XXL"]').isDisabled();
    assert(!sizeOut, "XXL debería estar disponible en remera clásica");
    await page.screenshot({ path: join(SHOTS, "desktop-producto.png") });
    return "XXL suma $1.500; L $18.900 × 2";
  });

  await t("Producto", "La selección se conserva al abrir el editor", async () => {
    await page.click("[data-form] button[type=submit]");
    await page.waitForURL(/editor\.html/);
    await editorReady(page);
    const line = await page.textContent("[data-variant-line]");
    assert(/Negro/.test(line) && /Talle L/.test(line) && /2 u\./.test(line), line);
    return line.trim();
  });

  await t("Editor", "Rechaza archivos inválidos con mensajes claros", async () => {
    const msgs = [];
    for (const f of ["falso.png", "malicioso.svg", "documento.gif"]) {
      await upload(page, f);
      const err = await page.textContent("[data-upload-error]");
      assert(await page.locator("[data-upload-error]").isVisible(), `sin error para ${f}`);
      msgs.push(`${f}: ${err.trim().slice(0, 60)}`);
    }
    assert((await objs(page)).length === 0, "se agregó un archivo inválido");
    return msgs.join(" | ");
  });

  let hiAssetId;
  await t("Editor", "Sube PNG con transparencia y conserva el original intacto", async () => {
    await upload(page, "grafica-alta.png");
    const o = await objs(page);
    assert(o.length === 1 && o[0].type === "image", JSON.stringify(o));
    const info = await page.evaluate(async () => {
      const { getAsset, sha256Hex } = await import("/assets/js/core/asset-store.js");
      const obj = window.__editor.canvas.getObjects()[0];
      const a = await getAsset(obj.assetId);
      return { id: obj.assetId, size: a.blob.size, type: a.blob.type, hash: await sha256Hex(a.blob) };
    });
    const local = readFileSync(fixture("grafica-alta.png"));
    assert(info.size === local.length && info.hash === sha(local) && info.id === sha(local), "el original cambió");
    hiAssetId = info.id;
    return `IndexedDB: ${info.size} bytes, SHA-256 idéntico al archivo`;
  });

  await t("Editor", "Agrega y modifica texto (contenido, fuente, tamaño, color, negrita, alineación)", async () => {
    await page.fill("#quicktext", "STREET 01");
    await page.click("[data-quicktext] button");
    let o = await objs(page);
    assert(o.length === 2 && o[1].type === "i-text" && o[1].text === "STREET 01", "texto no agregado");
    await page.fill("#p-text", "FRANJA\nCREW");
    await page.selectOption("#p-font", "Anton");
    assert(await page.locator('[data-p="bold"]').isDisabled(), "negrita debería deshabilitarse en Anton");
    await page.selectOption("#p-font", "Space Grotesk");
    await page.click('[data-p="bold"]');
    await page.fill("#p-fontSize", "90");
    await page.click('[data-p="fill"][data-v="#7d3a5e"]');
    await page.click('[data-p="align"][data-v="left"]');
    await page.waitForTimeout(450);
    o = await objs(page);
    const tx = o[1];
    assert(tx.text === "FRANJA\nCREW", `text=${tx.text}`);
    assert(tx.fontFamily === "Space Grotesk" && tx.fontWeight === "bold", `${tx.fontFamily} ${tx.fontWeight}`);
    assert(Math.round(tx.fontSize * tx.sy) === 90, `size=${tx.fontSize * tx.sy}`);
    assert(tx.fill === "#7d3a5e" && tx.textAlign === "left", `${tx.fill} ${tx.textAlign}`);
    return "Space Grotesk bold 90pt magenta, alineado a la izquierda";
  });

  await t("Editor", "Mueve un elemento arrastrando con el mouse", async () => {
    const before = (await objs(page))[1];
    const c = await objCenter(page, 1);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y + 40, { steps: 6 });
    await page.mouse.up();
    const after = (await objs(page))[1];
    assert(Math.abs(after.top - before.top) > 20, `top ${before.top}→${after.top}`);
    return `Δ ${Math.round(after.left - before.left)}, ${Math.round(after.top - before.top)} unidades`;
  });

  await t("Editor", "Ajuste numérico de posición, tamaño (proporcional) y rotación", async () => {
    await select(page, 0);
    await page.fill("#p-x", "15");
    await page.fill("#p-w", "20");
    await page.fill("#p-angle", "30");
    await page.waitForTimeout(450);
    const o = (await objs(page))[0];
    const spec = { x: 332, cm: 0.09 };
    assert(Math.abs((o.left - spec.x) * spec.cm - 15) < 0.06, `x=${(o.left - spec.x) * spec.cm}`);
    assert(Math.abs(o.sx - o.sy) < 1e-9, "escalado no proporcional");
    assert(Math.abs(3000 * o.sx * 0.09 - 20) < 0.06, `w=${3000 * o.sx * 0.09}`);
    assert(Math.round(o.angle) === 30, `angle=${o.angle}`);
    return "X=15 cm, ancho=20 cm, 30°";
  });

  await t("Editor", "Escala arrastrando la esquina sin deformar", async () => {
    await page.fill("#p-angle", "0");
    await page.waitForTimeout(400);
    const before = (await objs(page))[0];
    const corner = await page.evaluate(() => {
      const { canvas } = window.__editor;
      const o = canvas.getActiveObject();
      o.setCoords();
      const r = canvas.upperCanvasEl.getBoundingClientRect();
      return { x: r.left + o.oCoords.br.x, y: r.top + o.oCoords.br.y };
    });
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x - 25, corner.y - 10, { steps: 6 });
    await page.mouse.up();
    const after = (await objs(page))[0];
    assert(after.sx < before.sx, `sx ${before.sx}→${after.sx}`);
    assert(Math.abs(after.sx - after.sy) < 1e-9, "deformó");
    return `escala ${before.sx.toFixed(4)} → ${after.sx.toFixed(4)} (x = y)`;
  });

  await t("Editor", "Duplicar, eliminar, deshacer y rehacer", async () => {
    await select(page, 1);
    await page.click('[data-ctx] [data-action="duplicate"]');
    assert((await objs(page)).length === 3, "duplicar");
    await page.click('[data-ctx] [data-action="delete"]');
    assert((await objs(page)).length === 2, "eliminar");
    await page.click('[data-action="undo"]');
    await page.waitForTimeout(250);
    assert((await objs(page)).length === 3, "deshacer eliminar");
    await page.click('[data-action="redo"]');
    await page.waitForTimeout(250);
    assert((await objs(page)).length === 2, "rehacer eliminar");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    const n1 = (await objs(page)).length;
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(250);
    const n2 = (await objs(page)).length;
    assert(n1 === 3 && n2 === 2, `atajos ${n1}/${n2}`);
    return "botones y atajos Ctrl+Z / Ctrl+Shift+Z";
  });

  await t("Editor", "Advierte y bloquea elementos fuera del área imprimible", async () => {
    await select(page, 1);
    await page.fill("#p-x", "-6");
    await page.waitForTimeout(450);
    assert(await page.locator("[data-stage-status] .notice--danger").isVisible(), "sin aviso");
    assert((await page.getAttribute("[data-guides]", "data-out")) === "true", "guía no marcada");
    await page.click('[data-action="finalize"]');
    await page.waitForSelector('[data-step="content"][data-st="error"]');
    await page.screenshot({ path: join(SHOTS, "desktop-fuera-de-area.png") });
    await page.click("[data-fin-back]");
    await page.click('[data-action="fit-all"]');
    await page.waitForTimeout(300);
    assert(!(await page.locator("[data-stage-status] .notice--danger").count()), "el aviso sigue");
    return "aviso visible, finalizar bloqueado, «Ajustar» lo corrige";
  });

  await t("Editor", "Cada cara conserva su diseño al cambiar de vista", async () => {
    const front = await objs(page);
    await page.click('[data-face="back"]');
    await page.waitForTimeout(300);
    assert((await objs(page)).length === 0, "espalda no vacía");
    assert(await page.locator("[data-empty]").isVisible(), "sin estado vacío");
    await upload(page, "logo.svg");
    await upload(page, "grafica-baja.png");
    await select(page, 1);
    await page.fill("#p-w", "24");
    await page.waitForTimeout(450);
    const lvl = await page.getAttribute("[data-dpi]", "data-level");
    assert(lvl === "low", `nivel DPI ${lvl}`);
    await page.screenshot({ path: join(SHOTS, "desktop-editor-espalda-baja-resolucion.png") });
    await page.click('[data-face="front"]');
    await page.waitForTimeout(300);
    const front2 = await objs(page);
    assert(front2.length === front.length && front2.every((o, i) => Math.abs(o.left - front[i].left) < 1e-6 && o.type === front[i].type), "frente cambió");
    await page.click('[data-face="back"]');
    await page.waitForTimeout(300);
    const back = await objs(page);
    assert(back.length === 2 && back[0].type === "image", "espalda cambió");
    await page.click('[data-face="front"]');
    await page.waitForTimeout(300);
    return "frente 2 elementos / espalda 2 elementos (SVG + PNG 320 px → DPI bajo)";
  });

  await t("Editor", "Guías no se dibujan en el canvas (solo superposición)", async () => {
    const r = await page.evaluate(() => {
      const c = window.__editor.canvas;
      return { objects: c.getObjects().map((o) => o.type), guidesInDom: !!document.querySelector("[data-guides] .area") };
    });
    assert(r.objects.every((t) => t === "image" || t === "i-text") && r.guidesInDom, JSON.stringify(r));
    await select(page, 1);
    await page.screenshot({ path: join(SHOTS, "desktop-editor.png") });
    return "guías en SVG superpuesto, no en el JSON exportable";
  });

  await t("Responsive", "Lienzo y prenda se mantienen alineados al redimensionar", async () => {
    const snap = async () =>
      page.evaluate(() => {
        const st = document.querySelector("[data-stage]").getBoundingClientRect();
        const mk = document.querySelector("[data-mockup] svg").getBoundingClientRect();
        const cv = window.__editor.canvas.upperCanvasEl.getBoundingClientRect();
        const o = window.__editor.canvas.getObjects()[0];
        return { st, mk, cv, left: o.left, ratio: st.height / st.width };
      });
    const sizes = [];
    for (const [w, h] of [[1440, 900], [1024, 768], [1280, 640]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const s = await snap();
      assert(Math.abs(s.st.width - s.cv.width) < 1.5 && Math.abs(s.st.height - s.cv.height) < 1.5, "canvas ≠ escenario");
      assert(Math.abs(s.mk.width - s.cv.width) < 1.5 && Math.abs(s.mk.left - s.cv.left) < 1.5, "mockup ≠ canvas");
      assert(Math.abs(s.ratio - 1.2) < 0.01, `proporción ${s.ratio}`);
      sizes.push(`${w}×${h}→${Math.round(s.st.width)}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    return sizes.join(", ");
  });

  await t("Editor", "Autoguardado del borrador sobrevive a recargar la página", async () => {
    await page.waitForTimeout(700);
    await page.reload();
    await editorReady(page);
    const front = await objs(page);
    await page.click('[data-face="back"]');
    await page.waitForTimeout(300);
    const back = await objs(page);
    await page.click('[data-face="front"]');
    await page.waitForTimeout(300);
    assert(front.length === 2 && back.length === 2, `front=${front.length} back=${back.length}`);
    return "borrador recuperado desde localStorage + IndexedDB";
  });

  const printSpec = { wCm: 336 * 0.09, hCm: 448 * 0.09 };
  await t("Finalizar", "Valida, reconstruye y resume el diseño", async () => {
    await page.click('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    const states = await page.$$eval("[data-step]", (els) => els.map((e) => `${e.dataset.step}:${e.dataset.st}`));
    assert(states.every((s) => /:(ok|warn)$/.test(s)), states.join(","));
    assert(states.includes("resolution:warn"), "debía advertir resolución");
    assert(await page.locator("[data-add-cart]").isDisabled(), "carrito habilitado sin aceptar baja resolución");
    const sum = await page.textContent("[data-fin-side]");
    assert(/Remera Clásica/.test(sum) && /Negro/.test(sum) && /L/.test(sum) && /23\.400/.test(sum) && /46\.800/.test(sum), sum.replace(/\s+/g, " ").slice(0, 200));
    await page.screenshot({ path: join(SHOTS, "desktop-finalizar.png") });
    return states.join(" ");
  });

  await t("Exportación", "Vista previa PNG de la prenda", async () => {
    const d = await download(page, '[data-dl="preview:front"]');
    const i = pngInfo(d.buf);
    assert(i.w === 1200 && i.h === 1440, `${i.w}×${i.h}`);
    return `${d.name} ${i.w}×${i.h}`;
  });

  await t("Exportación", "Archivo de impresión 300 DPI, transparente, sin prenda ni guías", async () => {
    const d = await download(page, '[data-dl="print:front"]');
    const i = pngInfo(d.buf);
    const ew = Math.round((printSpec.wCm / 2.54) * 300), eh = Math.round((printSpec.hCm / 2.54) * 300);
    assert(Math.abs(i.w - ew) <= 1 && Math.abs(i.h - eh) <= 1, `${i.w}×${i.h} esperado ${ew}×${eh}`);
    assert(i.dpi === 300, `pHYs ${i.dpi}`);
    assert(i.colorType === 6, "sin canal alfa");
    const alpha = execFileSync("python3", ["-c", "import sys;from PIL import Image;im=Image.open(sys.argv[1]);print(im.getpixel((2,2))[3], im.getpixel((im.width-3,im.height-3))[3])", d.path]).toString().trim();
    assert(alpha === "0 0", `esquinas no transparentes: ${alpha}`);
    return `${i.w}×${i.h} px = ${printSpec.wCm.toFixed(1)}×${printSpec.hCm.toFixed(1)} cm @ ${i.dpi} DPI, esquinas alfa=0`;
  });

  await t("Exportación", "Modo «ajustado al diseño» a 150 DPI", async () => {
    await page.selectOption("[data-opt-dpi]", "150");
    await page.selectOption("[data-opt-mode]", "content");
    const d = await download(page, '[data-dl="print:back"]');
    const i = pngInfo(d.buf);
    assert(i.dpi === 150 && i.w > 100 && i.w < 2000, `${i.w}×${i.h} @${i.dpi}`);
    await page.selectOption("[data-opt-dpi]", "300");
    await page.selectOption("[data-opt-mode]", "area");
    return `${i.w}×${i.h} @ ${i.dpi} DPI`;
  });

  await t("Exportación", "Diseño editable JSON con referencias a originales", async () => {
    const d = await download(page, '[data-dl="json"]');
    const j = JSON.parse(d.buf.toString());
    assert(j.schema === "nevrado.design/v1", j.schema);
    assert(Object.keys(j.faces).join() === "front,back", Object.keys(j.faces).join());
    const imgs = Object.values(j.faces).flatMap((f) => f.fabric.objects.filter((o) => o.type === "image"));
    assert(imgs.every((o) => o.src === `asset:${o.assetId}` && j.assets.some((a) => a.id === o.assetId)), "refs");
    assert(!d.buf.toString().includes("data:image") && !d.buf.toString().includes("blob:"), "binario embebido");
    assert(j.assets.some((a) => a.sha256 === hiAssetId), "falta original");
    return `${j.assets.length} originales referenciados, ${imgs.length} imágenes, sin binarios embebidos`;
  });

  await t("Exportación", "Descarga del original idéntico al subido", async () => {
    const d = await download(page, `[data-dl="orig:${hiAssetId}"]`);
    assert(sha(d.buf) === sha(readFileSync(fixture("grafica-alta.png"))), "hash distinto");
    return `${d.name} SHA-256 idéntico`;
  });

  await t("Exportación", "Paquete ZIP completo y verificable", async () => {
    const d = await download(page, '[data-dl="zip"]');
    const py = `
import zipfile,hashlib,json,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
names=z.namelist(); doc=json.loads(z.read('diseno.json'))
ok=all(hashlib.sha256(z.read(a['path'])).hexdigest()==a['sha256'] for a in doc['assets'])
print(len(names), ok, ','.join(sorted(n.split('/')[0] for n in names)))`;
    const out = execFileSync("python3", ["-c", py, d.path]).toString().trim();
    assert(/ True /.test(out) && /impresion/.test(out) && /originals/.test(out) && /vista-previa/.test(out), out);
    return `${out.split(" ")[0]} archivos, CRC ok, originales con SHA-256 correcto`;
  });

  await t("Finalizar", "Volver al editor no pierde cambios", async () => {
    await page.click("[data-fin-back]");
    const o = await objs(page);
    assert(o.length === 2, `${o.length}`);
    await page.click('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    return "2 elementos en el frente tras volver";
  });

  await t("Carrito", "Agrega al carrito tras aceptar la advertencia de resolución", async () => {
    await page.check("[data-ack]");
    await page.click("[data-add-cart]");
    await page.waitForURL(/carrito\.html/);
    await page.waitForSelector(".cart-item");
    const n = await page.locator(".cart-item").count();
    const total = await page.textContent("[data-total]");
    const thumb = await page.getAttribute(".cart-item__thumb", "src");
    assert(n === 1 && total.replace(/\D/g, "") === "46800" && thumb.startsWith("data:image/jpeg"), `${n} ${total}`);
    assert((await page.textContent("[data-cart-count]")) === "2", "contador");
    await page.screenshot({ path: join(SHOTS, "desktop-carrito.png"), fullPage: true });
    return `1 artículo, 2 u. × $23.400 = ${total.trim()}`;
  });

  await t("Carrito", "Modifica cantidad y recalcula total", async () => {
    await page.click('.cart-item [data-d="1"]');
    await page.waitForTimeout(150);
    const total = await page.textContent("[data-total]");
    assert(total.replace(/\D/g, "") === "70200", total);
    return `3 u. → ${total.trim()}`;
  });

  await t("Carrito", "Persiste al recargar y volver al diseño desde el carrito", async () => {
    await page.reload();
    await page.waitForSelector(".cart-item");
    await page.click("text=Editar diseño");
    await page.waitForURL(/editor\.html/);
    await editorReady(page);
    const line = await page.textContent("[data-variant-line]");
    assert(/3 u\./.test(line), line);
    assert((await objs(page)).length === 2, "diseño no recuperado");
    await page.fill("#quicktext", "EDICIÓN 2");
    await page.click("[data-quicktext] button");
    await page.click('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    assert(/Actualizar/.test(await page.textContent("[data-add-cart]")), "debería actualizar");
    await page.check("[data-ack]");
    await page.click("[data-add-cart]");
    await page.waitForURL(/carrito\.html/);
    await page.waitForSelector(".cart-item");
    assert((await page.locator(".cart-item").count()) === 1, "duplicó el artículo");
    return "editado y actualizado en el mismo artículo";
  });

  await t("Carrito", "Flujo de demostración termina sin simular pago", async () => {
    await page.click("[data-checkout]");
    const txt = await page.textContent(".confirm-panel");
    assert(/No se creó ningún pedido real/.test(txt) && /pedido de prueba n.º/.test(txt) && /POST \/api\/orders/.test(txt), txt.slice(0, 120));
    await page.screenshot({ path: join(SHOTS, "desktop-confirmacion-demo.png"), fullPage: true });
    return "confirmación de demo con payload que iría a la API";
  });

  await t("Carrito", "Eliminar artículo con confirmación", async () => {
    await page.goto(`${BASE}/carrito.html`);
    await page.click(".cart-item [data-remove]");
    await page.click("dialog [data-confirm]");
    await page.waitForSelector(".empty");
    return "carrito vacío";
  });

  await t("Editor", "Vaciar cara pide confirmación y es reversible", async () => {
    await page.goto(`${BASE}/editor.html?product=tote-bag&color=crudo&size=Único&qty=1`);
    await editorReady(page);
    await page.click('[data-empty] [data-action="add-text"]');
    await page.click('[data-tab="layers"]');
    await page.click('[data-action="clear"]');
    await page.click("dialog [data-confirm]");
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 0, null, { timeout: 3000 }).catch(() => {});
    assert((await objs(page)).length === 0, "no vació");
    await page.click('[data-action="undo"]');
    await page.waitForTimeout(250);
    assert((await objs(page)).length === 1, "no deshizo");
    return "vaciar + deshacer";
  });

  /* ---------------- Catálogo nuevo, diseños de la tienda y panel ---------------- */
  const priceNum = (txt) => Number(String(txt).replace(/[^\d]/g, ""));

  await t("Catálogo", "Buzo cuello redondo y gorra: ficha y editor con su área; sin buzo con capucha", async () => {
    await page.goto(`${BASE}/catalogo.html`);
    await page.waitForSelector("[data-grid] .pcard");
    assert(!(await page.locator('.pcard:has-text("Buzo con capucha")').count()), "el buzo con capucha debería haberse quitado");
    assert(await page.locator('.pcard:has-text("Buzo cuello redondo")').count(), "falta buzo cuello redondo");
    assert(await page.locator('.pcard:has-text("Gorra")').count(), "falta gorra");
    await page.goto(`${BASE}/producto.html?id=gorra`);
    assert((await page.locator("[data-face]").count()) === 1, "la gorra debería tener una sola cara");
    await page.goto(`${BASE}/editor.html?product=gorra&color=azul&size=Único&qty=1`);
    await editorReady(page);
    const area = await page.evaluate(() => {
      const s = window.__editor.ed.product;
      return s.type;
    });
    assert(area === "cap", area);
    await page.click('[data-empty] [data-action="add-text"]');
    await page.waitForTimeout(200);
    const o = (await objs(page))[0];
    assert(o && !o.out, "el texto quedó fuera del área de la gorra");
    await page.goto(`${BASE}/editor.html?product=buzo-cuello-redondo&color=bordo&size=M&qty=1`);
    await editorReady(page);
    assert((await page.evaluate(() => window.__editor.ed.product.type)) === "crewneck", "tipo");
    await page.screenshot({ path: join(SHOTS, "desktop-editor-buzo-cuello-redondo.png") });
    return "6 prendas; gorra con 1 cara; editor de gorra y buzo";
  });

  await t("Catálogo", "Tocar un color en cualquier tarjeta cambia la prenda y lo lleva a la ficha", async () => {
    await page.goto(`${BASE}/catalogo.html`);
    await page.waitForSelector("[data-grid] .pcard");
    const ids = await page.$$eval("[data-card]", (els) => els.map((e) => e.dataset.card));
    assert(!(await page.locator(".pcard__svg svg").count()), "las prendas del catálogo no deberían tener estampa");
    let checked = 0;
    for (const id of ids) {
      const card = page.locator(`[data-card="${id}"]`);
      const colors = await card.locator("[data-card-color]").evaluateAll((els) => els.map((e) => e.dataset.cardColor));
      for (const c of colors) {
        const before = await card.locator(".pcard__svg").evaluate((s) => s.outerHTML);
        await card.locator(`[data-card-color="${c}"]`).click();
        const after = await card.locator(".pcard__svg").evaluate((s) => s.outerHTML);
        if (c !== colors[0]) assert(after !== before, `${id} ${c}: la prenda no cambió`);
        assert((await card.locator(`[data-card-color="${c}"]`).getAttribute("aria-pressed")) === "true", `${id} ${c}: no queda marcado`);
        assert((await card.locator(".pcard__media").getAttribute("href")).includes(`color=${c}`), `${id} ${c}: el enlace no lleva el color`);
        checked++;
      }
    }
    // El color elegido llega a la ficha
    const card = page.locator('[data-card="buzo-cuello-redondo"]');
    await card.locator('[data-card-color="rosa"]').click();
    await card.locator(".pcard__media").click();
    await page.waitForSelector("[data-stage] svg");
    assert((await page.textContent("[data-color-name]")) === "Rosa", "la ficha no abrió en rosa");
    return `${ids.length} prendas, ${checked} colores`;
  });

  await t("Catálogo", "En la ficha de cada prenda, cada color cambia la imagen", async () => {
    const { ids } = await page.evaluate(async () => ({ ids: (await import("./assets/js/data/catalog.js")).PRODUCTS.map((p) => p.id) }));
    let n = 0;
    for (const id of ids) {
      await page.goto(`${BASE}/producto.html?id=${id}`);
      await page.waitForSelector("[data-stage] svg");
      const colors = await page.$$eval("[data-color]", (els) => els.map((e) => e.dataset.color));
      const seen = new Set();
      for (const c of colors) {
        await page.click(`[data-color="${c}"]`);
        const svg = await page.locator("[data-stage] svg").evaluate((s) => s.outerHTML.replace(/id="[^"]*"|url\(#[^)]*\)|g[a-z0-9]{3,}/g, ""));
        assert(!seen.has(svg), `${id}: ${c} se ve igual que otro color`);
        seen.add(svg);
        assert((await page.getAttribute(`[data-color="${c}"]`, "aria-checked")) === "true", `${id} ${c} no marcado`);
        n++;
      }
    }
    return `${ids.length} prendas, ${n} colores distintos`;
  });

  await t("Diseños", "Elegir un diseño listo y una prenda lo lleva al editor con su precio", async () => {
    await page.goto(`${BASE}/disenos.html`);
    await page.waitForSelector("[data-design-card]");
    const n = await page.locator("[data-design-card]").count();
    assert(n === 5, `diseños publicados: ${n}`);
    assert((await overflowX(page)) <= 0, "desborde");
    await page.screenshot({ path: join(SHOTS, "desktop-disenos.png"), fullPage: true });
    await page.click('[data-design-card="sd-lunas"] a:has-text("Gorra")');
    await page.waitForSelector("[data-chosen-design]");
    const unit = priceNum(await page.textContent("[data-unit]"));
    assert(unit === 14900 + 3000, `precio ficha ${unit}`);
    await page.click("[data-form] button[type=submit]");
    await page.waitForURL(/editor\.html.*storeDesign=sd-lunas/);
    await editorReady(page);
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 1, null, { timeout: 8000 });
    const info = await page.evaluate(() => {
      const o = window.__editor.canvas.getObjects()[0];
      return { sd: o.storeDesignId, asset: o.assetId, out: !!o.outOfArea, unit: window.__editor.price().unit };
    });
    assert(info.sd === "sd-lunas" && info.asset && !info.out, JSON.stringify(info));
    assert(info.unit === 17900, `precio editor ${info.unit}`);
    assert(priceNum(await page.textContent("[data-unit-price]")) === 17900, "precio en barra");
    await page.screenshot({ path: join(SHOTS, "desktop-editor-diseno-tienda.png") });
    await page.click('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    if (await page.locator("[data-ack]").count()) await page.check("[data-ack]");
    await page.click("[data-add-cart]");
    await page.waitForURL(/carrito\.html/);
    await page.waitForSelector(".cart-item");
    const row = await page.textContent(".cart-item:last-child");
    assert(/Diseño «Dos lunas»/.test(row) && /17\.900/.test(row), row.slice(0, 200));
    return "ficha $17.900 → editor con el diseño ubicado → carrito con el cargo del diseño";
  });

  await t("Diseños", "Agregar un diseño de la tienda desde el editor (se cobra una vez)", async () => {
    await page.goto(`${BASE}/editor.html?product=remera-clasica&color=blanco&size=M&qty=1`);
    await editorReady(page);
    await page.waitForSelector('[data-store-design="sd-sol"]');
    assert(await page.locator('[data-store-design="sd-ramito"]').count(), "ramito debería estar en remera");
    await page.click('[data-store-design="sd-sol"]');
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 1, null, { timeout: 8000 });
    await page.click('[data-store-design="sd-sol"]');
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 2, null, { timeout: 8000 });
    const unit = await page.evaluate(() => window.__editor.price().unit);
    assert(unit === 18900 + 3500, `precio ${unit}`);
    await page.goto(`${BASE}/editor.html?product=gorra&color=azul&size=Único&qty=1`);
    await editorReady(page);
    await page.waitForSelector("[data-store-design]");
    assert(!(await page.locator('[data-store-design="sd-ramito"]').count()), "ramito no es para gorra");
    return "dos copias del sol = un solo cargo; filtro por prenda";
  });

  await t("Panel", "Crear un diseño con archivo y publicarlo/ocultarlo en la tienda", async () => {
    await page.goto(`${BASE}/admin.html`);
    await page.waitForSelector("[data-design-row]");
    assert(/no tiene usuario ni contraseña/i.test(await page.textContent(".admin-warning")), "falta el aviso");
    await page.click("[data-new-design]");
    await page.click("[data-design-form] button[type=submit]");
    const errs = await page.textContent("[data-design-errors]");
    assert(/nombre/.test(errs) && /archivo/.test(errs), errs);
    await page.fill("#d-name", "Prueba del panel");
    await page.fill("#d-price", "2500");
    await page.setInputFiles("#d-file", fixture("malicioso.svg"));
    await page.click("[data-design-form] button[type=submit]");
    await page.waitForFunction(() => document.querySelector("[data-design-errors]").textContent.length > 0);
    await page.setInputFiles("#d-file", fixture("logo.svg"));
    await page.click("[data-design-form] button[type=submit]");
    await page.waitForSelector('[data-design-row]:has-text("Prueba del panel")');
    await page.screenshot({ path: join(SHOTS, "desktop-panel-disenos.png"), fullPage: true });
    await page.goto(`${BASE}/disenos.html`);
    await page.waitForSelector('[data-design-card]:has-text("Prueba del panel")');
    assert((await page.locator("[data-design-card]").count()) === 6, "no apareció en la tienda");
    await page.click('[data-design-card]:has-text("Prueba del panel") a:has-text("Remera Clásica")');
    await page.click("[data-form] button[type=submit]");
    await editorReady(page);
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 1, null, { timeout: 8000 });
    const unit = await page.evaluate(() => window.__editor.price().unit);
    assert(unit === 18900 + 2500, `precio ${unit}`);
    await page.goto(`${BASE}/admin.html`);
    await page.click('[data-design-row]:has-text("Prueba del panel") [data-toggle-design]');
    await page.goto(`${BASE}/disenos.html`);
    await page.waitForSelector("[data-design-card]");
    assert((await page.locator("[data-design-card]").count()) === 5, "sigue visible después de ocultarlo");
    return "validación, SVG peligroso rechazado, alta → tienda → editor ($21.400), ocultar";
  });

  await t("Panel", "Editar precio, stock y visibilidad de un producto se refleja en la tienda", async () => {
    await page.goto(`${BASE}/admin.html#productos`);
    const row = '[data-product-row="remera-clasica"]';
    await page.click(`${row} summary`);
    await page.fill(`${row} [name=basePrice]`, "20000");
    await page.selectOption(`${row} [name=stock-0]`, "out");
    await page.click(`${row} button[type=submit]`);
    await page.click('[data-product-row="gorra"] summary');
    await page.uncheck('[data-product-row="gorra"] [name=active]');
    await page.click('[data-product-row="gorra"] button[type=submit]');
    await page.goto(`${BASE}/producto.html?id=remera-clasica`);
    assert(priceNum(await page.textContent("[data-unit]")) === 20000, "precio no actualizado");
    assert(await page.locator('[data-size="S"]').isDisabled(), "talle S debería estar sin stock");
    await page.goto(`${BASE}/catalogo.html`);
    await page.waitForSelector("[data-grid] .pcard");
    assert((await page.locator("[data-grid] .pcard").count()) === 5, "la gorra oculta sigue en el catálogo");
    return "precio $20.000, talle S sin stock, gorra oculta";
  });

  await t("Panel", "Pedidos de prueba: se listan, cambian de estado y se restablece todo", async () => {
    await page.goto(`${BASE}/carrito.html`);
    await page.waitForSelector(".cart-item");
    await page.click("[data-checkout]");
    await page.waitForSelector(".confirm-panel");
    await page.goto(`${BASE}/admin.html#pedidos`);
    await page.waitForSelector("[data-order-row]");
    const first = page.locator("[data-order-row]").first();
    assert(/Gorra/.test(await first.textContent()) && /Dos lunas/.test(await first.textContent()), "el pedido no muestra la gorra con el diseño");
    await first.locator("[data-order-status]").selectOption("produccion");
    await page.reload();
    assert((await page.locator("[data-order-row] [data-order-status]").first().inputValue()) === "produccion", "estado no persistió");
    await page.screenshot({ path: join(SHOTS, "desktop-panel-pedidos.png"), fullPage: true });
    await page.click("[data-reset]");
    await page.click("dialog [data-confirm]");
    await page.waitForSelector("[data-panel=pedidos] .empty");
    await page.goto(`${BASE}/producto.html?id=remera-clasica`);
    assert(priceNum(await page.textContent("[data-unit]")) === 18900, "no se restableció el precio");
    return "pedido con diseño de la tienda → en producción → restablecido";
  });

  await t("Fotos", "Las prendas con foto usan la foto y sus mapas de luz; la espalda queda ilustrada", async () => {
    await page.goto(`${BASE}/producto.html?id=buzo-cuello-redondo&color=rojo`);
    await page.waitForSelector("[data-stage] svg");
    const front = await page.evaluate(() => {
      const svg = document.querySelector("[data-stage] svg");
      return { photo: svg.hasAttribute("data-photo"), hrefs: [...svg.querySelectorAll("image")].map((i) => i.getAttribute("href")) };
    });
    assert(front.photo, "el frente no usa foto");
    assert(front.hrefs.includes("assets/img/prendas/crewneck-rojo.jpg") && front.hrefs.some((h) => h.endsWith("crewneck-rojo-sombra.png")), front.hrefs.join(","));
    assert(/foto de referencia/i.test(await page.textContent("[data-stage-note]")), "nota de foto");
    await page.click('[data-face="back"]');
    assert(!(await page.locator("[data-stage] svg[data-photo]").count()), "la espalda no tiene foto");
    assert(/ilustrada/i.test(await page.textContent("[data-stage-note]")), "nota de espalda");
    // Todas las fotos y mapas existen y cargan
    const missing = await page.evaluate(async () => {
      const { PRODUCTS } = await import("./assets/js/data/catalog.js");
      const { garmentPhoto } = await import("./assets/js/data/garments.js");
      const urls = [];
      PRODUCTS.forEach((p) => p.colors.forEach((c) => {
        const ph = garmentPhoto(p.type, "front", c);
        if (ph) urls.push(ph.base, ph.shade, ph.light);
      }));
      const bad = [];
      for (const u of urls) if (!(await fetch(u)).ok) bad.push(u);
      return { n: urls.length, bad };
    });
    assert(missing.n === 69 && !missing.bad.length, `fotos ${missing.n}, faltan ${missing.bad.join(",")}`);
    await page.screenshot({ path: join(SHOTS, "desktop-producto-foto.png") });
    return `${missing.n / 3} prendas con foto (frente); espalda ilustrada`;
  });

  await t("Fotos", "Vista previa final dibuja la foto, la estampa y las luces de la tela", async () => {
    await page.goto(`${BASE}/editor.html?product=remera-clasica&color=negro&size=M&qty=1`);
    await editorReady(page);
    await page.click('[data-store-design="sd-sol"]');
    await page.waitForFunction(() => window.__editor.canvas.getObjects().length === 1, null, { timeout: 8000 });
    assert(await page.locator(".ed-mockup svg[data-photo]").count(), "el editor no usa la foto");
    const px = await page.evaluate(async () => {
      const { renderPreview } = await import("./assets/js/editor/export.js");
      const ed = window.__editor;
      const o = ed.canvas.getObjects()[0].getBoundingRect(true, true);
      const blob = await renderPreview({ productType: "tee", colorHex: "#171717", colorId: "negro", face: "front", objects: ed.ed.faces.front, scale: 0.5 });
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const at = (lx, ly) => [...x.getImageData(Math.round(lx * 0.5), Math.round(ly * 0.5), 1, 1).data].slice(0, 3);
      return { corner: at(10, 10), chest: at(o.left + o.width / 2, o.top + o.height * 0.3) };
    });
    // Esquina = fondo gris de la foto (no el #f5f5f3 del dibujo); pecho = estampa (no la tela negra)
    assert(px.corner.every((v) => v > 110 && v < 170), `esquina ${px.corner}`);
    assert(Math.max(...px.chest) > 90, `pecho sin estampa ${px.chest}`);
    return `esquina ${px.corner} · pecho ${px.chest}`;
  });

  await t("Ayuda", "Preguntas frecuentes: temas, acordeón y medidas reales por prenda", async () => {
    await page.goto(`${BASE}/index.html`);
    await page.click('#main-nav a:has-text("Preguntas")');
    await page.waitForSelector("[data-faq]");
    assert((await page.locator(".faq__group").count()) === 4, "grupos");
    const n = await page.locator("[data-faq]").count();
    assert(n >= 15, `preguntas ${n}`);
    const q = page.locator("[data-faq]").first();
    assert(!(await q.getAttribute("open")), "debería empezar cerrada");
    await q.locator("summary").click();
    assert((await q.getAttribute("open")) !== null, "no abre");
    const rows = await page.locator("[data-print-sizes] tbody tr").count();
    assert(rows === 6, `tabla ${rows}`);
    assert((await page.textContent("[data-print-sizes]")).includes("30,2 × 40,3") || (await page.textContent("[data-print-sizes]")).includes("30.2 × 40.3"), "medida de la remera");
    assert((await page.textContent("[data-extra-face]")).includes("4.500"), "precio cara extra");
    await page.goto(`${BASE}/preguntas.html#envios`);
    assert((await page.locator("#envios details[open]").count()) === 1, "el enlace al tema no abre la primera pregunta");
    await page.screenshot({ path: join(SHOTS, "desktop-preguntas.png"), fullPage: true });
    return `${n} preguntas en 4 temas; tabla de ${rows} prendas`;
  });

  await t("Ayuda", "Opiniones de ejemplo en inicio y producto, siempre marcadas como ejemplo", async () => {
    await page.goto(`${BASE}/index.html#opiniones`);
    await page.waitForSelector("[data-review]");
    assert((await page.locator("#opiniones [data-review]").count()) === 3, "inicio muestra 3");
    assert(/simuladas/i.test(await page.textContent("#opiniones .reviews__note")), "falta aviso de ejemplo");
    assert((await page.textContent("#opiniones .reviews__summary")).includes("10 opiniones de ejemplo"), "resumen");
    await page.goto(`${BASE}/producto.html?id=remera-oversize`);
    await page.waitForSelector("#opiniones [data-review]");
    const cards = page.locator("#opiniones [data-review]");
    assert((await cards.count()) === 2, `oversize ${await cards.count()}`);
    for (let i = 0; i < 2; i++) assert((await cards.nth(i).textContent()).includes("Opinión de ejemplo"), "una opinión sin etiqueta");
    assert((await page.textContent("#opiniones .reviews__avg")).trim() === "4,5", "promedio");
    // Ninguna página publica opiniones simuladas como datos estructurados
    assert(!(await page.locator('script[type="application/ld+json"]').count()), "no debe haber JSON-LD");
    await page.screenshot({ path: join(SHOTS, "desktop-opiniones.png"), fullPage: true });
    return "inicio 3 · oversize 2 (4,5)";
  });

  await ctx.close();
}

/* ------------------------- MÓVIL ------------------------- */
console.log("\nMóvil 390×844 (táctil)");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, "mobile");

  await t("Móvil", "Diseños y panel sin desborde horizontal", async () => {
    for (const u of ["disenos.html", "admin.html", "admin.html#productos"]) {
      await page.goto(`${BASE}/${u}`, { waitUntil: "networkidle" });
      const ov = await overflowX(page);
      assert(ov <= 0, `${u} desborde ${ov}`);
    }
    await page.goto(`${BASE}/disenos.html`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SHOTS, "movil-disenos.png"), fullPage: true });
    await page.goto(`${BASE}/admin.html`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(SHOTS, "movil-panel.png"), fullPage: true });
    return "disenos.html, admin.html";
  });

  await t("Móvil", "Preguntas frecuentes y opiniones sin desborde", async () => {
    for (const u of ["preguntas.html", "producto.html?id=gorra", "index.html#opiniones"]) {
      await page.goto(`${BASE}/${u}`, { waitUntil: "networkidle" });
      const ov = await overflowX(page);
      assert(ov <= 0, `${u} desborde ${ov}`);
    }
    await page.goto(`${BASE}/preguntas.html`, { waitUntil: "networkidle" });
    await page.tap("[data-faq] summary");
    await page.screenshot({ path: join(SHOTS, "movil-preguntas.png"), fullPage: true });
    return "preguntas, producto, inicio";
  });

  await t("Móvil", "Inicio y catálogo sin desborde horizontal; menú abre", async () => {
    await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
    assert((await overflowX(page)) <= 0, `desborde ${await overflowX(page)}`);
    await page.screenshot({ path: join(SHOTS, "movil-inicio.png"), fullPage: true });
    await page.tap(".menu-toggle");
    assert((await page.getAttribute("#main-nav", "data-open")) === "true", "menú");
    await page.tap('#main-nav a:has-text("Prendas")');
    await page.waitForSelector("[data-grid] .pcard");
    assert((await overflowX(page)) <= 0, "desborde catálogo");
    await page.screenshot({ path: join(SHOTS, "movil-catalogo.png"), fullPage: true });
    return "sin desborde";
  });

  await t("Móvil", "Producto: selección táctil y paso al editor", async () => {
    await page.goto(`${BASE}/producto.html?id=buzo-canguro`);
    await page.tap('[data-color="blanco"]');
    await page.tap('[data-size="M"]');
    assert((await overflowX(page)) <= 0, "desborde");
    await page.screenshot({ path: join(SHOTS, "movil-producto.png"), fullPage: true });
    await page.tap("[data-form] button[type=submit]");
    await page.waitForURL(/editor\.html/);
    await editorReady(page);
    return (await page.textContent("[data-variant-line]")).trim();
  });

  await t("Móvil", "Editor: prenda visible, barra táctil y panel desplegable", async () => {
    const st = await page.locator("[data-stage]").boundingBox();
    assert(st.width >= 300, `escenario chico: ${st.width}`);
    const btns = await page.$$eval(".ed-mobilebar button", (b) => b.map((x) => x.getBoundingClientRect().height));
    assert(btns.length === 5 && btns.every((h) => h >= 44), `botones ${btns}`);
    await page.tap('[data-sheet-open="tools:add"]');
    assert(await page.locator(".ed-panel--tools").isVisible(), "panel no abre");
    await upload(page, "foto.jpg");
    assert(!(await page.locator(".ed-panel--tools").isVisible()), "panel no se cerró tras subir");
    await page.tap('.ed-mobilebar [data-action="add-text"]');
    assert(await page.locator(".ed-panel--props").isVisible(), "propiedades no abren");
    const st2 = await page.locator("[data-stage]").boundingBox();
    assert(st2.height > 180, "la prenda queda oculta con el panel abierto");
    await page.fill("#p-text", "BARRIO");
    await page.screenshot({ path: join(SHOTS, "movil-editor-propiedades.png") });
    await page.tap(".ed-panel--props [data-close-sheet]");
    assert(!(await page.locator(".ed-panel--props").isVisible()), "no cierra");
    assert((await overflowX(page)) <= 0, "desborde");
    await page.screenshot({ path: join(SHOTS, "movil-editor.png") });
    return `escenario ${Math.round(st.width)}×${Math.round(st.height)} → ${Math.round(st2.width)}×${Math.round(st2.height)} con panel`;
  });

  await t("Móvil", "Arrastre táctil mueve el elemento", async () => {
    const before = (await objs(page))[1];
    const c = await objCenter(page, 1);
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(c.x, c.y) });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(c.x + i * 4, c.y + i * 5) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(200);
    const after = (await objs(page))[1];
    assert(Math.abs(after.top - before.top) > 10, `top ${before.top}→${after.top}`);
    return `Δy ${Math.round(after.top - before.top)} unidades`;
  });

  await t("Móvil", "Finalizar y agregar al carrito desde el teléfono", async () => {
    await page.evaluate(() => window.__editor.canvas.discardActiveObject());
    // Si el arrastre dejó algo fuera del área, se usa «Ajustar» como haría el usuario
    if (await page.locator('[data-action="fit-all"]').count()) await page.tap('[data-action="fit-all"]');
    await page.tap('[data-action="finalize"]');
    await page.waitForSelector("[data-add-cart]", { timeout: 30000 });
    await page.screenshot({ path: join(SHOTS, "movil-finalizar.png") });
    if (await page.locator("[data-ack]").count()) await page.check("[data-ack]");
    await page.tap("[data-add-cart]");
    await page.waitForURL(/carrito\.html/);
    await page.waitForSelector(".cart-item");
    assert((await overflowX(page)) <= 0, "desborde carrito");
    await page.screenshot({ path: join(SHOTS, "movil-carrito.png"), fullPage: true });
    return "artículo en carrito, sin desborde";
  });

  await ctx.close();
}

/* ------------------------- TABLET ------------------------- */
console.log("\nTablet 820×1180");
{
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, "tablet");
  await t("Tablet", "Páginas y editor sin desborde", async () => {
    const res = [];
    for (const u of ["index.html", "catalogo.html", "disenos.html", "admin.html", "producto.html?id=gorra&diseno=sd-lunas", "carrito.html", "editor.html?product=remera-oversize&color=grafito&size=L&qty=1"]) {
      await page.goto(`${BASE}/${u}`, { waitUntil: "networkidle" });
      if (u.startsWith("editor")) await editorReady(page);
      const ov = await overflowX(page);
      assert(ov <= 0, `${u} desborde ${ov}`);
      res.push(u.split("?")[0]);
    }
    await page.screenshot({ path: join(SHOTS, "tablet-editor.png") });
    return res.join(", ");
  });
  await ctx.close();
}

await browser.close();

/* ------------------------- Consola ------------------------- */
results.push({
  group: "Calidad",
  name: "Sin errores en la consola del navegador",
  ok: consoleErrors.length === 0,
  detail: consoleErrors.length ? consoleErrors.slice(0, 5).join(" | ") : "0 errores",
});

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} pruebas OK`);
if (consoleErrors.length) console.log("Errores de consola:\n" + consoleErrors.join("\n"));
writeFileSync(join(HERE, "results.json"), JSON.stringify({ date: new Date().toISOString(), base: BASE, passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
