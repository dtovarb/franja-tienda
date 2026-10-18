import { initPage, icon } from "../core/ui.js";
import { activeProducts, getProduct, getColor } from "../data/catalog.js";
import { garmentSvg, luminance, GARMENTS } from "../data/garments.js";
import { listStoreDesigns, storeDesignImageUrl, modelPhotoUrl, designArt } from "../core/store-designs.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { productCard, productMockup, reviewsBlock, demoTag, IS_DEMO } from "./components.js";
import { listReviews, reviewSummary } from "../data/reviews.js";

initPage("home");

// CTA con ícono
document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("beforeend", icon(el.dataset.icon)));

// Hero: la prenda adelante. Muestra los diseños publicados (primero los que
// tienen foto puesta) sobre la prenda, con su precio y acceso directo.
renderHero();

async function renderHero() {
  const host = document.querySelector("[data-hero-show]");
  const products = activeProducts();
  const designs = listStoreDesigns({ publishedOnly: true })
    .map((d, i) => ({ d, i }))
    .sort((a, b) => !!b.d.modelPhoto - !!a.d.modelPhoto || a.i - b.i)
    .map((x) => x.d)
    .slice(0, 4);
  renderPicks(listStoreDesigns({ publishedOnly: true }).slice(0, 3));
  if (!designs.length) {
    // Sin diseños publicados: la prenda sola.
    const tee = getProduct("remera-oversize") || products[0];
    host.innerHTML = tee
      ? `<div class="hero__stage"><a class="hero__frame" href="catalogo.html">${productMockup(tee, tee.colors[0], "front", { className: "hero__mock" })}</a></div>`
      : "";
    return;
  }
  const [urls, photos] = await Promise.all([Promise.all(designs.map(storeDesignImageUrl)), Promise.all(designs.map(modelPhotoUrl))]);
  const slides = designs.map((d, i) => {
    const fits = products.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
    const show = fits.find((p) => p.type === "tee") || fits[0];
    if (!show) return null;
    const col = show.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
    return {
      d, show, col, art: urls[i], photo: photos[i],
      href: `producto.html?id=${encodeURIComponent(show.id)}&diseno=${encodeURIComponent(d.id)}`,
    };
  }).filter(Boolean);
  if (!slides.length) return;

  const stage = (s) => `
    <a class="hero__frame${s.photo ? " hero__frame--photo" : ""}" href="${s.href}" aria-label="${escapeHtml(`${s.d.name} en ${s.show.name}`)}">
      ${s.photo ? `<img class="hero__photo" src="${escapeHtml(s.photo)}" alt="${escapeHtml(s.d.name)} puesto" fetchpriority="high">` : ""}
      <span class="hero__mock-wrap">${garmentSvg(s.show.type, "front", s.col.hex, { art: designArt(s.art), colorId: s.col.id, className: "hero__mock", title: `${s.d.name} en ${s.show.name} ${s.col.name}` })}</span>
    </a>
    <div class="hero__sticker" aria-hidden="true">hecho<br>a pedido</div>
    <div class="hero__info">
      <div>
        <p class="mono hero__kicker">Diseño de la casa</p>
        <p class="hero__name">${escapeHtml(s.d.name)}</p>
        <p class="hero__price"><span class="muted">${escapeHtml(s.show.name)}</span> <b class="price">${formatPrice(s.show.basePrice + (s.d.price || 0))}</b></p>
      </div>
      <a class="btn btn--primary" href="${s.href}">Lo quiero ${icon("arrowRight")}</a>
    </div>`;

  host.innerHTML = `
    <div class="hero__stage" data-hero-stage aria-live="polite">${stage(slides[0])}</div>
    ${
      slides.length > 1
        ? `<div class="hero__picks" role="group" aria-label="Elegí un diseño">
        ${slides
          .map(
            (s, i) => `<button class="hero__pick" type="button" data-hero-pick="${i}" aria-pressed="${i === 0}" title="${escapeHtml(s.d.name)}">
              <img src="${escapeHtml(s.art)}" alt="" loading="lazy"><span class="sr-only">${escapeHtml(s.d.name)}</span></button>`
          )
          .join("")}
      </div>`
        : ""
    }`;
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hero-pick]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    host.querySelector("[data-hero-stage]").innerHTML = stage(slides[Number(b.dataset.heroPick)]);
    host.querySelectorAll("[data-hero-pick]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
}

// Diseños de la casa: hasta tres, sobre la remera más clara.
async function renderPicks(designs) {
  const host = document.querySelector("[data-picks]");
  if (!host || !designs.length) return;
  const products = activeProducts();
  const urls = await Promise.all(designs.map(storeDesignImageUrl));
  const items = designs
    .map((d, i) => {
      const fits = products.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
      const show = fits.find((p) => p.type === "tee") || fits[0];
      if (!show) return "";
      const col = show.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
      const href = `producto.html?id=${encodeURIComponent(show.id)}&diseno=${encodeURIComponent(d.id)}`;
      const from = Math.min(...fits.map((p) => p.basePrice)) + (d.price || 0);
      return `<li class="pick" style="--i:${i}">
        <a class="pick__media" href="${href}">${garmentSvg(show.type, "front", col.hex, { art: designArt(urls[i]), colorId: col.id, className: "pick__svg", title: `${d.name} en ${show.name}` })}</a>
        <p class="pick__name"><a href="${href}">${escapeHtml(d.name)}</a></p>
        <p class="pick__price">desde <b class="price">${formatPrice(from)}</b></p>
      </li>`;
    })
    .join("");
  if (!items) return;
  host.innerHTML = items;
  document.querySelector("[data-picks-section]").hidden = false;
}

// Prendas por tipo: un círculo por cada tipo del catálogo.
{
  const products = activeProducts();
  const types = [...new Set(products.map((p) => p.type))];
  document.querySelector("[data-cats]").innerHTML = types
    .map((t, i) => {
      const p = products.find((x) => x.type === t);
      const col = p.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
      return `<li class="cat" style="--i:${i}">
        <a href="catalogo.html?tipo=${encodeURIComponent(t)}">
          <span class="cat__media">${productMockup(p, col.id, "front", { className: "cat__svg" })}</span>
          <span class="cat__name">${escapeHtml(GARMENTS[t].name)}</span>
        </a>
      </li>`;
    })
    .join("");
}

// Marquee
const words = ["Remeras", "Buzos", "Gorras", "Totes", "Estampado en taller propio", "Diseño frente y espalda", "Archivos a 300 DPI"];
const run = words.map((w) => `<span>${w}<i class="flor"></i></span>`).join("");
document.querySelector("[data-marquee]").innerHTML = run + run;

// Destacados
document.querySelector("[data-featured]").innerHTML = activeProducts().filter((p) => p.featured)
  .map((p, i) => productCard(p, { index: i }))
  .join("");

// Editorial
const tee = getProduct("remera-clasica");
const crew = getProduct("buzo-cuello-redondo");
const tote = getProduct("tote-bag");
document.querySelector("[data-editorial]").innerHTML = `
  <figure class="ed-card ed-card--a">
    ${productMockup(crew, "rojo", "front")}
    <figcaption><span class="tag tag--ink">Buzo cuello redondo · rojo</span>${demoTag("Demo", ' style="background:#fff"')}</figcaption>
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

// Opiniones (de ejemplo): resumen de todas y las más recientes
// En la tienda real la sección no se muestra hasta que haya opiniones reales.
if (IS_DEMO) {
  const allReviews = listReviews();
  document.querySelector("[data-reviews]").innerHTML = reviewsBlock(allReviews.slice(0, 3), reviewSummary(allReviews), { products: activeProducts() });
} else {
  document.getElementById("opiniones")?.remove();
}
