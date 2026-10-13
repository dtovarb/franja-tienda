import { getColor, stockLabel } from "../data/catalog.js";
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
  <article class="pcard" style="--i:${index}">
    <a class="pcard__media" href="${href}" aria-label="Ver ${escapeHtml(product.name)}">
      ${productMockup(product, product.colors[0], "front", { className: "pcard__svg" })}
      <div class="pcard__tags">
        ${product.badge ? `<span class="tag tag--red">${escapeHtml(product.badge)}</span>` : ""}
        <span class="tag tag--demo">Demo</span>
      </div>
      <span class="pcard__sku mono">${product.sku}</span>
    </a>
    <div class="pcard__body">
      <div class="pcard__row">
        <h3 class="pcard__name"><a href="${href}">${escapeHtml(product.name)}</a></h3>
        <p class="price pcard__price">${formatPrice(product.basePrice)}</p>
      </div>
      <p class="pcard__tagline muted">${escapeHtml(product.tagline)}</p>
      <div class="pcard__meta">
        <div class="pcard__colors" aria-label="Colores disponibles">
          ${product.colors
            .map((c) => {
              const col = getColor(c);
              return `<span class="swatch swatch--sm" style="--sw:${col.hex}" title="${col.name}"></span>`;
            })
            .join("")}
          <span class="sr-only">${product.colors.map((c) => getColor(c).name).join(", ")}</span>
        </div>
        <span class="mono">Talles ${sizeRange(product)}</span>
      </div>
      <p class="pcard__stock pcard__stock--${av.cls}"><span class="dot" aria-hidden="true"></span>${av.label} <span class="muted">(ejemplo)</span></p>
      <a class="btn btn--primary btn--block" href="${href}">Personalizar ${icon("arrowRight")}</a>
    </div>
  </article>`;
}
