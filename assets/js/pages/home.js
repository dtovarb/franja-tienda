import { initPage, icon, getHomeImages, getMarquee, siteText, siteTextHtml } from "../core/ui.js";
import { activeProducts, getColor } from "../data/catalog.js";
import { garmentSvg, luminance, GARMENTS } from "../data/garments.js";
import { listStoreDesigns, listCollections, storeDesignImageUrl, modelPhotoUrl, designArt, designPageUrl } from "../core/store-designs.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { productMockup } from "./components.js";
import { startingPrice } from "../core/pricing.js";

initPage("home");
const HOME_IMAGES = getHomeImages();
const photoUrl = (photo) => modelPhotoUrl({ modelPhoto: photo });
const PRODUCTS = activeProducts();
const PUBLISHED = listStoreDesigns({ publishedOnly: true });
/** Solo las colecciones que tienen algún diseño publicado. */
const COLLECTIONS = listCollections().filter((c) => PUBLISHED.some((d) => d.collectionId === c.id));
const collectionHref = (c) => `disenos.html?coleccion=${encodeURIComponent(c.id)}`;

// CTA con ícono
document.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("beforeend", icon(el.dataset.icon)));

const lightest = (product) => product.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];

/** Dónde se muestra un diseño: la remera si se puede, en su color más claro, con link y precio. */
function showcase(d) {
  const fits = PRODUCTS.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
  const show = fits.find((p) => p.type === "tee") || fits[0];
  if (!show) return null;
  return {
    show,
    col: lightest(show),
    href: designPageUrl(d, show.id),
    price: startingPrice(show, [d.id]),
  };
}

const mockupOf = (d, s, art, cls) =>
  garmentSvg(s.show.type, "front", s.col.hex, { art: designArt(art), colorId: s.col.id, className: cls, title: `${d.name} en ${s.show.name} ${s.col.name}` });

/* ======================= Portada ======================= */
// Las fotos cargadas en el panel van primero. Sin ninguna, pasan los diseños
// publicados (los que tienen foto con modelo primero). Sin diseños queda la
// portada fija del HTML.
renderHero();

async function renderHero() {
  const own = HOME_IMAGES.hero.filter((x) => x.photo);
  const ownUrls = await Promise.all(own.map((x) => photoUrl(x.photo)));
  let slides = own
    .map((x, i) => ({
      kind: "photo",
      url: ownUrls[i],
      alt: x.caption || "nevrado",
      kicker: x.kicker || siteText("home.hero.eyebrow"),
      title: x.caption || siteText("home.hero.title"),
      text: x.text || (x.caption ? "" : siteText("home.hero.lead")),
      button: x.button || siteText("home.hero.cta1"),
      link: x.link || "disenos.html",
    }))
    .filter((s) => s.url);

  if (!slides.length) {
    const designs = PUBLISHED.map((d, i) => ({ d, i }))
      .sort((a, b) => !!b.d.modelPhoto - !!a.d.modelPhoto || a.i - b.i)
      .map((x) => x.d)
      .slice(0, 4);
    const [arts, photos] = await Promise.all([Promise.all(designs.map(storeDesignImageUrl)), Promise.all(designs.map(modelPhotoUrl))]);
    slides = designs
      .map((d, i) => {
        const s = showcase(d);
        if (!s) return null;
        const col = COLLECTIONS.find((c) => c.id === d.collectionId);
        return {
          kind: photos[i] ? "photo" : "product",
          url: photos[i],
          alt: `${d.name} puesto`,
          mock: photos[i] ? "" : mockupOf(d, s, arts[i], "hslide__mock"),
          kicker: col ? col.name : siteText("home.hero.kicker"),
          title: d.name,
          text: `${s.show.name} · ${siteText("home.cats.from")} ${formatPrice(s.price)}`,
          button: siteText("home.hero.buy"),
          link: s.href,
        };
      })
      .filter(Boolean);
  }
  if (!slides.length) return;

  const hero = document.querySelector("[data-hero]");
  const host = hero.querySelector("[data-hero-slides]");
  const many = slides.length > 1;
  host.innerHTML = slides
    .map((s, i) => {
      const Title = i === 0 ? "h1" : "h2";
      const media =
        s.kind === "photo"
          ? `<div class="hslide__media" aria-hidden="${i > 0}">
              <img class="hslide__bg" src="${escapeHtml(s.url)}" alt="" ${i ? 'loading="lazy"' : ""}>
              <img class="hslide__img" src="${escapeHtml(s.url)}" alt="${escapeHtml(s.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>
            </div>`
          : `<div class="hslide__media"><a class="hslide__arch" href="${escapeHtml(s.link)}" tabindex="-1">${s.mock}</a></div>`;
      return `<article class="hslide hslide--${s.kind} hslide--tono${i % 3}${i === 0 ? " is-on" : ""}" ${many ? `aria-roledescription="foto" aria-label="${i + 1} de ${slides.length}"` : ""} ${i ? 'aria-hidden="true"' : ""}>
        ${media}
        <div class="container hslide__inner">
          <div class="hslide__copy">
            ${s.kicker ? `<p class="eyebrow hslide__kicker"><span class="tirita" aria-hidden="true"></span>${escapeHtml(s.kicker)}</p>` : ""}
            <${Title} class="display hslide__title">${escapeHtml(s.title).replace(/\n/g, "<br>")}</${Title}>
            ${s.text ? `<p class="hslide__lead">${escapeHtml(s.text)}</p>` : ""}
            <a class="btn btn--primary btn--lg" href="${escapeHtml(s.link)}" ${i ? 'tabindex="-1"' : ""}>${escapeHtml(s.button)} ${icon("arrowRight")}</a>
          </div>
        </div>
      </article>`;
    })
    .join("");
  hero.classList.toggle("hero--photo", slides[0].kind === "photo");
  if (many) carousel(hero, slides.length);
}

/** Flechas, puntitos, deslizar con el dedo y avance solo cada 7 s (salvo movimiento reducido). */
function carousel(hero, n) {
  hero.insertAdjacentHTML(
    "beforeend",
    `<button class="hero__arrow hero__arrow--prev" type="button" aria-label="Foto anterior">${icon("back")}</button>
     <button class="hero__arrow hero__arrow--next" type="button" aria-label="Foto siguiente">${icon("next")}</button>
     <div class="hero__dots" role="group" aria-label="Elegir foto">${Array.from({ length: n }, (_, i) => `<button type="button" aria-label="Foto ${i + 1}" aria-current="${i === 0}"></button>`).join("")}</div>`
  );
  const slides = [...hero.querySelectorAll(".hslide")];
  const dots = [...hero.querySelectorAll(".hero__dots button")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0;
  let timer = null;
  let paused = false;
  const go = (k) => {
    i = (k + n) % n;
    slides.forEach((s, j) => {
      s.classList.toggle("is-on", j === i);
      s.setAttribute("aria-hidden", String(j !== i));
      s.querySelectorAll("a").forEach((a) => (j === i ? a.removeAttribute("tabindex") : a.setAttribute("tabindex", "-1")));
    });
    dots.forEach((d, j) => d.setAttribute("aria-current", String(j === i)));
  };
  const restart = () => {
    clearInterval(timer);
    if (!reduce) timer = setInterval(() => !paused && !document.hidden && go(i + 1), 7000);
  };
  hero.querySelector(".hero__arrow--prev").addEventListener("click", () => (go(i - 1), restart()));
  hero.querySelector(".hero__arrow--next").addEventListener("click", () => (go(i + 1), restart()));
  dots.forEach((d, j) => d.addEventListener("click", () => (go(j), restart())));
  hero.addEventListener("mouseenter", () => (paused = true));
  hero.addEventListener("mouseleave", () => (paused = false));
  hero.addEventListener("focusin", () => (paused = true));
  hero.addEventListener("focusout", () => (paused = false));
  let x0 = null;
  hero.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) (go(dx < 0 ? i + 1 : i - 1), restart());
  });
  restart();
}

/* ======================= Nuevos diseños ======================= */
// Los últimos 8 diseños publicados (o los de la colección elegida en las pestañas).
const NEW_MAX = 8;
const ALL = "todos";
renderNew();

async function renderNew() {
  const section = document.querySelector("[data-new-section]");
  const items = (
    await Promise.all(
      [...PUBLISHED].reverse().map(async (d) => {
        const s = showcase(d);
        if (!s) return null;
        const [art, photo] = await Promise.all([storeDesignImageUrl(d), modelPhotoUrl(d)]);
        return { d, s, art, photo };
      })
    )
  ).filter(Boolean);
  if (!items.length) return;
  section.hidden = false;

  const tabs = section.querySelector("[data-new-tabs]");
  const grid = section.querySelector("[data-new-grid]");
  const more = section.querySelector("[data-new-more]");
  if (COLLECTIONS.length) {
    tabs.hidden = false;
    tabs.innerHTML = [{ id: ALL, name: siteText("home.new.all") }, ...COLLECTIONS]
      .map((c) => `<button type="button" data-col="${escapeHtml(c.id)}" aria-pressed="${c.id === ALL}">${escapeHtml(c.name)}</button>`)
      .join("");
  }
  const card = ({ d, s, art, photo }, i) => {
    const col = COLLECTIONS.find((c) => c.id === d.collectionId);
    return `<article class="ncard" style="--i:${i}">
      <a class="ncard__media${photo ? " has-photo" : ""}" href="${s.href}" aria-label="${escapeHtml(`${d.name} en ${s.show.name}`)}">
        ${mockupOf(d, s, art, "ncard__svg")}
        ${photo ? `<img class="ncard__photo" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">` : ""}
      </a>
      ${photo ? `<button class="ncard__flip" type="button" data-photo-toggle aria-pressed="false">Verla puesta</button>` : ""}
      <div class="ncard__body">
        ${col ? `<p class="ncard__col">${escapeHtml(col.name)}</p>` : ""}
        <h3 class="ncard__name"><a href="${s.href}">${escapeHtml(d.name)}</a></h3>
        <p class="ncard__price">${escapeHtml(s.show.name)} · ${siteTextHtml("home.cats.from")} <b class="price">${formatPrice(s.price)}</b></p>
      </div>
    </article>`;
  };
  const show = (id) => {
    const list = id === ALL ? items : items.filter((x) => x.d.collectionId === id);
    // Filas completas de 4 cuando hay más de una fila, así no queda una tarjeta sola abajo.
    const n = list.length > 4 ? Math.min(NEW_MAX, Math.floor(list.length / 4) * 4) : list.length;
    grid.innerHTML = list.slice(0, n).map(card).join("");
    more.href = id === ALL ? "disenos.html" : `disenos.html?coleccion=${encodeURIComponent(id)}`;
    tabs.querySelectorAll("[data-col]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.col === id)));
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-col]");
    if (b) show(b.dataset.col);
  });
  // En pantallas táctiles (sin mouse) el botón muestra la foto puesta.
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-photo-toggle]");
    if (!b) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "Ver el diseño" : "Verla puesta";
    b.closest(".ncard").classList.toggle("is-photo", on);
  });
  show(ALL);
}

/* ======================= Colecciones ======================= */
// Dos cuadros: los que tienen foto en el panel van así; los otros muestran
// una colección con su primer diseño. Al lado, el bloque del editor.
renderCollections();

async function renderCollections() {
  const mosaic = document.querySelector("[data-mosaic]");
  const tiles = await Promise.all(
    HOME_IMAGES.lookbook.map(async (x, i) => {
      const url = x.photo && (await photoUrl(x.photo));
      if (url) {
        return { url, kicker: x.kicker, title: x.caption, button: x.button || siteText("home.col.button"), link: x.link || "disenos.html" };
      }
      // Sin foto: la colección número i, con su primer diseño.
      const c = COLLECTIONS[i];
      if (!c) return null;
      const d = PUBLISHED.find((x) => x.collectionId === c.id);
      const s = d && showcase(d);
      const photo = d && (await modelPhotoUrl(d));
      return {
        url: photo,
        mock: !photo && s ? mockupOf(d, s, await storeDesignImageUrl(d), "tile__mock") : "",
        kicker: x.kicker,
        title: x.caption || c.name,
        text: c.description,
        button: x.button || siteText("home.col.button"),
        link: x.link || collectionHref(c),
      };
    })
  );
  const html = tiles
    .map((t, i) => {
      if (!t) return "";
      const big = i === 0;
      return `<a class="tile ${big ? "tile--big" : "tile--small"}${t.url ? " tile--photo" : ""}" href="${escapeHtml(t.link)}">
        ${t.url ? `<img class="tile__photo" src="${escapeHtml(t.url)}" alt="" loading="lazy">` : ""}
        <div class="tile__copy">
          ${t.kicker ? `<p class="eyebrow">${escapeHtml(t.kicker)}</p>` : ""}
          ${t.title ? `<h3 class="display tile__title">${escapeHtml(t.title)}</h3>` : ""}
          ${t.text && !big ? `<p>${escapeHtml(t.text)}</p>` : ""}
          <span class="btn ${t.url && big ? "btn--light" : "btn--primary"}">${escapeHtml(t.button)}</span>
        </div>
        ${t.mock ? `<span class="tile__arch" aria-hidden="true">${t.mock}</span>` : ""}
      </a>`;
    })
    .filter(Boolean);
  if (!html.length) return;
  mosaic.insertAdjacentHTML("afterbegin", html.join(""));
  mosaic.classList.add(html.length === 2 ? "mosaic--3" : "mosaic--2");
  document.querySelector("[data-col-head]").hidden = false;
}

/* ======================= Prendas ======================= */
{
  const types = [...new Set(PRODUCTS.map((p) => p.type))];
  document.querySelector("[data-cats]").innerHTML = types
    .map((t, i) => {
      const ps = PRODUCTS.filter((x) => x.type === t);
      const p = ps[0];
      const from = Math.min(...ps.map((x) => startingPrice(x)));
      return `<li class="cat" style="--i:${i}">
        <a href="catalogo.html?tipo=${encodeURIComponent(t)}">
          <span class="cat__media">${productMockup(p, lightest(p).id, "front", { className: "cat__svg" })}</span>
          <span class="cat__name">${escapeHtml(GARMENTS[t].name)}</span>
          <span class="cat__price">${siteTextHtml("home.cats.from")} ${formatPrice(from)}</span>
        </a>
      </li>`;
    })
    .join("");
}

/* ======================= Marquesina ======================= */
// Las frases se cambian en el panel («Sitio»). Con pocas frases se repiten
// hasta llenar el ancho, así la banda nunca queda con un hueco.
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
