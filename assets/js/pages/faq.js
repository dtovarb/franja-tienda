import { initPage } from "../core/ui.js";
import { activeProducts } from "../data/catalog.js";
import { getPrintSpec, faceLabel } from "../data/garments.js";
import { PRICING_RULES } from "../core/pricing.js";
import { formatPrice, escapeHtml } from "../core/format.js";

initPage("faq");

// Medidas máximas: salen de las mismas áreas imprimibles que usa el editor.
const table = document.querySelector("[data-print-sizes]");
const rows = activeProducts()
  .map((p) => {
    const sizes = p.faces.map((f) => {
      const s = getPrintSpec(p.type, f);
      return `${faceLabel(f)}: ${s.widthCm} × ${s.heightCm} cm`;
    });
    return `<tr><th scope="row">${escapeHtml(p.name)}</th><td>${sizes.join("<br>")}</td></tr>`;
  })
  .join("");
table.insertAdjacentHTML("beforeend", `<thead><tr><th scope="col">Prenda</th><th scope="col">Máximo</th></tr></thead><tbody>${rows}</tbody>`);

document.querySelector("[data-extra-face]").textContent = formatPrice(PRICING_RULES.extraFaceSurcharge);

// Abrir la pregunta enlazada (#produccion, etc. abren la primera del grupo).
function openFromHash() {
  const target = /^#[\w-]+$/.test(location.hash) ? document.querySelector(location.hash) : null;
  target?.querySelector("details")?.setAttribute("open", "");
}
openFromHash();
addEventListener("hashchange", openFromHash);
