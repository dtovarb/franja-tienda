/**
 * Panel de propiedades del elemento seleccionado.
 * - render(): reconstruye el panel cuando cambia la selección.
 * - sync():   actualiza los valores mientras el usuario arrastra/escala/rota,
 *             sin pisar el campo que tiene el foco.
 * Las medidas se muestran en centímetros relativos al área de impresión.
 */
import { FONTS, INKS } from "./config.js";
import { effectiveDpi, dpiLevel } from "./export.js";
import { icon } from "../core/ui.js";
import { escapeHtml, round, formatBytes } from "../core/format.js";
import { getTechnique } from "../core/pricing.js";

export function createProps({ ed, canvas, commit, commitSoon, checkBounds, fitToArea, spec, duplicateSelection, deleteSelection }) {
  const host = document.querySelector("[data-props]");
  let current = null;

  const cm = () => spec().cmPerUnit;
  const area = () => spec().area;

  function emptyState() {
    return `<div class="props-empty">
      <p><b>Seleccioná un elemento</b> en la prenda para ver y ajustar sus propiedades.</p>
      <ul>
        <li>Arrastrá para mover.</li>
        <li>Usá las esquinas para escalar sin deformar.</li>
        <li>El círculo de arriba rota el elemento.</li>
        <li>Doble clic sobre un texto para escribir.</li>
      </ul>
      <p class="hint">Atajos: Ctrl+Z deshacer · Ctrl+Shift+Z rehacer · Ctrl+D duplicar · Supr eliminar · flechas para mover.</p>
    </div>`;
  }

  function num(name, label, unit, step = 0.1, extra = "") {
    return `<div class="field--inline"><label for="p-${name}">${label}</label>
      <div class="unit-input"><input class="input" id="p-${name}" data-p="${name}" type="number" inputmode="decimal" step="${step}" ${extra}><span>${unit}</span></div></div>`;
  }

  function geometry() {
    return `<section class="ed-section">
      <h3 class="ed-h">Posición y tamaño</h3>
      <div class="props-grid">
        ${num("x", "X (centro)", "cm")}
        ${num("y", "Y (centro)", "cm")}
        ${num("w", "Ancho", "cm", 0.1, 'min="0.5"')}
        ${num("h", "Alto", "cm", 0.1, 'min="0.5"')}
        <div class="field--inline full"><label for="p-angle">Rotación</label>
          <div style="display:grid;grid-template-columns:1fr 92px;gap:8px;align-items:center">
            <input type="range" min="-180" max="180" step="1" data-p="angleRange" aria-label="Rotación (deslizador)">
            <div class="unit-input"><input class="input" id="p-angle" data-p="angle" type="number" step="1" min="-180" max="180"><span>°</span></div>
          </div>
        </div>
      </div>
      <p class="hint">Medidas reales sobre la prenda (talle M), desde la esquina superior izquierda del área de impresión. El escalado mantiene la proporción.</p>
      <div class="toolrow">
        <button class="toggle-btn" type="button" data-p-act="center">${icon("center")}Centrar</button>
        <button class="toggle-btn" type="button" data-p-act="fit">${icon("fit")}Ajustar al área</button>
        <button class="toggle-btn" type="button" data-p-act="front" aria-label="Traer adelante">${icon("up")}Adelante</button>
        <button class="toggle-btn" type="button" data-p-act="back" aria-label="Enviar atrás">${icon("down")}Atrás</button>
      </div>
    </section>`;
  }

  function actions() {
    return `<section class="ed-section"><div class="props-actions">
      <button class="btn btn--sm" type="button" data-p-act="duplicate">${icon("copy")}Duplicar</button>
      <button class="btn btn--sm" type="button" data-p-act="delete">${icon("trash")}Eliminar</button>
    </div></section>`;
  }

  function textSection(o) {
    const font = FONTS.find((f) => f.family === o.fontFamily) || FONTS[0];
    return `<section class="ed-section">
      <h3 class="ed-h">Texto</h3>
      <div class="field"><label for="p-text" class="sr-only">Contenido</label>
        <textarea class="textarea" id="p-text" data-p="text" rows="2" maxlength="300">${escapeHtml(o.text)}</textarea></div>
      <div class="props-grid">
        <div class="field--inline full"><label for="p-font">Fuente</label>
          <select class="select" id="p-font" data-p="fontFamily">
            ${FONTS.map((f) => `<option value="${f.family}" ${f.family === o.fontFamily ? "selected" : ""} style="font-family:'${f.family}'">${f.family}</option>`).join("")}
          </select></div>
        ${num("fontSize", "Tamaño", "pt", 1, 'min="8" max="400"')}
        <div class="field--inline"><span class="label" style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--c-ink-2)">Estilo</span>
          <button class="toggle-btn" type="button" data-p="bold" aria-pressed="${o.fontWeight === "bold"}" ${font.bold ? "" : 'disabled title="Esta fuente tiene un único peso"'}>${icon("bold")}Negrita</button></div>
      </div>
      <div class="field--inline"><span class="label" style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--c-ink-2)">Alineación</span>
        <div class="toolrow" role="group" aria-label="Alineación">
          ${["left", "center", "right"]
            .map(
              (al) => `<button class="toggle-btn" type="button" data-p="align" data-v="${al}" aria-pressed="${o.textAlign === al}" aria-label="${{ left: "Izquierda", center: "Centro", right: "Derecha" }[al]}">${icon(
                { left: "alignLeft", center: "alignCenter", right: "alignRight" }[al]
              )}</button>`
            )
            .join("")}
        </div></div>
      <div class="field--inline"><span class="label" style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--c-ink-2)">Color de tinta</span>
        <div class="ink-swatches">
          ${INKS.map((c) => `<button type="button" class="ink" style="--sw:${c.hex}" data-p="fill" data-v="${c.hex}" aria-label="${c.name}" title="${c.name}" aria-pressed="${String(o.fill).toLowerCase() === c.hex}"></button>`).join("")}
          <label class="sr-only" for="p-fill">Otro color</label>
          <input type="color" class="ink-picker" id="p-fill" data-p="fillCustom" value="${toHex(o.fill)}" title="Otro color">
        </div></div>
    </section>`;
  }

  function imageSection(o) {
    const a = ed.uploads.get(o.assetId);
    return `<section class="ed-section">
      <h3 class="ed-h">Imagen</h3>
      <p style="font-size:var(--fs-sm);overflow-wrap:anywhere"><b>${escapeHtml(o.assetName || "Imagen")}</b><br>
        <span class="muted">${o.isVector ? "Vectorial (SVG)" : `${o.srcWidth} × ${o.srcHeight} px`}${a ? ` · ${formatBytes(a.size)}` : ""} · original conservado</span></p>
      <div class="dpi" data-dpi></div>
    </section>`;
  }

  function multiSection(n) {
    return `<section class="ed-section"><p><b>${n} elementos seleccionados.</b></p>
      <p class="hint">Podés moverlos, escalarlos o rotarlos juntos en la prenda. Para editar propiedades, seleccioná uno solo.</p>
      <div class="toolrow"><button class="toggle-btn" type="button" data-p-act="fit">${icon("fit")}Ajustar al área</button></div></section>`;
  }

  function render(force = false) {
    const o = canvas.getActiveObject();
    if (!force && o && o === current && o.type !== "activeSelection" && host.firstElementChild) {
      sync();
      return;
    }
    current = o || null;
    if (!o) {
      host.innerHTML = emptyState();
      return;
    }
    if (o.type === "activeSelection") {
      host.innerHTML = multiSection(o.getObjects().length) + actions();
      return;
    }
    host.innerHTML = (o.type === "i-text" ? textSection(o) : imageSection(o)) + geometry() + actions();
    sync(true);
  }

  function sync(force = false) {
    const o = current;
    if (!o || o.type === "activeSelection" || !host.isConnected) return;
    const a = area();
    const k = cm();
    const vals = {
      x: round((o.left - a.x) * k),
      y: round((o.top - a.y) * k),
      w: round(o.getScaledWidth() * k),
      h: round(o.getScaledHeight() * k),
      angle: Math.round(normAngle(o.angle)),
      angleRange: Math.round(normAngle(o.angle)),
      fontSize: o.fontSize ? Math.round(o.fontSize * (o.scaleY || 1)) : null,
      text: o.text,
    };
    host.querySelectorAll("[data-p]").forEach((el) => {
      const key = el.dataset.p;
      if (!(key in vals) || vals[key] == null) return;
      if (!force && el === document.activeElement) return;
      if (String(el.value) !== String(vals[key])) el.value = vals[key];
    });
    if (o.type === "image") renderDpi(o);
  }

  function renderDpi(o) {
    const el = host.querySelector("[data-dpi]");
    if (!el) return;
    const tech = getTechnique();
    const dpi = effectiveDpi(o, cm());
    const level = dpiLevel(dpi, tech);
    el.dataset.level = level;
    const pct = level === "vector" ? 100 : Math.min(100, Math.round((dpi / tech.idealDpi) * 100));
    const msg = {
      vector: "Vectorial: se escala sin perder nitidez.",
      good: `Resolución adecuada para este tamaño (${tech.idealDpi} DPI o más).`,
      fair: `Aceptable, pero puede perder detalle. Ideal: ${tech.idealDpi} DPI. Achicala o usá un archivo más grande.`,
      low: `Baja resolución para este tamaño: probablemente se vea pixelada. Achicala o subí un archivo más grande.`,
    }[level];
    el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><b>Resolución de impresión</b><span class="mono">${level === "vector" ? "VECTOR" : `${dpi} DPI`}</span></div>
      <div class="dpi__bar" aria-hidden="true"><span style="width:${pct}%"></span></div><span>${msg}</span>`;
  }

  /* -------- Entrada del usuario -------- */
  function applyNumber(key, raw) {
    const o = current;
    if (!o) return;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    const a = area();
    const k = cm();
    if (key === "x") o.set({ left: a.x + v / k });
    if (key === "y") o.set({ top: a.y + v / k });
    if (key === "w" && v > 0) {
      const s = (v / k / o.width) * Math.sign(o.scaleX || 1);
      o.set({ scaleX: s, scaleY: s });
    }
    if (key === "h" && v > 0) {
      const s = v / k / o.height;
      o.set({ scaleX: s, scaleY: s });
    }
    if (key === "angle" || key === "angleRange") o.rotate(normAngle(v));
    if (key === "fontSize" && o.type === "i-text") {
      o.set({ fontSize: Math.max(8, Math.min(400, v)) / (o.scaleY || 1) });
      o.initDimensions?.();
    }
    o.setCoords();
    canvas.requestRenderAll();
    checkBounds();
    sync();
    commitSoon();
  }

  host.addEventListener("input", (e) => {
    const el = e.target;
    const key = el.dataset.p;
    if (!key || !current) return;
    if (key === "text") {
      current.set({ text: el.value });
      current.initDimensions?.();
      current.setCoords();
      canvas.requestRenderAll();
      checkBounds();
      commitSoon();
    } else if (key === "fillCustom") {
      current.set({ fill: el.value });
      canvas.requestRenderAll();
      host.querySelectorAll('[data-p="fill"]').forEach((b) => b.setAttribute("aria-pressed", "false"));
      commitSoon();
    } else if (["x", "y", "w", "h", "angle", "angleRange", "fontSize"].includes(key)) {
      applyNumber(key, el.value);
    }
  });

  host.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.p === "fontFamily" && current) {
      const fam = el.value;
      const f = FONTS.find((x) => x.family === fam);
      await document.fonts.load(`${f?.bold && current.fontWeight === "bold" ? 700 : 400} 40px "${fam}"`).catch(() => {});
      window.fabric.util.clearFabricFontCache(fam);
      current.set({ fontFamily: fam, fontWeight: f?.bold ? current.fontWeight : "normal" });
      current.initDimensions();
      current.setCoords();
      canvas.requestRenderAll();
      checkBounds();
      commit();
      render(true);
    }
    if (el.dataset.p === "text" && current && !el.value.trim()) {
      el.value = current.text = "TEXTO";
      canvas.requestRenderAll();
    }
  });

  host.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-p], [data-p-act]");
    if (!b || b.disabled) return;
    const o = current;
    const key = b.dataset.p;
    if (key === "bold" && o) {
      const bold = o.fontWeight !== "bold";
      await document.fonts.load(`${bold ? 700 : 400} 40px "${o.fontFamily}"`).catch(() => {});
      window.fabric.util.clearFabricFontCache(o.fontFamily);
      o.set({ fontWeight: bold ? "bold" : "normal" });
      o.initDimensions();
      b.setAttribute("aria-pressed", String(bold));
      done();
    } else if (key === "align" && o) {
      o.set({ textAlign: b.dataset.v });
      host.querySelectorAll('[data-p="align"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      done();
    } else if (key === "fill" && o) {
      o.set({ fill: b.dataset.v });
      host.querySelectorAll('[data-p="fill"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const picker = host.querySelector('[data-p="fillCustom"]');
      if (picker) picker.value = b.dataset.v;
      done();
    }
    const act = b.dataset.pAct;
    if (!act) return;
    const active = canvas.getActiveObject();
    if (act === "duplicate") return duplicateSelection();
    if (act === "delete") return deleteSelection();
    if (!active) return;
    if (act === "center") {
      const a = area();
      active.set({ left: a.x + a.w / 2 });
    } else if (act === "fit") fitToArea(active);
    else if (act === "front") canvas.bringForward(active);
    else if (act === "back") canvas.sendBackwards(active);
    active.setCoords();
    done();
  });

  function done() {
    canvas.requestRenderAll();
    checkBounds();
    sync();
    commit();
  }

  return { render, sync: () => sync(false) };
}

function normAngle(a) {
  let x = ((a % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}

function toHex(c) {
  if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  return "#121212";
}
