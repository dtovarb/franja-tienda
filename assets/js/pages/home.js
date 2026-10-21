import { initPage, icon, getHomeImages, getMarquee, siteTextHtml } from "../core/ui.js";
import { activeProducts, getProduct, getColor } from "../data/catalog.js";
import { garmentSvg, luminance, GARMENTS } from "../data/garments.js";
import { listStoreDesigns, storeDesignImageUrl, modelPhotoUrl, designArt } from "../core/store-designs.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { productCard, productMockup, reviewsBlock, demoTag, IS_DEMO } from "./components.js";
import { listReviews, reviewSummary } from "../data/reviews.js";
import { startingPrice } from "../core/pricing.js";

initPage("home");
const HOME_IMAGES = getHomeImages();
const photoUrl = (photo) => modelPhotoUrl({ modelPhoto: photo });

// CTA con ícono
document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("beforeend", icon(el.dataset.icon)));

// Hero: la prenda adelante. Muestra los diseños publicados (primero los que
// tienen foto puesta) sobre la prenda, con su precio y acceso directo.
renderHero();

async function renderHero() {
  const host = document.querySelector("[data-hero-show]");
  const products = activeProducts();
  const own = HOME_IMAGES.hero[0];
  const ownUrl = own.photo && (await photoUrl(own.photo));
  if (ownUrl) {
    // Foto de portada cargada en el panel: va ella sola, con su texto y enlace.
    const href = own.link || "disenos.html";
    renderPicks(listStoreDesigns({ publishedOnly: true }).slice(0, 3));
    host.innerHTML = `
      <div class="hero__stage">
        <a class="hero__frame hero__frame--own" href="${escapeHtml(href)}">
          <img class="hero__photo" src="${escapeHtml(ownUrl)}" alt="${escapeHtml(own.caption || "nevrado")}" fetchpriority="high">
        </a>
        <div class="hero__sticker" aria-hidden="true">${siteTextHtml("home.hero.sticker")}</div>
        ${own.caption ? `<div class="hero__info"><p class="hero__name">${escapeHtml(own.caption)}</p><a class="btn btn--primary" href="${escapeHtml(href)}">Ver ${icon("arrowRight")}</a></div>` : ""}
      </div>`;
    return;
  }
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
    <div class="hero__sticker" aria-hidden="true">${siteTextHtml("home.hero.sticker")}</div>
    <div class="hero__info">
      <div>
        <p class="mono hero__kicker">${siteTextHtml("home.hero.kicker")}</p>
        <p class="hero__name">${escapeHtml(s.d.name)}</p>
        <p class="hero__price"><span class="muted">${escapeHtml(s.show.name)}</span> <b class="price">${formatPrice(startingPrice(s.show, [s.d.id]))}</b></p>
      </div>
      <a class="btn btn--primary" href="${s.href}">${siteTextHtml("home.hero.buy")} ${icon("arrowRight")}</a>
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
  const [urls, photos] = await Promise.all([Promise.all(designs.map(storeDesignImageUrl)), Promise.all(designs.map(modelPhotoUrl))]);
  const items = designs
    .map((d, i) => {
      const fits = products.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
      const show = fits.find((p) => p.type === "tee") || fits[0];
      if (!show) return "";
      const col = show.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
      const href = `producto.html?id=${encodeURIComponent(show.id)}&diseno=${encodeURIComponent(d.id)}`;
      // El precio de la prenda a la que lleva la tarjeta, el mismo que marca al entrar.
      const from = startingPrice(show, [d.id]);
      return `<li class="pick" style="--i:${i}">
        <a class="pick__media" href="${href}">${
          photos[i]
            ? `<img class="pick__photo" src="${escapeHtml(photos[i])}" alt="${escapeHtml(`${d.name} puesto`)}" loading="lazy">`
            : garmentSvg(show.type, "front", col.hex, { art: designArt(urls[i]), colorId: col.id, className: "pick__svg", title: `${d.name} en ${show.name}` })
        }</a>
        <p class="pick__name"><a href="${href}">${escapeHtml(d.name)}</a></p>
        <p class="pick__price"><span class="muted">${escapeHtml(show.name)}</span> <b class="price">${formatPrice(from)}</b></p>
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

// Marquesina: las frases se cambian en el panel («Sitio»). Con pocas frases
// se repiten hasta llenar el ancho, así la banda nunca queda con un hueco.
{
  const m = getMarquee();
  const band = document.querySelector(".marquee");
  if (!m.enabled || !m.items.length) band?.remove();
  else {
    let words = [...m.items];
    while (words.join("").length < 120) words = words.concat(m.items);
    const run = words.map((w) => `<span>${escapeHtml(w)}<i class="flor"></i></span>`).join("");
    document.querySelector("[data-marquee]").innerHTML = run + run;
  }
}

// Destacados
document.querySelector("[data-featured]").innerHTML = activeProducts().filter((p) => p.featured)
  .map((p, i) => productCard(p, { index: i }))
  .join("");

// Editorial: tres arcos. Cada uno muestra la foto cargada en el panel o,
// si no hay, la prenda de muestra de siempre.
const tee = getProduct("remera-clasica");
const crew = getProduct("buzo-cuello-redondo");
const tote = getProduct("tote-bag");
const LOOK_DEFAULTS = [
  { cls: "a", mock: () => crew && productMockup(crew, "rojo", "front"), tag: "tag--ink", label: "Buzo cuello redondo · rojo", demo: true },
  { cls: "b", mock: () => tote && productMockup(tote, "crudo", "front"), tag: "tag--magenta", label: "Tote · crudo" },
  { cls: "c", mock: () => tee && productMockup(tee, "blanco", "front"), tag: "tag--ink", label: "Remera clásica · blanco" },
];
renderLookbook();
async function renderLookbook() {
  const urls = await Promise.all(HOME_IMAGES.lookbook.map((x) => (x.photo ? photoUrl(x.photo) : null)));
  const cards = LOOK_DEFAULTS.map((def, i) => {
    const own = HOME_IMAGES.lookbook[i];
    const caption = urls[i] ? own.caption : def.label;
    const media = urls[i] ? `<img class="ed-card__photo" src="${escapeHtml(urls[i])}" alt="${escapeHtml(own.caption || "Foto del lookbook")}" loading="lazy">` : def.mock() || "";
    const tags = `${caption ? `<span class="tag ${def.tag}">${escapeHtml(caption)}</span>` : ""}${!urls[i] && def.demo ? demoTag("Demo", ' style="background:#fff"') : ""}`;
    const inner = `${media}${tags ? `<figcaption>${tags}</figcaption>` : ""}`;
    const link = urls[i] && own.link;
    return `<figure class="ed-card ed-card--${def.cls}${urls[i] ? " ed-card--photo" : ""}">${link ? `<a class="ed-card__link" href="${escapeHtml(link)}">${inner}</a>` : inner}</figure>`;
  }).join("");
  document.querySelector("[data-editorial]").innerHTML = `${cards}
  <div class="ed-quote">
    <span class="tag tag--pink">${siteTextHtml("home.look.tag")}</span>
    <p class="display">${siteTextHtml("home.look.quote")}</p>
  </div>`;
}

// Opiniones (de ejemplo): resumen de todas y las más recientes
// En la tienda real la sección no se muestra hasta que haya opiniones reales.
if (IS_DEMO) {
  const allReviews = listReviews();
  document.querySelector("[data-reviews]").innerHTML = reviewsBlock(allReviews.slice(0, 3), reviewSummary(allReviews), { products: activeProducts() });
} else {
  document.getElementById("opiniones")?.remove();
}
