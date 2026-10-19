import { initPage } from "../core/ui.js";
import { activeProducts } from "../data/catalog.js";
import { getPrintSpec, faceLabel } from "../data/garments.js";
import { sizeChartTable } from "../data/size-charts.js";
import { ZONE_PRICES } from "../core/pricing.js";
import { formatPrice, escapeHtml } from "../core/format.js";

initPage("faq");

// Medidas máximas: salen de las mismas áreas imprimibles que usa el editor.
const table = document.querySelector("[data-print-sizes]");
const rows = activeProducts()
  .map((p) => {
    // Cada talle tiene su medida: se muestra la del más chico y la del más grande.
    const first = p.sizes[0]?.id, last = p.sizes[p.sizes.length - 1]?.id;
    const sizes = p.faces.map((f) => {
      const a = getPrintSpec(p.type, f, first), z = getPrintSpec(p.type, f, last);
      const same = a.widthCm === z.widthCm && a.heightCm === z.heightCm;
      return same
        ? `${faceLabel(f)}: ${a.widthCm} × ${a.heightCm} cm`
        : `${faceLabel(f)}: de ${a.widthCm} × ${a.heightCm} cm (${escapeHtml(first)}) a ${z.widthCm} × ${z.heightCm} cm (${escapeHtml(last)})`;
    });
    return `<tr><th scope="row">${escapeHtml(p.name)}</th><td>${sizes.join("<br>")}</td></tr>`;
  })
  .join("");
table.insertAdjacentHTML("beforeend", `<thead><tr><th scope="col">Prenda</th><th scope="col">Máximo</th></tr></thead><tbody>${rows}</tbody>`);

document.querySelector("[data-extra-face]").textContent = formatPrice(ZONE_PRICES.back);

// Abrir la pregunta enlazada (#produccion, etc. abren la primera del grupo).
function openFromHash() {
  const target = /^#[\w-]+$/.test(location.hash) ? document.querySelector(location.hash) : null;
  target?.querySelector("details")?.setAttribute("open", "");
}
openFromHash();
addEventListener("hashchange", openFromHash);

// Tablas de talles de las prendas a la venta (solo los talles que se venden)
document.querySelector("[data-size-charts]").innerHTML = activeProducts()
  .map((p) => {
    const table = sizeChartTable(p, `Medidas de ${escapeHtml(p.name)} por talle`);
    return table ? `<h3 class="size-charts__title">${escapeHtml(p.name)}</h3>${table}` : "";
  })
  .join("");
