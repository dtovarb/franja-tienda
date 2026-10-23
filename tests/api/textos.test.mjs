/**
 * Textos editables: cada data-text del HTML tiene su clave en
 * assets/js/core/site-texts.js y el texto del HTML es el mismo que el de
 * siempre de esa clave (así el panel muestra lo que de verdad se ve).
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SITE_TEXTS, TEXT_BY_KEY, normalizeSiteTexts, normalizeMarquee, TEXT_LIMITS } from "../../assets/js/core/site-texts.js";

const ROOT = new URL("../../", import.meta.url);
const PAGES = { "index.html": "inicio", "quienes-somos.html": "nosotros", "catalogo.html": "prendas", "disenos.html": "disenos", "preguntas.html": "preguntas" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const render = (t, inBlock) => {
  const e = (s) => esc(s).replace(/\n/g, "<br>");
  if (t.kind !== "paras") return e(t.def);
  const ps = t.def.split(/\n{2,}/);
  return inBlock ? ps.map((p) => `<p>${e(p)}</p>`).join("") : ps.map(e).join("<br><br>");
};

test("cada data-text del HTML coincide con su texto de siempre", async () => {
  const seen = new Set();
  for (const [file, page] of Object.entries(PAGES)) {
    const html = await readFile(new URL(file, ROOT), "utf8");
    assert.match(html, /textos-cargando/, `${file}: falta el script que espera los textos`);
    for (const m of html.matchAll(/<(\w+)([^>]*?)\sdata-text="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const [, tag, , key, , inner] = m;
      const t = TEXT_BY_KEY[key];
      assert.ok(t, `${file}: la clave ${key} no está en site-texts.js`);
      assert.equal(t.page, page, `${file}: ${key} es de otra página`);
      assert.equal(inner, render(t, tag === "div"), `${file}: el texto de ${key} no coincide con el de site-texts.js`);
      assert.ok(!seen.has(key), `${key} está dos veces`);
      seen.add(key);
    }
  }
  assert.ok(seen.size > 50);
});

test("los textos de siempre entran en su límite y las claves no se repiten", () => {
  assert.equal(new Set(SITE_TEXTS.map((t) => t.key)).size, SITE_TEXTS.length);
  for (const t of SITE_TEXTS) assert.ok(t.def.length <= TEXT_LIMITS[t.kind], t.key);
});

test("normalizar textos y marquesina", () => {
  assert.deepEqual(normalizeSiteTexts({ "home.hero.cta1": " Hola  vos\n" }).value, { "home.hero.cta1": "Hola vos" });
  assert.deepEqual(normalizeSiteTexts(["x"]).value, {});
  assert.deepEqual(normalizeSiteTexts({ "home.hero.cta1": 5 }).value, {});
  assert.equal(normalizeSiteTexts({ "home.hero.cta1": "x".repeat(161) }).errors.length, 1);
  assert.equal(normalizeMarquee(null).value.enabled, true);
  assert.deepEqual(normalizeMarquee({ enabled: false, items: [] }), { value: { enabled: false, items: [] }, errors: [] });
  assert.equal(normalizeMarquee({ items: ["x".repeat(41)] }).errors.length, 1);
  assert.equal(normalizeMarquee({ items: Array(13).fill("a") }).errors.length, 1);
});
