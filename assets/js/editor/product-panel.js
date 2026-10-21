/** Pestaña "Prenda": color, talle y cantidad sin salir del editor. */
import { getColor, stockLabel } from "../data/catalog.js";
import { formatPrice, escapeHtml } from "../core/format.js";
import { faceLabel } from "../data/garments.js";

export function renderProductPanel({ ed, product, setVariant, price, printedFaces }) {
  const host = document.querySelector("[data-product-panel]");

  function render() {
    const v = ed.variant;
    const p = price();
    const faces = printedFaces();
    host.innerHTML = `
      <div class="field">
        <span class="label ed-h">Color — ${escapeHtml(getColor(v.colorId).name)}</span>
        <div class="swatches" role="radiogroup" aria-label="Color de la prenda">
          ${product.colors
            .map((c) => {
              const col = getColor(c);
              return `<button type="button" class="swatch" role="radio" aria-checked="${c === v.colorId}" data-v-color="${c}" style="--sw:${col.hex}" aria-label="${col.name}" title="${col.name}"></button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="field">
        <span class="label ed-h">Talle</span>
        <div class="chips" role="radiogroup" aria-label="Talle">
          ${product.sizes
            .map(
              (s) => `<button type="button" class="chip" role="radio" aria-checked="${s.id === v.sizeId}" data-v-size="${s.id}" ${s.stock === "out" ? "disabled" : ""} aria-label="Talle ${s.label}, ${stockLabel(s.stock)}">
              ${s.label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="field">
        <label class="ed-h" for="ed-qty">Cantidad</label>
        <div class="qty">
          <button type="button" data-v-qty="-1" aria-label="Restar una unidad" ${v.qty <= 1 ? "disabled" : ""}>−</button>
          <input id="ed-qty" type="number" inputmode="numeric" min="1" max="50" value="${v.qty}" data-v-qty-input>
          <button type="button" data-v-qty="1" aria-label="Sumar una unidad" ${v.qty >= 50 ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div class="breakdown">
        ${p.lines.map((l) => `<div><span>${l.label}</span><span>${formatPrice(l.amount)}</span></div>`).join("")}
        <div class="total"><span>Total × ${p.qty}</span><span>${formatPrice(p.total)}</span></div>
      </div>
      <p class="hint">Zonas con diseño: ${faces.length ? faces.map(faceLabel).join(", ") : "ninguna todavía"}. El frente está incluido; cada otra zona suma su recargo.</p>`;
  }

  host.addEventListener("click", (e) => {
    const c = e.target.closest("[data-v-color]");
    const s = e.target.closest("[data-v-size]");
    const q = e.target.closest("[data-v-qty]");
    if (c) setVariant({ colorId: c.dataset.vColor });
    if (s && !s.disabled) setVariant({ sizeId: s.dataset.vSize });
    if (q && !q.disabled) setVariant({ qty: Math.min(50, Math.max(1, ed.variant.qty + Number(q.dataset.vQty))) });
  });
  host.addEventListener("change", (e) => {
    if (e.target.matches("[data-v-qty-input]")) setVariant({ qty: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)) });
  });

  return { render };
}
