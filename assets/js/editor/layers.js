/** Lista de capas de la cara activa (arriba = adelante). */
import { icon } from "../core/ui.js";
import { escapeHtml, round } from "../core/format.js";
import { faceLabel } from "../data/garments.js";
import { effectiveDpi, dpiLevel } from "./export.js";

export function createLayers({ ed, canvas, commit, spec, openSheet, isMobile, checkBounds }) {
  const list = document.querySelector("[data-layers]");
  const count = document.querySelector("[data-layer-count]");
  const faceEl = document.querySelector("[data-layers-face]");

  const nameOf = (o) =>
    o.type === "i-text" ? `“${o.text.replace(/\s+/g, " ").slice(0, 28)}${o.text.length > 28 ? "…" : ""}”` : o.assetName || "Imagen";

  function render() {
    const objs = canvas.getObjects();
    const active = new Set(canvas.getActiveObjects());
    count.textContent = objs.length;
    faceEl.textContent = faceLabel(ed.face);
    if (!objs.length) {
      list.innerHTML = `<li class="hint">Todavía no hay elementos en esta cara.</li>`;
      return;
    }
    const k = spec().cmPerUnit;
    list.innerHTML = objs
      .map((o, i) => ({ o, i }))
      .reverse()
      .map(({ o, i }) => {
        const size = `${round(o.getScaledWidth() * k)} × ${round(o.getScaledHeight() * k)} cm`;
        let meta = size;
        let warn = false;
        if (o.outOfArea) (meta = "Fuera del área de impresión"), (warn = true);
        else if (o.type === "image" && dpiLevel(effectiveDpi(o, k)) === "low") (meta = `${size} · baja resolución`), (warn = true);
        return `<li class="layer" aria-current="${active.has(o)}">
          <span class="layer__kind">${icon(o.type === "i-text" ? "text" : "image")}</span>
          <button class="layer__select" type="button" data-layer-select="${i}">
            <span class="layer__name">${escapeHtml(nameOf(o))}</span>
            <span class="layer__meta ${warn ? "warn" : ""}">${meta}</span>
          </button>
          <span class="layer__btns">
            <button class="icon-btn" type="button" data-layer-up="${i}" aria-label="Traer adelante" ${i === objs.length - 1 ? "disabled" : ""}>${icon("up")}</button>
            <button class="icon-btn" type="button" data-layer-down="${i}" aria-label="Enviar atrás" ${i === 0 ? "disabled" : ""}>${icon("down")}</button>
            <button class="icon-btn" type="button" data-layer-del="${i}" aria-label="Eliminar">${icon("trash")}</button>
          </span>
        </li>`;
      })
      .join("");
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const objs = canvas.getObjects();
    const idx = Number(b.dataset.layerSelect ?? b.dataset.layerUp ?? b.dataset.layerDown ?? b.dataset.layerDel);
    const o = objs[idx];
    if (!o) return;
    if ("layerSelect" in b.dataset) {
      canvas.setActiveObject(o);
      canvas.requestRenderAll();
      if (isMobile()) openSheet("props");
      return;
    }
    if ("layerUp" in b.dataset) canvas.bringForward(o);
    if ("layerDown" in b.dataset) canvas.sendBackwards(o);
    if ("layerDel" in b.dataset) {
      canvas.discardActiveObject();
      canvas.remove(o);
    }
    checkBounds();
    commit();
  });

  return { render };
}
