import { initPage } from "../core/ui.js";
import { activeProducts, getColor } from "../data/catalog.js";
import { garmentSvg, luminance } from "../data/garments.js";
import { listStoreDesigns, listCollections, storeDesignImageUrl, modelPhotoUrl, designArt, designPageUrl } from "../core/store-designs.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { demoTag } from "./components.js";
import { startingPrice } from "../core/pricing.js";

initPage("designs");

const host = document.querySelector("[data-designs]");
const filtersEl = document.querySelector("[data-collections]");
const descEl = document.querySelector("[data-collection-desc]");

const ALL = "todos";
/** Colección elegida: va en la URL (?coleccion=id) para poder compartirla. */
let active = new URLSearchParams(location.search).get("coleccion") || ALL;

function lightestColor(product) {
  return product.colors.map(getColor).sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
}

async function render() {
  const published = listStoreDesigns({ publishedOnly: true });
  // Solo las colecciones que tienen algún diseño publicado.
  const collections = listCollections().filter((c) => published.some((d) => d.collectionId === c.id));
  if (!collections.some((c) => c.id === active)) active = ALL;
  filtersEl.hidden = !collections.length;
  filtersEl.innerHTML = [{ id: ALL, name: "Todos" }, ...collections]
    .map((c) => `<button class="filter" type="button" data-collection="${escapeHtml(c.id)}" aria-pressed="${c.id === active}">${escapeHtml(c.name)}</button>`)
    .join("");
  const current = collections.find((c) => c.id === active);
  descEl.hidden = !current?.description;
  descEl.textContent = current?.description || "";

  const designs = active === ALL ? published : published.filter((d) => d.collectionId === active);
  const products = activeProducts();
  if (!designs.length) {
    host.innerHTML = `<div class="empty"><p class="h3">Todavía no hay diseños publicados.</p><a class="btn btn--primary" href="catalogo.html?diseñar=1">Diseñar desde cero</a></div>`;
    return;
  }
  const [urls, photos] = await Promise.all([Promise.all(designs.map(storeDesignImageUrl)), Promise.all(designs.map(modelPhotoUrl))]);
  host.innerHTML = designs
    .map((d, i) => {
      const fits = products.filter((p) => !d.productIds?.length || d.productIds.includes(p.id));
      const show = fits.find((p) => p.type === "tee") || fits[0];
      const col = show ? lightestColor(show) : null;
      return `
      <article class="dcard" data-design-card="${d.id}" style="--i:${i}">
        <div class="dcard__media${photos[i] ? " has-photo" : ""}">
          ${show ? garmentSvg(show.type, "front", col.hex, { art: designArt(urls[i]), colorId: col.id, className: "dcard__svg", title: `${d.name} en ${show.name} ${col.name}` }) : ""}
          ${photos[i] ? modelPhotoLayer(photos[i], d.name) : ""}
          ${demoTag()}
        </div>
        <div class="dcard__body">
          <div class="pcard__row">
            <h2 class="pcard__name">${escapeHtml(d.name)}</h2>
            <p class="price pcard__price">${fits.length ? `desde ${formatPrice(Math.min(...fits.map((p) => startingPrice(p, [d.id]))))}` : ""}</p>
          </div>
          <p class="muted">${escapeHtml(d.description || "")}</p>
          <p class="mono dcard__label">Elegí la prenda</p>
          <ul class="dcard__products" role="list">
            ${fits
              .map(
                (p) => `<li><a class="chip" href="${designPageUrl(d, p.id)}">${escapeHtml(p.name)}<small>${formatPrice(startingPrice(p, [d.id]))}</small></a></li>`
              )
              .join("")}
          </ul>
        </div>
      </article>`;
    })
    .join("");
}

/**
 * Foto del diseño puesto: aparece al pasar el mouse por la tarjeta. En
 * pantallas táctiles (sin mouse) el botón la muestra y la vuelve a ocultar.
 */
function modelPhotoLayer(url, name) {
  return `<img class="dcard__photo" src="${escapeHtml(url)}" alt="${escapeHtml(name)} puesto" loading="lazy" decoding="async">
    <button class="dcard__flip" type="button" data-photo-toggle aria-pressed="false">Verla puesta</button>`;
}

host.addEventListener("click", (e) => {
  const b = e.target.closest("[data-photo-toggle]");
  if (!b) return;
  const on = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(on));
  b.textContent = on ? "Ver el diseño" : "Verla puesta";
  b.closest(".dcard__media").classList.toggle("is-photo", on);
});

filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-collection]");
  if (!b || b.dataset.collection === active) return;
  active = b.dataset.collection;
  const url = new URL(location.href);
  if (active === ALL) url.searchParams.delete("coleccion");
  else url.searchParams.set("coleccion", active);
  history.replaceState(null, "", url);
  render();
});

render();
