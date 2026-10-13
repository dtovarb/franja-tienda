import { initPage, icon } from "../core/ui.js";
import { getProduct, getColor, stockLabel, validateVariant, defaultVariant } from "../data/catalog.js";
import { garmentSvg, getPrintSpec, faceLabel } from "../data/garments.js";
import { computePrice, PRICING_RULES } from "../core/pricing.js";
import { formatPrice, escapeHtml, params } from "../core/format.js";

initPage("catalog");

const root = document.querySelector("[data-pdp]");
const p = params();
const product = getProduct(p.get("id"));

if (!product) {
  root.innerHTML = `<div class="empty"><h1 class="display h1">Prenda no encontrada</h1><p class="muted">El enlace puede estar incompleto.</p><a class="btn btn--primary" href="catalogo.html">Ver catálogo</a></div>`;
} else {
  document.title = `${product.name} — FRANJA`;
  const def = defaultVariant(product);
  const state = {
    colorId: product.colors.includes(p.get("color")) ? p.get("color") : def.colorId,
    sizeId: product.sizes.some((s) => s.id === p.get("size") && s.stock !== "out") ? p.get("size") : def.sizeId,
    qty: Math.min(50, Math.max(1, parseInt(p.get("qty"), 10) || 1)),
    face: "front",
    guides: true,
  };

  root.innerHTML = `
    <nav aria-label="Ruta" class="mono muted" style="padding-top:var(--sp-5)"><a href="catalogo.html">Prendas</a> / ${escapeHtml(product.name)}</nav>
    <div class="pdp">
      <div class="pdp__gallery">
        <div class="pdp__stage" data-stage></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="seg" role="group" aria-label="Cara de la prenda">
            ${product.faces.map((f) => `<button type="button" data-face="${f}" aria-pressed="${f === state.face}">${faceLabel(f)}</button>`).join("")}
          </div>
          <label style="display:inline-flex;gap:8px;align-items:center;font-size:var(--fs-sm)"><input type="checkbox" data-guides checked> Mostrar área de impresión</label>
        </div>
        <p class="mono muted">Mockup vectorial de demostración. El color en pantalla es aproximado.</p>
      </div>

      <form class="pdp__info" data-form novalidate>
        <div style="display:grid;gap:var(--sp-3)">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${product.badge ? `<span class="tag tag--red">${escapeHtml(product.badge)}</span>` : ""}
            <span class="tag tag--demo">Producto de demostración</span>
            <span class="tag" style="color:var(--c-ink-3)">${product.sku}</span>
          </div>
          <h1 class="display pdp__title">${escapeHtml(product.name)}</h1>
          <p class="lead">${escapeHtml(product.description)}</p>
        </div>

        <fieldset class="field">
          <legend>Color — <span data-color-name></span></legend>
          <div class="swatches" role="radiogroup" aria-label="Color de la prenda" data-colors>
            ${product.colors
              .map((c) => {
                const col = getColor(c);
                return `<button type="button" class="swatch" role="radio" data-color="${c}" style="--sw:${col.hex}" aria-label="${col.name}" title="${col.name}"></button>`;
              })
              .join("")}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Talle</legend>
          <div class="chips" role="radiogroup" aria-label="Talle" data-sizes>
            ${product.sizes
              .map(
                (s) => `<button type="button" class="chip" role="radio" data-size="${s.id}" ${s.stock === "out" ? "disabled" : ""} aria-label="Talle ${s.label}, ${stockLabel(s.stock)}${s.surcharge ? `, recargo ${formatPrice(s.surcharge)}` : ""}">
                  ${s.label}${s.surcharge ? `<small>+${formatPrice(s.surcharge)}</small>` : ""}</button>`
              )
              .join("")}
          </div>
          <p class="hint" data-stock></p>
        </fieldset>

        <div class="field">
          <label for="qty">Cantidad</label>
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="Restar una unidad">−</button>
            <input id="qty" type="number" inputmode="numeric" min="1" max="50" value="${state.qty}" data-qty-input>
            <button type="button" data-qty="1" aria-label="Sumar una unidad">+</button>
          </div>
        </div>

        <div>
          <div class="pdp__price-row">
            <span class="mono">Precio por unidad</span>
            <span class="price pdp__price" data-unit></span>
          </div>
          <div class="breakdown" data-breakdown style="margin-top:var(--sp-3)"></div>
          <p class="hint" style="margin-top:var(--sp-2)">La primera cara estampada está incluida. Cada cara adicional suma ${formatPrice(PRICING_RULES.extraFaceSurcharge)}. El precio final se ajusta en el editor según las caras que diseñes.</p>
        </div>

        <div class="notice notice--danger form-errors" role="alert" data-errors></div>

        <button class="btn btn--primary btn--lg btn--block" type="submit">Personalizar en el editor ${icon("arrowRight")}</button>

        <dl class="spec-list">
          ${product.faces
            .map((f) => {
              const sp = getPrintSpec(product.type, f);
              return `<dt>Área ${faceLabel(f).toLowerCase()}</dt><dd>hasta ${sp.widthCm} × ${sp.heightCm} cm (talle M de referencia)</dd>`;
            })
            .join("")}
          <dt>Técnica</dt><dd>DTF a definir por el taller según diseño (demo)</dd>
          <dt>Archivos</dt><dd>JPG, PNG o SVG · hasta 25 MB</dd>
        </dl>
      </form>
    </div>`;

  const stage = root.querySelector("[data-stage]");
  const form = root.querySelector("[data-form]");
  const qtyInput = root.querySelector("[data-qty-input]");

  function renderStage() {
    const col = getColor(state.colorId);
    const spec = getPrintSpec(product.type, state.face);
    let svg = garmentSvg(product.type, state.face, col.hex, { title: `${product.name} ${col.name}, ${faceLabel(state.face)}` });
    if (state.guides) {
      const a = spec.area;
      svg = svg.replace(
        "</svg>",
        `<rect class="print-guide" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/>
         <text x="${a.x}" y="${a.y - 12}" font-family="Space Mono" font-size="22" fill="#A50062">ÁREA ${spec.widthCm}×${spec.heightCm} CM</text></svg>`
      );
    }
    stage.innerHTML = svg;
  }

  function sync() {
    renderStage();
    root.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.color === state.colorId)));
    root.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.size === state.sizeId)));
    root.querySelectorAll("[data-face]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.face === state.face)));
    root.querySelector("[data-color-name]").textContent = getColor(state.colorId).name;
    const s = product.sizes.find((x) => x.id === state.sizeId);
    root.querySelector("[data-stock]").textContent = s ? `${stockLabel(s.stock)} en talle ${s.label} (stock de ejemplo)` : "";
    qtyInput.value = state.qty;
    root.querySelectorAll("[data-qty]").forEach((b) => {
      b.disabled = (b.dataset.qty === "-1" && state.qty <= 1) || (b.dataset.qty === "1" && state.qty >= 50);
    });
    const price = computePrice(product, state, { printedFaces: ["front"] });
    root.querySelector("[data-unit]").textContent = formatPrice(price.unit);
    root.querySelector("[data-breakdown]").innerHTML =
      price.lines.map((l) => `<div><span>${l.label}</span><span>${formatPrice(l.amount)}</span></div>`).join("") +
      `<div class="total"><span>Total × ${price.qty}</span><span>${formatPrice(price.total)}</span></div>`;
    const url = new URL(location.href);
    url.searchParams.set("color", state.colorId);
    url.searchParams.set("size", state.sizeId);
    url.searchParams.set("qty", state.qty);
    history.replaceState(null, "", url);
  }

  // Radiogroups accesibles con flechas
  function radioKeys(container, attr, setter) {
    container.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const items = [...container.querySelectorAll(`[${attr}]:not(:disabled)`)];
      const i = items.indexOf(document.activeElement);
      const n = items[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      n.focus();
      setter(n);
      e.preventDefault();
    });
  }

  root.querySelector("[data-colors]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]");
    if (b) (state.colorId = b.dataset.color), sync();
  });
  radioKeys(root.querySelector("[data-colors]"), "data-color", (b) => ((state.colorId = b.dataset.color), sync()));
  root.querySelector("[data-sizes]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]");
    if (b && !b.disabled) (state.sizeId = b.dataset.size), sync();
  });
  radioKeys(root.querySelector("[data-sizes]"), "data-size", (b) => ((state.sizeId = b.dataset.size), sync()));
  root.querySelectorAll("[data-face]").forEach((b) => b.addEventListener("click", () => ((state.face = b.dataset.face), sync())));
  root.querySelector("[data-guides]").addEventListener("change", (e) => ((state.guides = e.target.checked), renderStage()));
  root.querySelectorAll("[data-qty]").forEach((b) =>
    b.addEventListener("click", () => {
      state.qty = Math.min(50, Math.max(1, state.qty + Number(b.dataset.qty)));
      sync();
    })
  );
  qtyInput.addEventListener("change", () => {
    state.qty = Math.min(50, Math.max(1, parseInt(qtyInput.value, 10) || 1));
    sync();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = validateVariant(product, state);
    const errEl = root.querySelector("[data-errors]");
    if (!v.ok) {
      errEl.innerHTML = v.errors.map(escapeHtml).join("<br>");
      return;
    }
    errEl.innerHTML = "";
    const q = new URLSearchParams({ product: product.id, color: state.colorId, size: state.sizeId, qty: String(state.qty) });
    location.href = `editor.html?${q}`;
  });

  sync();
}
