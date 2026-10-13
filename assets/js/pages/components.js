import { getColor, getProduct, stockLabel } from "../data/catalog.js";
import { garmentSvg, luminance } from "../data/garments.js";
import { demoArt } from "../data/art.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { icon } from "../core/ui.js";

export function productMockup(product, colorId, face = "front", { withArt = true, className = "" } = {}) {
  const color = getColor(colorId || product.colors[0]);
  const art = withArt ? demoArt(product.demoArt, luminance(color.hex) < 0.18) : "";
  return garmentSvg(product.type, face, color.hex, {
    art,
    className,
    colorId: color.id,
    title: `${product.name} color ${color.name}, mockup de demostración`,
  });
}

function sizeRange(product) {
  const s = product.sizes;
  return s.length === 1 ? s[0].label : `${s[0].label} – ${s[s.length - 1].label}`;
}

function availability(product) {
  const states = product.sizes.map((s) => s.stock);
  if (states.every((x) => x === "out")) return { label: "Sin stock", cls: "out" };
  if (states.some((x) => x === "low" || x === "out")) return { label: "Stock limitado en algunos talles", cls: "low" };
  return { label: stockLabel("ok"), cls: "ok" };
}

export function productCard(product, { index = 0 } = {}) {
  const av = availability(product);
  const href = `producto.html?id=${encodeURIComponent(product.id)}`;
  return `
  <article class="pcard" style="--i:${index}" data-card="${product.id}">
    <a class="pcard__media" href="${href}" aria-label="Ver ${escapeHtml(product.name)}" data-card-link>
      ${productMockup(product, product.colors[0], "front", { className: "pcard__svg" })}
      <div class="pcard__tags">
        ${product.badge ? `<span class="tag tag--red">${escapeHtml(product.badge)}</span>` : ""}
        <span class="tag tag--demo">Demo</span>
      </div>
      <span class="pcard__sku mono">${product.sku}</span>
    </a>
    <div class="pcard__body">
      <div class="pcard__row">
        <h3 class="pcard__name"><a href="${href}" data-card-link>${escapeHtml(product.name)}</a></h3>
        <p class="price pcard__price">${formatPrice(product.basePrice)}</p>
      </div>
      <p class="pcard__tagline muted">${escapeHtml(product.tagline)}</p>
      <div class="pcard__meta">
        <div class="pcard__colors" role="group" aria-label="Color de ${escapeHtml(product.name)}">
          ${product.colors
            .map((c, i) => {
              const col = getColor(c);
              return `<button type="button" class="swatch swatch--sm" data-card-color="${c}" style="--sw:${col.hex}" title="${col.name}" aria-label="${col.name}" aria-pressed="${i === 0}"></button>`;
            })
            .join("")}
        </div>
        <span class="mono">Talles ${sizeRange(product)}</span>
      </div>
      <p class="pcard__stock pcard__stock--${av.cls}"><span class="dot" aria-hidden="true"></span>${av.label} <span class="muted">(ejemplo)</span></p>
      <a class="btn btn--primary btn--block" href="${href}" data-card-link>Personalizar ${icon("arrowRight")}</a>
    </div>
  </article>`;
}

/* Tocar un color en una tarjeta cambia la prenda y lleva ese color a la ficha. */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-card-color]");
  if (!b) return;
  const card = b.closest("[data-card]");
  const product = card && getProduct(card.dataset.card);
  if (!product) return;
  const colorId = b.dataset.cardColor;
  const media = card.querySelector(".pcard__media");
  media.querySelector(".pcard__svg").outerHTML = productMockup(product, colorId, "front", { className: "pcard__svg" });
  card.querySelectorAll("[data-card-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  card.querySelectorAll("[data-card-link]").forEach((a) => {
    const url = new URL(a.getAttribute("href"), location.href);
    url.searchParams.set("color", colorId);
    a.setAttribute("href", `producto.html${url.search}`);
  });
});

/* ---------------- Opiniones ---------------- */

const stars = (n) =>
  `<span class="stars" role="img" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5]
    .map((i) => `<span class="stars__s${i <= n ? " is-on" : ""}" aria-hidden="true">★</span>`)
    .join("")}</span>`;

const reviewDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Bloque de opiniones: resumen + lista. `products` (opcional) agrega el
 * nombre de la prenda en cada opinión (para la portada).
 */
export function reviewsBlock(list, summary, { products = null, emptyText = "Todavía no hay opiniones de esta prenda." } = {}) {
  const note = `<p class="reviews__note"><span class="tag tag--demo">Ejemplo</span> Opiniones simuladas para mostrar cómo se va a ver esta sección. Las reales aparecen acá cuando lleguen las primeras compras.</p>`;
  if (!list.length) return `${note}<p class="muted">${emptyText}</p>`;
  const bars = summary.distribution
    .map((d) => `<li><span class="mono">${d.stars}★</span><span class="reviews__bar"><i style="width:${summary.count ? (d.count / summary.count) * 100 : 0}%"></i></span><span class="mono muted">${d.count}</span></li>`)
    .join("");
  const items = list
    .map((x) => {
      const prod = products?.find((p) => p.id === x.productId);
      const color = getColor(x.colorId);
      const meta = [prod?.name, color?.name, x.size !== "Único" ? `talle ${x.size}` : null].filter(Boolean).map(escapeHtml).join(" · ");
      return `
      <li class="review" data-review="${x.id}">
        <div class="review__head">${stars(x.rating)}<span class="mono muted">${reviewDate(x.date)}</span></div>
        <h3 class="review__title">${escapeHtml(x.title)}</h3>
        <p>${escapeHtml(x.body)}</p>
        <p class="review__meta"><b>${escapeHtml(x.author)}</b> · ${escapeHtml(x.city)}${meta ? ` · <span class="muted">${meta}</span>` : ""}</p>
        <span class="tag tag--demo review__tag">Opinión de ejemplo</span>
      </li>`;
    })
    .join("");
  return `
    ${note}
    <div class="reviews__grid">
      <div class="reviews__summary">
        <p class="reviews__avg display">${summary.average.toLocaleString("es-AR", { minimumFractionDigits: 1 })}</p>
        ${stars(Math.round(summary.average))}
        <p class="muted">${summary.count} ${summary.count === 1 ? "opinión" : "opiniones"} de ejemplo</p>
        <ul class="reviews__bars" role="list">${bars}</ul>
      </div>
      <ul class="reviews__list" role="list">${items}</ul>
    </div>`;
}
