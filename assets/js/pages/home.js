import { initPage, icon } from "../core/ui.js";
import { PRODUCTS, getProduct } from "../data/catalog.js";
import { productCard, productMockup } from "./components.js";

initPage("home");

// CTA con ícono
document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("beforeend", icon(el.dataset.icon)));

// Hero: composición con mockups de demostración
const visual = document.querySelector("[data-hero-visual]");
const ovr = getProduct("remera-oversize");
const hoodie = getProduct("buzo-canguro");
visual.insertAdjacentHTML(
  "afterbegin",
  productMockup(ovr, "negro", "front", { className: "hero__garment" }) +
    productMockup(hoodie, "melange", "front", { className: "hero__garment hero__garment--2" })
);

// Marquee
const words = ["Remeras", "Buzos", "Totes", "Estampado en taller propio", "Diseño frente y espalda", "Archivos a 300 DPI"];
const run = words.map((w) => `<span>${w}<i>✦</i></span>`).join("");
document.querySelector("[data-marquee]").innerHTML = run + run;

// Destacados
document.querySelector("[data-featured]").innerHTML = PRODUCTS.filter((p) => p.featured)
  .map((p, i) => productCard(p, { index: i }))
  .join("");

// Editorial
const tee = getProduct("remera-clasica");
const tote = getProduct("tote-bag");
document.querySelector("[data-editorial]").innerHTML = `
  <figure class="ed-card ed-card--a">
    ${productMockup(hoodie, "bordo", "back")}
    <figcaption><span class="tag tag--ink">Buzo canguro · espalda</span><span class="tag tag--demo" style="background:#fff">Demo</span></figcaption>
  </figure>
  <figure class="ed-card ed-card--b">
    ${productMockup(tote, "crudo", "front")}
    <figcaption><span class="tag tag--magenta">Tote · crudo</span></figcaption>
  </figure>
  <figure class="ed-card ed-card--c">
    ${productMockup(tee, "blanco", "front")}
    <figcaption><span class="tag tag--ink">Remera clásica · blanco</span></figcaption>
  </figure>
  <div class="ed-quote">
    <span class="tag tag--pink">Manifiesto</span>
    <p class="display">Una prenda con tu firma vale más que cualquier logo prestado.</p>
  </div>`;
