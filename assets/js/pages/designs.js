import { initPage } from "../core/ui.js";
import { activeProducts, getColor } from "../data/catalog.js";
import { garmentSvg, luminance } from "../data/garments.js";
import { listStoreDesigns, storeDesignImageUrl, designArt } from "../core/store-designs.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { demoTag } from "./components.js";

initPage("designs");

const host = document.querySelector("[data-designs]");

function lightestColor(product) {
  return product.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
}

async function render() {
  const designs = listStoreDesigns({ publishedOnly: true });
  const products = activeProducts();
  if (!designs.length) {
    host.innerHTML = `<div class="empty"><p class="h3">Todavía no hay diseños publicados.</p><a class="btn btn--primary" href="catalogo.html?diseñar=1">Diseñar desde cero</a></div>`;
    return;
  }
  const urls = await Promise.all(designs.map(storeDesignImageUrl));
  host.innerHTML = designs
    .map((d, i) => {
      const fits = products.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
      const show = fits.find((p) => p.type === "tee") || fits[0];
      const col = show ? lightestColor(show) : null;
      return `
      <article class="dcard" data-design-card="${d.id}" style="--i:${i}">
        <div class="dcard__media">
          ${show ? garmentSvg(show.type, "front", col.hex, { art: designArt(urls[i]), colorId: col.id, className: "dcard__svg", title: `${d.name} en ${show.name} ${col.name}` }) : ""}
          ${demoTag()}
        </div>
        <div class="dcard__body">
          <div class="pcard__row">
            <h2 class="pcard__name">${escapeHtml(d.name)}</h2>
            <p class="price pcard__price">${d.price ? `+${formatPrice(d.price)}` : "Sin costo"}</p>
          </div>
          <p class="muted">${escapeHtml(d.description || "")}</p>
          <p class="mono dcard__label">Elegí la prenda</p>
          <ul class="dcard__products" role="list">
            ${fits
              .map(
                (p) => `<li><a class="chip" href="producto.html?id=${encodeURIComponent(p.id)}&diseno=${encodeURIComponent(d.id)}">${escapeHtml(p.name)}<small>${formatPrice(p.basePrice + (d.price || 0))}</small></a></li>`
              )
              .join("")}
          </ul>
        </div>
      </article>`;
    })
    .join("");
}

render();
