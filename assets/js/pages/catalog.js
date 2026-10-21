import { initPage, siteText } from "../core/ui.js";
import { activeProducts } from "../data/catalog.js";
import { GARMENTS } from "../data/garments.js";
import { productCard } from "./components.js";
import { params } from "../core/format.js";

initPage(params().has("diseñar") ? "design" : "catalog");

if (params().has("diseñar")) {
  document.querySelector("[data-intro]").textContent = siteText("catalog.design.eyebrow");
  document.querySelector("[data-lead]").textContent = siteText("catalog.design.lead");
}

const grid = document.querySelector("[data-grid]");
const filtersEl = document.querySelector("[data-filters]");
const countEl = document.querySelector("[data-results-count]");

// Los filtros salen de los tipos presentes en el catálogo: agregar un tipo
// nuevo (p. ej. gorra) no requiere tocar esta página.
const PRODUCTS = activeProducts();
const types = [...new Set(PRODUCTS.map((p) => p.type))];
const filters = [{ id: "all", label: "Todo" }, ...types.map((t) => ({ id: t, label: GARMENTS[t].name }))];
let active = params().get("tipo") || "all";

function render() {
  filtersEl.innerHTML = filters
    .map((f) => `<button class="filter" type="button" data-filter="${f.id}" aria-pressed="${f.id === active}">${f.label}</button>`)
    .join("");
  const list = PRODUCTS.filter((p) => active === "all" || p.type === active);
  grid.innerHTML = list.length
    ? list.map((p, i) => productCard(p, { index: i })).join("")
    : `<div class="empty"><p class="h3">No hay prendas de este tipo todavía.</p></div>`;
  countEl.textContent = `${list.length} ${list.length === 1 ? "prenda" : "prendas"}`;
}

filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  active = b.dataset.filter;
  const url = new URL(location.href);
  active === "all" ? url.searchParams.delete("tipo") : url.searchParams.set("tipo", active);
  history.replaceState(null, "", url);
  render();
});

render();
