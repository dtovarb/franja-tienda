import { initPage, icon } from "../core/ui.js";
import { getProduct, getColor, stockLabel, validateVariant, defaultVariant, activeProducts } from "../data/catalog.js";
import { garmentSvg, garmentPhoto, getPrintSpec, faceLabel, isMainFace } from "../data/garments.js";
import { listReviews, reviewSummary } from "../data/reviews.js";
import { sizeChartTable, measureHelp } from "../data/size-charts.js";
import { reviewsBlock, demoTag, IS_DEMO } from "./components.js";
import { computePrice, startingPrice, ZONE_PRICES } from "../core/pricing.js";
import { formatPrice, escapeHtml, params } from "../core/format.js";
import { getStoreDesign, isAvailableFor, storeDesignImageUrl, modelPhotoUrl, designArt } from "../core/store-designs.js";

initPage(new URLSearchParams(location.search).has("diseno") ? "designs" : "catalog");

const root = document.querySelector("[data-pdp]");
const p = params();
const product = getProduct(p.get("id"));

if (!product) {
  root.innerHTML = `<div class="empty"><h1 class="display h1">Prenda no encontrada</h1><p class="muted">El enlace puede estar incompleto.</p><a class="btn btn--primary" href="catalogo.html">Ver catálogo</a></div>`;
} else {
  const askedDesign = p.get("diseno") ? getStoreDesign(p.get("diseno")) : null;
  const design = isAvailableFor(askedDesign, product.id) ? askedDesign : null;
  // Con un diseño de la tienda la página es del diseño: su nombre, su foto
  // con modelo y «Agregar al carrito». La prenda pasa a ser una elección más.
  document.title = design ? `${design.name} · ${product.name} · nevrado` : `${product.name} · nevrado`;
  let designUrl = null;
  let photoUrl = null;
  const otherProducts = design ? activeProducts().filter((x) => x.id !== product.id && isAvailableFor(design, x.id)) : [];
  const def = defaultVariant(product);
  const state = {
    colorId: product.colors.includes(p.get("color")) ? p.get("color") : def.colorId,
    sizeId: product.sizes.some((s) => s.id === p.get("size") && s.stock !== "out") ? p.get("size") : def.sizeId,
    qty: Math.min(50, Math.max(1, parseInt(p.get("qty"), 10) || 1)),
    face: "front",
    guides: !design,
  };
  // La foto muestra frente y espalda; las zonas chicas se marcan sobre esas vistas.
  const mainFaces = product.faces.filter((f) => isMainFace(product.type, f));
  const zoneCost = (f) => (ZONE_PRICES[f] ? `+${formatPrice(ZONE_PRICES[f])}` : "incluida");

  root.innerHTML = `
    <nav aria-label="Ruta" class="mono muted" style="padding-top:var(--sp-5)">${design ? `<a href="disenos.html">Diseños</a> / ${escapeHtml(design.name)}` : `<a href="catalogo.html">Prendas</a> / ${escapeHtml(product.name)}`}</nav>
    <div class="pdp">
      <div class="pdp__gallery">
        <div class="pdp__stage" data-stage></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="seg" role="group" aria-label="Cara de la prenda" data-faces>
            ${mainFaces.map((f) => `<button type="button" data-face="${f}" aria-pressed="${f === state.face}">${faceLabel(f)}</button>`).join("")}
          </div>
          ${design ? "" : `<label style="display:inline-flex;gap:8px;align-items:center;font-size:var(--fs-sm)"><input type="checkbox" data-guides checked> Mostrar área de impresión</label>`}
        </div>
        <p class="mono muted" data-stage-note></p>
      </div>

      <form class="pdp__info" data-form novalidate>
        <div style="display:grid;gap:var(--sp-3)">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${product.badge ? `<span class="tag tag--red">${escapeHtml(product.badge)}</span>` : ""}
            ${demoTag("Producto de demostración")}
            ${IS_DEMO ? `<span class="tag" style="color:var(--c-ink-3)">${product.sku}</span>` : ""}
          </div>
          ${design ? `<p class="eyebrow muted" data-chosen-design="${design.id}">${escapeHtml(product.name)}</p>` : ""}
          <h1 class="display pdp__title">${escapeHtml(design ? design.name : product.name)}</h1>
          <p class="lead">${escapeHtml(design ? design.description || product.description : product.description)}</p>
          ${design ? `<p class="hint">${escapeHtml(product.name)}: ${escapeHtml(product.tagline || product.description)}</p>` : ""}
        </div>
        ${
          design
            ? ""
            : p.get("diseno")
              ? `<div class="notice notice--warning">${icon("alert")}<span>Ese diseño no está disponible para esta prenda. Podés elegir otro en <a href="disenos.html">Diseños</a>.</span></div>`
              : ""
        }

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
                (s) => `<button type="button" class="chip" role="radio" data-size="${s.id}" ${s.stock === "out" ? "disabled" : ""} aria-label="Talle ${s.label}, ${stockLabel(s.stock)}">${s.label}</button>`
              )
              .join("")}
          </div>
          <p class="hint" data-stock></p>
          ${(() => {
            const table = sizeChartTable(product, `Medidas de ${escapeHtml(product.name)} por talle`);
            return table
              ? `<details class="size-guide" data-size-guide>
                  <summary>Guía de talles</summary>
                  <p class="hint">Medidas de la prenda en centímetros, estirada sobre una superficie plana. Compará con una prenda tuya de tela parecida.</p>
                  ${table}
                  ${measureHelp(product)}
                </details>`
              : "";
          })()}
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
          ${design ? "" : `<div class="breakdown" data-breakdown style="margin-top:var(--sp-3)"></div>`}
          <p class="hint" style="margin-top:var(--sp-2)">${
            design
              ? `Incluye el estampado de «${escapeHtml(design.name)}» en el frente.`
              : `El precio ya incluye el estampado del frente. ${product.faces.length > 1 ? "Cada otra zona que estampes suma su recargo (ver abajo). " : ""}El precio final se ajusta en el editor según las zonas que diseñes.`
          }</p>
        </div>

        <div class="notice notice--danger form-errors" role="alert" data-errors></div>

        <div class="pdp__actions">
          ${
            design
              ? `<button class="btn btn--primary btn--lg btn--block" type="submit" data-add>${icon("bag")} Agregar al carrito</button>
                 <button class="btn btn--block" type="button" data-customize>${icon("edit")} Personalizar</button>
                 <p class="hint" style="margin:0;text-align:center">Movelo, cambiale el tamaño o sumale texto antes de comprar.</p>`
              : `<button class="btn btn--primary btn--lg btn--block" type="submit">Personalizar en el editor ${icon("arrowRight")}</button>`
          }
          <p class="hint pdp__delivery">${icon("package")} Te llega en 5 a 7 días hábiles, con el envío incluido en ese plazo. Enviamos a todo el país.</p>
        </div>

        ${design ? otherProducts.length
              ? `<div class="pdp__others"><p class="mono dcard__label">También en</p>
                  <ul class="dcard__products" role="list">${otherProducts
                    .map((x) => `<li><a class="chip" href="producto.html?id=${encodeURIComponent(x.id)}&diseno=${encodeURIComponent(design.id)}">${escapeHtml(x.name)}<small>${formatPrice(startingPrice(x, [design.id]))}</small></a></li>`)
                    .join("")}</ul></div>`
              : "" : ""}

        ${design ? `<details class="pdp__zones"><summary>Estampar en más lugares</summary><p class="hint">Desde «Personalizar» podés sumar estampas en otras zonas. Cada una tiene su recargo:</p>` : ""}
        <dl class="spec-list">
          ${product.faces.map((f) => `<dt>${faceLabel(f)}</dt><dd data-zone-size="${f}"></dd>`).join("")}
          <dt>Medidas</dt><dd data-zone-note></dd>
          <dt>Técnica</dt><dd>DTG: impresión directa sobre la prenda</dd>
          ${design ? "" : `<dt>Archivos</dt><dd>JPG, PNG o SVG · hasta 25 MB, o un <a href="disenos.html">diseño de la tienda</a></dd>`}
        </dl>
        ${design ? `</details>` : ""}
      </form>
    </div>
    ${IS_DEMO ? `<section class="section reviews" id="opiniones" aria-labelledby="rv-title">
      <div class="section-head">
        <div>
          <span class="section-head__num">Opiniones</span>
          <h2 id="rv-title" class="display h1">Qué dicen de esta prenda</h2>
        </div>
      </div>
      ${(() => {
        const list = listReviews({ productId: product.id });
        return reviewsBlock(list, reviewSummary(list));
      })()}
    </section>` : ""}`;

  const stage = root.querySelector("[data-stage]");
  const form = root.querySelector("[data-form]");
  const qtyInput = root.querySelector("[data-qty-input]");

  function renderStage() {
    if (state.face === "photo" && photoUrl) {
      stage.innerHTML = `<img class="pdp__photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(`${design.name} puesta`)}">`;
      root.querySelector("[data-stage-note]").textContent = "";
      return;
    }
    const col = getColor(state.colorId);
    const spec = getPrintSpec(product.type, state.face, state.sizeId);
    const art = design && state.face === product.faces[0] ? designArt(designUrl) : "";
    let svg = garmentSvg(product.type, state.face, col.hex, { art, colorId: col.id, title: `${product.name} ${col.name}, ${faceLabel(state.face)}` });
    if (state.guides) {
      const a = spec.area;
      // Se inserta antes del ÚLTIMO </svg>: el arte usa un <svg> anidado.
      const end = svg.lastIndexOf("</svg>");
      svg = svg.slice(0, end) + `<rect class="print-guide" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/>
         <text x="${a.x}" y="${a.y - 12}" font-family="Space Mono" font-size="22" fill="#7D3A5E">ÁREA ${spec.widthCm}×${spec.heightCm} CM</text></svg>`;
    }
    stage.innerHTML = svg;
    root.querySelector("[data-stage-note]").textContent = garmentPhoto(product.type, state.face, col.id)
      ? "Foto de referencia de la prenda. El color en pantalla es aproximado."
      : `${faceLabel(state.face)} ilustrada: todavía no hay foto de esta vista. El color en pantalla es aproximado.`;
  }

  function sync() {
    renderStage();
    root.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.color === state.colorId)));
    root.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.size === state.sizeId)));
    root.querySelectorAll("[data-face]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.face === state.face)));
    root.querySelector("[data-color-name]").textContent = getColor(state.colorId).name;
    const s = product.sizes.find((x) => x.id === state.sizeId);
    root.querySelector("[data-stock]").textContent = s ? `${stockLabel(s.stock)} en talle ${s.label} ${IS_DEMO ? " (stock de ejemplo)" : ""}` : "";
    qtyInput.value = state.qty;
    // Medidas máximas de estampa: cambian con el talle elegido.
    root.querySelectorAll("[data-zone-size]").forEach((dd) => {
      const sp = getPrintSpec(product.type, dd.dataset.zoneSize, state.sizeId);
      dd.textContent = `hasta ${sp.widthCm} × ${sp.heightCm} cm · ${zoneCost(dd.dataset.zoneSize)}`;
    });
    root.querySelector("[data-zone-note]").textContent = s && product.sizes.length > 1 ? `Áreas máximas en talle ${s.label}: crecen con el talle` : "Áreas máximas de estampa";
    root.querySelectorAll("[data-qty]").forEach((b) => {
      b.disabled = (b.dataset.qty === "-1" && state.qty <= 1) || (b.dataset.qty === "1" && state.qty >= 50);
    });
    const price = computePrice(product, state, { printedFaces: [product.faces[0]], storeDesignIds: design ? [design.id] : [] });
    root.querySelector("[data-unit]").textContent = formatPrice(price.unit);
    const breakdown = root.querySelector("[data-breakdown]");
    if (breakdown) breakdown.innerHTML =
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
  root.querySelector("[data-faces]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-face]");
    if (b) (state.face = b.dataset.face), sync();
  });
  root.querySelector("[data-guides]")?.addEventListener("change", (e) => ((state.guides = e.target.checked), renderStage()));
  // Al elegir un color se muestra la prenda de ese color (no la foto con modelo).
  root.querySelector("[data-colors]").addEventListener("click", () => {
    if (state.face === "photo") (state.face = product.faces[0]), sync();
  });
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

  function goToEditor(add) {
    const v = validateVariant(product, state);
    const errEl = root.querySelector("[data-errors]");
    if (!v.ok) {
      errEl.innerHTML = v.errors.map(escapeHtml).join("<br>");
      return;
    }
    errEl.innerHTML = "";
    const q = new URLSearchParams({ product: product.id, color: state.colorId, size: state.sizeId, qty: String(state.qty) });
    if (design) q.set("storeDesign", design.id);
    if (design && add) q.set("agregar", "1");
    const btn = add ? root.querySelector("[data-add]") : null;
    if (btn) (btn.disabled = true), (btn.innerHTML = `<span class="spinner"></span> Agregando…`);
    location.href = `editor.html?${q}`;
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    goToEditor(true);
  });
  root.querySelector("[data-customize]")?.addEventListener("click", () => goToEditor(false));
  // Al volver con «atrás» el botón no debe quedar en «Agregando…».
  addEventListener("pageshow", (e) => {
    const btn = root.querySelector("[data-add]");
    if (e.persisted && btn) (btn.disabled = false), (btn.innerHTML = `${icon("bag")} Agregar al carrito`);
  });

  sync();
  if (design) {
    storeDesignImageUrl(design).then((url) => {
      designUrl = url;
      renderStage();
    });
    // Foto con modelo (si está cargada): va primero.
    modelPhotoUrl(design).then((url) => {
      if (!url) return;
      photoUrl = url;
      root.querySelector("[data-faces]").insertAdjacentHTML("afterbegin", `<button type="button" data-face="photo">Foto</button>`);
      state.face = "photo";
      sync();
    });
  }
}
