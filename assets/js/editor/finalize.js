/**
 * "Finalizar diseño": valida, reconstruye, genera archivos y prepara el
 * artículo para el carrito. No simula compras ni pedidos guardados.
 */
import { icon, toast } from "../core/ui.js";
import { getColor, validateVariant } from "../data/catalog.js";
import { getPrintSpec, faceLabel } from "../data/garments.js";
import { getAssets, sha256Hex } from "../core/asset-store.js";
import { saveDesign, deleteDesign } from "../core/designs.js";
import { upsertItem, getItem } from "../core/cart.js";
import { formatPrice, formatBytes, escapeHtml, slugify } from "../core/format.js";
import { getTechnique } from "../core/pricing.js";
import { EXPORT_DPI_OPTIONS, DEFAULT_DPI } from "./config.js";
import { verifyRebuild, enliven, hydrate, isInside } from "./serialize.js";
import { renderPreview, renderPrintFile, buildDesignDocument, buildZip, resolutionReport, downloadBlob } from "./export.js";

const STEPS = [
  ["variant", "Validar producto y variantes"],
  ["content", "Revisar contenido y área de impresión"],
  ["rebuild", "Comprobar que el diseño se pueda reconstruir"],
  ["preview", "Preparar vista previa"],
  ["editable", "Generar estructura editable"],
  ["originals", "Verificar archivos originales"],
  ["resolution", "Validar resolución para impresión"],
  ["cart", "Preparar datos para el carrito"],
];

export async function openFinalize({ ed, product, price, printedFaces, setFace, usedStoreDesigns = () => [] }) {
  const dlg = document.querySelector("[data-finalize]");
  const faces = printedFaces();
  const facesJson = Object.fromEntries(faces.map((f) => [f, ed.faces[f]]));
  const out = { previews: {}, previewUrls: {}, prints: {}, doc: null, report: [], assets: [] };

  dlg.innerHTML = `
    <div class="fin">
      <div class="fin__main">
        <div class="fin__head">
          <div><p class="eyebrow muted">Finalizar diseño</p><h2 id="fin-title" class="display fin__title">Revisando tu diseño</h2></div>
          <button class="icon-btn" type="button" data-fin-close aria-label="Volver al editor">${icon("close")}</button>
        </div>
        <ol class="checklist" role="list" data-checklist>
          ${STEPS.map(([id, label]) => `<li data-step="${id}" data-st="wait"><span class="st"></span><span>${label}<small data-msg></small></span></li>`).join("")}
        </ol>
        <div data-fin-body></div>
      </div>
      <aside class="fin__side" data-fin-side>
        <p class="muted" style="font-size:var(--fs-sm)">Generando archivos…</p>
      </aside>
    </div>`;
  dlg.showModal();
  dlg.querySelector("[data-fin-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => Object.values(out.previewUrls).forEach(URL.revokeObjectURL), { once: true });

  const step = (id, st, msg = "") => {
    const li = dlg.querySelector(`[data-step="${id}"]`);
    li.dataset.st = st;
    li.querySelector(".st").innerHTML = st === "ok" ? icon("check") : st === "error" ? icon("close") : st === "warn" ? "!" : "";
    li.querySelector("[data-msg]").textContent = msg;
  };
  const fail = (id, msg, extraHtml = "") => {
    step(id, "error", msg);
    dlg.querySelector("[data-fin-body]").innerHTML = `<div class="notice notice--danger" role="alert">${icon("alert")}<div><b>No se puede finalizar todavía.</b><br>${escapeHtml(msg)}${extraHtml}</div></div>
      <button class="btn btn--primary" type="button" data-fin-back style="justify-self:start;margin-top:12px">Volver al editor</button>`;
    dlg.querySelector("[data-fin-side]").innerHTML = `<p class="muted" style="font-size:var(--fs-sm)">Corregí lo indicado y volvé a tocar «Finalizar diseño». Tu diseño no se perdió.</p>`;
    dlg.querySelector("[data-fin-back]").addEventListener("click", () => dlg.close());
    dlg.querySelector("#fin-title").textContent = "Falta un ajuste";
  };

  try {
    // 1. Producto y variantes
    step("variant", "run");
    const v = validateVariant(product, ed.variant);
    if (!v.ok) return fail("variant", v.errors.join(" "));
    step("variant", "ok", `${product.name} · ${getColor(ed.variant.colorId).name} · ${ed.variant.sizeId} · ${ed.variant.qty} u.`);

    // 2. Contenido y límites
    step("content", "run");
    if (!faces.length) return fail("content", "El diseño está vacío. Agregá al menos una imagen o un texto.");
    const outside = [];
    for (const f of faces) {
      const live = await enliven(await hydrate(ed.faces[f]));
      const area = getPrintSpec(product.type, f).area;
      live.forEach((o) => {
        const r = o.getBoundingRect(true, true);
        if (!isInside({ x: r.left, y: r.top, w: r.width, h: r.height }, area)) outside.push(f);
      });
    }
    if (outside.length) {
      const f = outside[0];
      fail("content", `Hay ${outside.length} elemento(s) fuera del área de impresión (${[...new Set(outside)].map(faceLabel).join(", ")}).`,
        ` <br><button class="btn btn--sm" type="button" data-goto-face="${f}" style="margin-top:8px">Ir a ${faceLabel(f).toLowerCase()}</button>`);
      bindGoto();
      return;
    }
    step("content", "ok", `${faces.map(faceLabel).join(" y ")} · ${faces.reduce((n, f) => n + ed.faces[f].length, 0)} elementos`);

    // 3. Reconstrucción
    step("rebuild", "run");
    const rb = await verifyRebuild(facesJson);
    if (!rb.ok) return fail("rebuild", rb.problems.join(" "));
    step("rebuild", "ok", `${rb.objects} elementos reconstruidos desde JSON`);

    // 4. Vista previa
    step("preview", "run");
    const col = getColor(ed.variant.colorId);
    for (const f of faces) {
      out.previews[f] = await renderPreview({ productType: product.type, colorHex: col.hex, face: f, objects: ed.faces[f] });
      out.previewUrls[f] = URL.createObjectURL(out.previews[f]);
    }
    step("preview", "ok", faces.map((f) => `${faceLabel(f)} ${formatBytes(out.previews[f].size)}`).join(" · "));

    // 5. Estructura editable
    step("editable", "run");
    const pricing = price();
    out.doc = await buildDesignDocument({ designId: ed.designId, product, variant: ed.variant, faces: facesJson, pricing });
    step("editable", "ok", `JSON ${formatBytes(new Blob([JSON.stringify(out.doc)]).size)} · esquema ${out.doc.schema}`);

    // 6. Originales: se re-calcula el hash para confirmar que están intactos
    step("originals", "run");
    out.assets = await getAssets(out.doc.assets.map((a) => a.id));
    for (const a of out.assets) {
      const h = await sha256Hex(a.blob);
      if (h !== a.id) return fail("originals", `El original "${a.name}" no coincide con su huella SHA-256.`);
    }
    step("originals", "ok", out.assets.length ? `${out.assets.length} archivo(s) intacto(s) · SHA-256 verificado` : "Sin imágenes subidas (solo texto)");

    // 7. Resolución
    step("resolution", "run");
    out.report = resolutionReport(product.type, facesJson);
    const low = out.report.filter((r) => r.level === "low");
    const fair = out.report.filter((r) => r.level === "fair");
    if (low.length) step("resolution", "warn", `${low.length} imagen(es) con baja resolución para el tamaño elegido`);
    else if (fair.length) step("resolution", "warn", `${fair.length} imagen(es) con resolución aceptable, no ideal`);
    else step("resolution", "ok", out.report.length ? "Todas las imágenes alcanzan la resolución de referencia" : "Sin imágenes rasterizadas");

    // 8. Carrito
    step("cart", "run");
    step("cart", "ok", "Listo para agregar");
    dlg.querySelector("#fin-title").textContent = "Revisá tu diseño";
    renderSummary();
  } catch (err) {
    console.error(err);
    const running = dlg.querySelector('[data-st="run"]');
    fail(running?.dataset.step || "cart", err.message || "Error inesperado.");
  }

  function bindGoto() {
    dlg.querySelector("[data-goto-face]")?.addEventListener("click", (e) => {
      dlg.close();
      setFace(e.target.dataset.gotoFace);
    });
  }

  /* ---------------- Resumen + descargas ---------------- */
  function renderSummary() {
    const p = price();
    const col = getColor(ed.variant.colorId);
    const low = out.report.filter((r) => r.level === "low");
    const tech = getTechnique();
    const base = slugify(`${product.sku}-${col.name}-${ed.variant.sizeId}`);

    dlg.querySelector("[data-fin-body]").innerHTML = `
      <section style="display:grid;gap:12px">
        <h3 class="h3">Vista previa</h3>
        <div class="previews">
          ${faces
            .map(
              (f) => `<figure><img src="${out.previewUrls[f]}" alt="Vista previa ${faceLabel(f).toLowerCase()} de ${escapeHtml(product.name)} ${escapeHtml(col.name)}">
              <figcaption><b>${faceLabel(f)}</b><button class="btn btn--sm btn--ghost" type="button" data-dl="preview:${f}">${icon("download")}PNG</button></figcaption></figure>`
            )
            .join("")}
        </div>
      </section>

      ${out.report.length ? `<section style="display:grid;gap:8px">
        <h3 class="h3">Resolución de tus imágenes</h3>
        ${out.report
          .map((r) => {
            const cls = { good: "success", fair: "warning", low: "danger", vector: "success" }[r.level];
            const txt = { good: "Adecuada", fair: "Aceptable, no ideal", low: "Baja: puede verse pixelada", vector: "Vectorial" }[r.level];
            return `<div class="notice notice--${cls}">${icon(r.level === "good" || r.level === "vector" ? "check" : "alert")}<span><b>${escapeHtml(r.name)}</b> · ${faceLabel(r.face)} · ${r.widthCm}×${r.heightCm} cm · ${r.level === "vector" ? "vector" : `${r.dpi} DPI efectivos`} — ${txt}</span></div>`;
          })
          .join("")}
        <p class="hint">Referencia: ${tech.idealDpi} DPI ideal, ${tech.minDpi} DPI mínimo para ${tech.name}. Exportar con más píxeles no mejora una imagen de baja resolución.</p>
      </section>` : ""}

      <section style="display:grid;gap:10px">
        <h3 class="h3">Archivos</h3>
        <div class="export-opts">
          <div class="field--inline"><label for="fin-dpi">Resolución de exportación</label>
            <select class="select" id="fin-dpi" data-opt-dpi>${EXPORT_DPI_OPTIONS.map((d) => `<option value="${d}" ${d === DEFAULT_DPI ? "selected" : ""}>${d} DPI</option>`).join("")}</select></div>
          <div class="field--inline"><label for="fin-mode">Recorte</label>
            <select class="select" id="fin-mode" data-opt-mode><option value="area">Área completa</option><option value="content">Ajustado al diseño</option></select></div>
        </div>
        <div class="downloads">
          ${faces
            .map((f) => {
              const s = getPrintSpec(product.type, f);
              return `<div class="dl"><div><b>Archivo de impresión · ${faceLabel(f)}</b><small data-print-info="${f}">PNG transparente · área ${s.widthCm} × ${s.heightCm} cm · sin prenda ni guías</small></div>
                <button class="btn btn--sm" type="button" data-dl="print:${f}">${icon("download")}Generar</button></div>`;
            })
            .join("")}
          <div class="dl"><div><b>Diseño editable</b><small>JSON de Fabric.js + referencias a originales</small></div><button class="btn btn--sm" type="button" data-dl="json">${icon("download")}JSON</button></div>
          ${out.assets
            .map(
              (a) => `<div class="dl"><div><b>Original · ${escapeHtml(a.name)}</b><small>${formatBytes(a.size)} · ${a.isVector ? "SVG" : `${a.width}×${a.height} px`} · SHA-256 ${a.id.slice(0, 12)}…</small></div><button class="btn btn--sm" type="button" data-dl="orig:${a.id}">${icon("download")}Original</button></div>`
            )
            .join("")}
          <div class="dl" style="border-color:var(--c-ink)"><div><b>Paquete completo (.zip)</b><small>Todo lo anterior en un archivo para producción</small></div><button class="btn btn--sm btn--dark" type="button" data-dl="zip">${icon("package")}ZIP</button></div>
        </div>
        <p class="hint">Descargas generadas en tu navegador. En la tienda real, estos archivos se guardan en un almacenamiento privado asociado al pedido.</p>
      </section>`;

    dlg.querySelector("[data-fin-side]").innerHTML = `
      <h3 class="h3">Resumen</h3>
      <dl class="sum-list">
        <dt>Producto</dt><dd>${escapeHtml(product.name)}</dd>
        <dt>Color</dt><dd>${escapeHtml(col.name)}</dd>
        <dt>Talle</dt><dd>${escapeHtml(ed.variant.sizeId)}</dd>
        <dt>Cantidad</dt><dd>${ed.variant.qty}</dd>
        <dt>Caras</dt><dd>${faces.map(faceLabel).join(" + ")}</dd>
      </dl>
      <div class="breakdown">
        ${p.lines.map((l) => `<div><span>${l.label}</span><span>${formatPrice(l.amount)}</span></div>`).join("")}
        <div><span>Precio unitario</span><span>${formatPrice(p.unit)}</span></div>
        <div class="total"><span>Total × ${p.qty}</span><span class="price" style="font-size:1.375rem">${formatPrice(p.total)}</span></div>
      </div>
      ${low.length ? `<label class="notice notice--warning" style="cursor:pointer"><input type="checkbox" data-ack style="margin-top:3px"> <span>Entiendo que ${low.length === 1 ? "una imagen tiene" : "algunas imágenes tienen"} baja resolución y puede${low.length === 1 ? "" : "n"} verse pixelada${low.length === 1 ? "" : "s"}.</span></label>` : ""}
      <button class="btn btn--primary btn--lg btn--block" type="button" data-add-cart ${low.length ? "disabled" : ""}>${icon("bag")}${ed.cartItemId && getItem(ed.cartItemId) ? "Actualizar en el carrito" : "Agregar al carrito"}</button>
      <button class="btn btn--block" type="button" data-fin-back>${icon("back")}Volver al editor</button>
      <p class="hint">Volver al editor no borra nada. El carrito se guarda solo en este navegador.</p>`;

    const ack = dlg.querySelector("[data-ack]");
    const addBtn = dlg.querySelector("[data-add-cart]");
    ack?.addEventListener("change", () => (addBtn.disabled = !ack.checked));
    dlg.querySelector("[data-fin-back]").addEventListener("click", () => dlg.close());
    addBtn.addEventListener("click", addToCart);
    dlg.querySelector("[data-fin-body]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dl]");
      if (b) handleDownload(b, base);
    });
    dlg.querySelectorAll("[data-opt-dpi], [data-opt-mode]").forEach((el) => el.addEventListener("change", () => (out.prints = {})));
  }

  const opts = () => ({ dpi: Number(dlg.querySelector("[data-opt-dpi]").value), mode: dlg.querySelector("[data-opt-mode]").value });

  async function ensurePrint(f) {
    const o = opts();
    if (out.prints[f] && out.prints[f].dpi === o.dpi && out.prints[f].mode === o.mode) return out.prints[f];
    const r = await renderPrintFile({ productType: product.type, face: f, objects: ed.faces[f], ...o });
    out.prints[f] = r;
    const info = dlg.querySelector(`[data-print-info="${f}"]`);
    if (info) info.textContent = `${r.widthPx} × ${r.heightPx} px · ${r.widthCm} × ${r.heightCm} cm · ${r.dpi} DPI · ${formatBytes(r.blob.size)}`;
    return r;
  }

  async function handleDownload(btn, base) {
    const [kind, arg] = btn.dataset.dl.split(":");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      if (kind === "preview") downloadBlob(out.previews[arg], `${base}-vista-previa-${arg}.png`);
      if (kind === "print") {
        const r = await ensurePrint(arg);
        downloadBlob(r.blob, `${base}-impresion-${arg}-${r.dpi}dpi.png`);
      }
      if (kind === "json") downloadBlob(new Blob([JSON.stringify(out.doc, null, 2)], { type: "application/json" }), `${base}-diseno.json`);
      if (kind === "orig") {
        const a = out.assets.find((x) => x.id === arg);
        downloadBlob(a.blob, a.name); // bytes originales
      }
      if (kind === "zip") {
        for (const f of faces) await ensurePrint(f);
        const zip = await buildZip({ doc: out.doc, previews: out.previews, prints: out.prints });
        downloadBlob(zip, `${base}-paquete.zip`);
      }
      toast("Descarga lista.", "success", 2000);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo generar el archivo.", "error", 6000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  async function addToCart() {
    const btn = dlg.querySelector("[data-add-cart]");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Guardando…`;
    try {
      const thumbFace = faces[0];
      const thumbBlob = await renderPreview({
        productType: product.type,
        colorHex: getColor(ed.variant.colorId).hex,
        face: thumbFace,
        objects: ed.faces[thumbFace],
        scale: 0.3,
        type: "image/jpeg",
        quality: 0.82,
      });
      const thumbnail = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(thumbBlob);
      });
      const doc = saveDesign({
        id: ed.designId,
        productId: product.id,
        variant: ed.variant,
        faces: Object.fromEntries(Object.entries(ed.faces).map(([f, objs]) => [f, { objects: objs }])),
        status: "final",
        finalizedAt: new Date().toISOString(),
        storeDesignIds: usedStoreDesigns(),
      });
      const existing = ed.cartItemId ? getItem(ed.cartItemId) : null;
      const item = upsertItem({
        ...(existing ? { id: existing.id } : {}),
        productId: product.id,
        productName: product.name,
        variant: { colorId: ed.variant.colorId, sizeId: ed.variant.sizeId },
        qty: ed.variant.qty,
        printedFaces: faces,
        designId: doc.id,
        storeDesignIds: usedStoreDesigns(),
        assetIds: out.doc.assets.map((a) => a.id),
        thumbnail,
      });
      if (existing && existing.designId && existing.designId !== doc.id) deleteDesign(existing.designId);
      location.href = `carrito.html?added=${encodeURIComponent(item.id)}`;
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo agregar al carrito.", "error", 7000);
      btn.disabled = false;
      btn.innerHTML = `${icon("bag")}Agregar al carrito`;
    }
  }
}
