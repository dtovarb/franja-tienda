/**
 * Panel, pestaña «Productos»: fotos de cada prenda por color.
 *
 * Cada color de un producto muestra su foto de frente (la que viene con la
 * tienda, la que subió la dueña o, si no hay ninguna, el dibujo). Una foto
 * nueva se encuadra en el escenario de 1000 × 1200 con la foto original de
 * guía, así las zonas de estampa del editor caen en el mismo lugar. Al
 * guardar se arman acá mismo los mapas de luz (como tools/mapas-de-luz.py)
 * y se suben los tres archivos.
 *
 * La foto vale para el tipo de prenda y el color (`tee-negro`): la usan
 * todos los productos de ese tipo.
 */
import { SERVER, api, putToTarget } from "../core/api.js";
import { readJSON, writeJSON } from "../core/storage.js";
import { toast, confirmDialog, icon } from "../core/ui.js";
import { escapeHtml } from "../core/format.js";
import { sha256Hex } from "../core/asset-store.js";
import { GARMENT_PHOTOS_KEY, garmentPhotoKey, normalizeGarmentPhotos } from "../core/garment-photos.js";
import { GARMENT_COLORS } from "../data/catalog.js";
import { SIZE_CHARTS } from "../data/size-charts.js";
import {
  STAGE, GARMENTS, garmentSvg, garmentPhoto, bundledPhoto, referencePhoto, getPrintSpec, viewOf, faceLabel, setUploadedPhotos,
} from "../data/garments.js";

const MIN_SIDE = 600;
let photos = {};

/* ======================= Datos ======================= */
const data = SERVER
  ? {
      load: async () => (await api("admin/garment-photos")).garmentPhotos,
      async save(key, files, name) {
        const photo = { name };
        for (const [layer, blob] of Object.entries(files)) {
          const meta = { sha256: await sha256Hex(blob), mime: blob.type, bytes: blob.size, name: `${key}-${layer}.${blob.type === "image/png" ? "png" : "jpg"}` };
          const { target } = await api("admin/uploads", { method: "POST", body: { file: meta } });
          await putToTarget(target, blob);
          photo[layer] = meta;
        }
        return (await api(`admin/garment-photos/${key}`, { method: "PUT", body: { photo } })).garmentPhotos;
      },
      remove: async (key) => (await api(`admin/garment-photos/${key}`, { method: "PUT", body: { photo: null } })).garmentPhotos,
    }
  : {
      load: async () => normalizeGarmentPhotos(readJSON(GARMENT_PHOTOS_KEY, null)),
      async save(key, files, name) {
        const cur = normalizeGarmentPhotos(readJSON(GARMENT_PHOTOS_KEY, null));
        const urls = {};
        for (const [layer, blob] of Object.entries(files)) urls[layer] = await blobToDataUrl(blob);
        cur[key] = { ...urls, name, updatedAt: new Date().toISOString() };
        try {
          writeJSON(GARMENT_PHOTOS_KEY, cur);
        } catch {
          throw new Error("No hay más lugar en este navegador para fotos de demostración. Quitá alguna y probá de nuevo.");
        }
        if (!readJSON(GARMENT_PHOTOS_KEY, null)?.[key]) throw new Error("No hay más lugar en este navegador para fotos de demostración.");
        return cur;
      },
      async remove(key) {
        const cur = normalizeGarmentPhotos(readJSON(GARMENT_PHOTOS_KEY, null));
        delete cur[key];
        writeJSON(GARMENT_PHOTOS_KEY, cur);
        return cur;
      },
    };

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("No se pudo leer la foto."));
    r.readAsDataURL(blob);
  });

function apply(map) {
  photos = map || {};
  setUploadedPhotos(photos);
}

/** Trae las fotos subidas (frescas, sin la caché del catálogo) antes de dibujar la pestaña. */
export async function loadGarmentPhotos() {
  try {
    apply(await data.load());
  } catch (err) {
    console.error("fotos de prenda", err);
  }
}

/* ======================= Bloque por producto ======================= */
function colorCard(p, colorId) {
  const c = GARMENT_COLORS[colorId];
  if (!c) return "";
  const key = garmentPhotoKey(p.type, colorId);
  const uploaded = !!photos[key];
  const hasPhoto = !!garmentPhoto(p.type, "front", colorId);
  const state = uploaded ? "Tu foto" : bundledPhoto(p.type, colorId) ? "Foto de la tienda" : "Sin foto: se ve el dibujo";
  return `<li class="admin-colorphoto" data-photo-key="${key}">
    <div class="admin-colorphoto__img">${garmentSvg(p.type, "front", c.hex, { colorId, layer: "base", title: `${p.name} ${c.name}` })}</div>
    <div class="admin-colorphoto__info">
      <b><span class="swatch swatch--sm" style="--sw:${c.hex}"></span> ${escapeHtml(c.name)}</b>
      <span class="hint">${state}</span>
    </div>
    <div class="admin-colorphoto__actions">
      <label class="btn btn--sm">${icon(hasPhoto ? "edit" : "plus")}${hasPhoto ? "Cambiar" : "Subir"}
        <input class="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-photo-file="${key}" data-photo-type="${p.type}" data-photo-color="${colorId}" aria-label="${hasPhoto ? "Cambiar" : "Subir"} foto ${escapeHtml(c.name)}">
      </label>
      ${uploaded ? `<button class="btn btn--sm btn--ghost" type="button" data-photo-remove="${key}">${bundledPhoto(p.type, colorId) ? "Volver a la original" : "Quitar"}</button>` : ""}
    </div>
  </li>`;
}

/** HTML de las fotos por color de un producto (va dentro de su ficha en Productos). */
export function photosBlock(p) {
  return `<section class="admin-colorphotos" data-photos-for="${p.id}" aria-label="Fotos por color">
    <h4 class="label">Fotos por color</h4>
    <p class="hint">La foto de frente de cada color: se ve en la tienda y de fondo en el editor. Al subir una nueva la encuadrás sobre la foto original para que las zonas de estampa queden en su lugar. Vale para todos los productos de tipo «${escapeHtml(GARMENTS[p.type]?.name || p.type)}». Para sumar un color, marcalo arriba y guardá.</p>
    <ul class="admin-colorphotos__list" role="list">${p.colors.map((c) => colorCard(p, c)).join("")}</ul>
  </section>`;
}

/**
 * Escucha subir / quitar en el panel. `products()` da la lista vigente, para
 * redibujar los bloques después de guardar.
 */
export function bindPhotos(panel, products) {
  const redraw = () => {
    for (const el of panel.querySelectorAll("[data-photos-for]")) {
      const p = products().find((x) => x.id === el.dataset.photosFor);
      if (p) el.outerHTML = photosBlock(p);
    }
    // La miniatura de cada producto es la foto de su primer color.
    for (const p of products()) {
      const th = panel.querySelector(`[data-product-row="${p.id}"] .admin-product__thumb`);
      if (th) th.innerHTML = garmentSvg(p.type, "front", GARMENT_COLORS[p.colors[0]]?.hex || "#f4f4f1", { title: p.name, colorId: p.colors[0] });
    }
  };
  panel.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-photo-file]");
    if (!input?.files[0]) return;
    const file = input.files[0];
    input.value = "";
    const { photoType: type, photoColor: colorId, photoFile: key } = input.dataset;
    let bmp;
    try {
      bmp = await readPhoto(file);
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    const files = await framePhoto(bmp, type, colorId);
    bmp.close?.();
    if (!files) return;
    try {
      apply(await data.save(key, files, file.name.slice(0, 120)));
      redraw();
      toast(`Foto de ${GARMENT_COLORS[colorId]?.name || colorId} guardada${SERVER ? ". En la tienda se ve en un minuto como mucho." : " en este navegador."}`, "success");
    } catch (err) {
      toast(err?.message || "No se pudo guardar la foto.", "error");
    }
  });
  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-photo-remove]");
    if (!b) return;
    const key = b.dataset.photoRemove;
    const ok = await confirmDialog({
      title: "¿Quitar tu foto?",
      body: "Vuelve la foto que venía con la tienda (o el dibujo, si ese color no tenía).",
      confirmLabel: "Quitar foto",
      danger: true,
    });
    if (!ok) return;
    try {
      apply(await data.remove(key));
      redraw();
      toast("Foto quitada.", "success");
    } catch (err) {
      toast(err?.message || "No se pudo quitar la foto.", "error");
    }
  });
}

async function readPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("La foto tiene que ser JPG, PNG o WebP.");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la foto. Probá exportarla de nuevo como JPG.");
  }
  if (Math.min(bmp.width, bmp.height) < MIN_SIDE) {
    bmp.close?.();
    throw new Error(`La foto mide ${bmp.width}×${bmp.height} px: es muy chica (mínimo ${MIN_SIDE} px de lado).`);
  }
  return bmp;
}

/* ======================= Encuadre ======================= */

/** Zonas que se ven en la foto de frente (talle M), para dibujarlas de guía. */
function frontZones(type) {
  return Object.keys(GARMENTS[type].faces)
    .filter((f) => viewOf(type, f) === "front")
    .map((f) => ({ face: f, area: getPrintSpec(type, f).area }));
}

/** Color de fondo: el promedio de las esquinas de la foto (para lo que la foto no cubre). */
function cornerColor(bmp) {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  const px = [0, 7, 56, 63].map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  const avg = [0, 1, 2].map((k) => Math.round(px.reduce((s, p) => s + p[k], 0) / px.length));
  return `rgb(${avg.join(",")})`;
}

const loadImg = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Abre el encuadre. Devuelve { base, shade, light } (Blobs) o null si se cancela.
 * Posición: `scale` (unidades del escenario por píxel de la foto) y `x`, `y`
 * (esquina de arriba a la izquierda, en unidades del escenario).
 */
async function framePhoto(bmp, type, colorId) {
  const ref = referencePhoto(type, colorId);
  const guide = ref ? await loadImg(ref.base) : null;
  const zones = frontZones(type);
  const fit = Math.min(STAGE.width / bmp.width, STAGE.height / bmp.height);
  const st = { scale: fit, x: (STAGE.width - bmp.width * fit) / 2, y: (STAGE.height - bmp.height * fit) / 2, ghost: guide ? 0.4 : 0, bg: cornerColor(bmp) };
  const colorName = GARMENT_COLORS[colorId]?.name || colorId;

  const d = document.createElement("dialog");
  d.className = "dialog admin-frame";
  d.setAttribute("aria-labelledby", "frame-title");
  d.innerHTML = `
    <form method="dialog" class="dialog__body">
      <h2 id="frame-title" class="h3">Encuadrar foto · ${escapeHtml(GARMENTS[type].name)} ${escapeHtml(colorName)}</h2>
      <p class="hint">${guide ? "Mové y agrandá tu foto hasta que la prenda coincida con la foto de guía (la transparente): cuello, hombros y ruedo en el mismo lugar." : "Mové y agrandá tu foto hasta que la prenda quede centrada y las zonas de estampa caigan sobre ella."} Arrastrá con el mouse o el dedo; las flechas del teclado la mueven de a poco.</p>
      <div class="admin-frame__stage"><canvas width="500" height="600" tabindex="0" aria-label="Vista del encuadre. Arrastrá para mover la foto."></canvas></div>
      <div class="admin-frame__controls">
        <label class="field"><span class="label">Tamaño</span>
          <input type="range" name="zoom" min="40" max="300" step="1" value="100"></label>
        ${guide ? `<label class="field"><span class="label">Foto de guía</span>
          <input type="range" name="ghost" min="0" max="80" step="1" value="${Math.round(st.ghost * 100)}"></label>` : ""}
        <div class="admin-frame__nudge" role="group" aria-label="Mover la foto">
          <button class="btn btn--sm btn--ghost" type="button" data-nudge="0,-4" aria-label="Subir">↑</button>
          <button class="btn btn--sm btn--ghost" type="button" data-nudge="0,4" aria-label="Bajar">↓</button>
          <button class="btn btn--sm btn--ghost" type="button" data-nudge="-4,0" aria-label="Izquierda">←</button>
          <button class="btn btn--sm btn--ghost" type="button" data-nudge="4,0" aria-label="Derecha">→</button>
          <button class="btn btn--sm btn--ghost" type="button" data-center>Centrar</button>
        </div>
      </div>
      <p class="hint">Las líneas punteadas son las zonas de estampa (talle M). Lo que la foto no cubra se pinta del color de su fondo.</p>
      <div class="dialog__actions">
        <button class="btn btn--ghost" value="cancel">Cancelar</button>
        <button class="btn btn--primary" value="ok" data-confirm>Guardar foto</button>
      </div>
    </form>`;
  document.body.appendChild(d);
  const cv = d.querySelector("canvas");
  const g = cv.getContext("2d");
  const k = cv.width / STAGE.width;

  const paint = (ctx, s, { guides }) => {
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, STAGE.width, STAGE.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, st.x, st.y, bmp.width * st.scale, bmp.height * st.scale);
    if (guides) {
      if (guide && st.ghost > 0) {
        ctx.globalAlpha = st.ghost;
        ctx.drawImage(guide, 0, 0, STAGE.width, STAGE.height);
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.font = "600 22px system-ui, sans-serif";
      for (const z of zones) {
        const a = z.area;
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.strokeRect(a.x, a.y, a.w, a.h);
        ctx.strokeStyle = "#a50062";
        ctx.lineDashOffset = 10;
        ctx.strokeRect(a.x, a.y, a.w, a.h);
        ctx.lineDashOffset = 0;
        if (z.face === "front") {
          ctx.fillStyle = "#a50062";
          ctx.fillText(faceLabel(z.face), a.x + 8, a.y + 26);
        }
      }
    }
    ctx.restore();
  };
  const draw = () => paint(g, k, { guides: true });

  const zoomIn = d.querySelector("[name=zoom]");
  const setScale = (next) => {
    // Agranda o achica desde el centro del escenario.
    const cx = STAGE.width / 2, cy = STAGE.height / 2;
    st.x = cx - ((cx - st.x) * next) / st.scale;
    st.y = cy - ((cy - st.y) * next) / st.scale;
    st.scale = next;
    draw();
  };
  zoomIn.addEventListener("input", () => setScale((fit * Number(zoomIn.value)) / 100));
  d.querySelector("[name=ghost]")?.addEventListener("input", (e) => {
    st.ghost = Number(e.target.value) / 100;
    draw();
  });
  const move = (dx, dy) => {
    st.x += dx;
    st.y += dy;
    draw();
  };
  d.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nudge]");
    if (n) move(...n.dataset.nudge.split(",").map(Number));
    if (e.target.closest("[data-center]")) {
      st.x = (STAGE.width - bmp.width * st.scale) / 2;
      st.y = (STAGE.height - bmp.height * st.scale) / 2;
      draw();
    }
  });
  cv.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 20 : 4;
    const m = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
    if (!m) return;
    e.preventDefault();
    move(...m);
  });
  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = STAGE.width / cv.getBoundingClientRect().width; // unidades del escenario por píxel de pantalla
    move((e.clientX - drag.x) * r, (e.clientY - drag.y) * r);
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => (drag = null);
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const v = Math.max(40, Math.min(300, Number(zoomIn.value) - Math.sign(e.deltaY) * 4));
      zoomIn.value = v;
      setScale((fit * v) / 100);
    },
    { passive: false }
  );
  draw();

  const ok = await new Promise((resolve) => {
    d.addEventListener("close", () => resolve(d.returnValue === "ok"));
    d.showModal();
    cv.focus();
  });
  if (!ok) {
    d.remove();
    return null;
  }
  const out = document.createElement("canvas");
  out.width = STAGE.width;
  out.height = STAGE.height;
  const og = out.getContext("2d", { willReadFrequently: true });
  paint(og, 1, { guides: false });
  d.remove();
  const base = await new Promise((r) => out.toBlob(r, "image/jpeg", 0.88));
  const { shade, light } = await lightMaps(og.getImageData(0, 0, STAGE.width, STAGE.height), type);
  return { base, shade, light };
}

/* ======================= Mapas de luz ======================= */

/** Desenfoque gaussiano separable de una imagen en grises (Float32Array w × h). */
function blur(src, w, h, sigma) {
  const r = Math.ceil(sigma * 3);
  const kern = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = kern.reduce((a, b) => a + b, 0);
  const kn = kern.map((v) => v / sum);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * kn[i + r];
      tmp[y * w + x] = s;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * kn[i + r];
      out[y * w + x] = s;
    }
  return out;
}

/** erf aproximada (Abramowitz-Stegun), para el borde suave de cada zona. */
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * Sombras (para multiplicar) y brillos (para trama) sacados de la foto, solo
 * sobre las zonas de estampa del cuerpo: las mismas cuentas que
 * tools/mapas-de-luz.py. Salen a 500 × 600, en PNG.
 */
async function lightMaps(img, type) {
  const W = STAGE.width, H = STAGE.height, MARGIN = 30, SOFT = 14;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  const g = blur(gray, W, H, 1.2);
  const f = getPrintSpec(type, "front").area;
  const sample = [];
  for (let y = Math.round(f.y); y < Math.round(f.y + f.h); y++) for (let x = Math.round(f.x); x < Math.round(f.x + f.w); x++) sample.push(g[y * W + x]);
  sample.sort((a, b) => a - b);
  const med = sample[Math.floor(sample.length / 2)] ?? 128;
  const dark = med < 70;

  // Zonas del cuerpo en todos los talles (las mangas no: tocan el borde y teñirían el fondo).
  const sizes = SIZE_CHARTS[type]?.rows.map((r) => r.size) || ["M"];
  const rects = Object.keys(GARMENTS[type].faces)
    .filter((fc) => viewOf(type, fc) === "front" && !fc.startsWith("sleeve"))
    .flatMap((fc) => sizes.map((s) => getPrintSpec(type, fc, s).area))
    .map((a) => [a.x - MARGIN, a.y - MARGIN, a.x + a.w + MARGIN, a.y + a.h + MARGIN]);
  const soft = (v, a, b) => 0.5 * (erf((v - a) / (SOFT * Math.SQRT2)) - erf((v - b) / (SOFT * Math.SQRT2)));
  const colsByRect = rects.map(([x0, , x1]) => Float32Array.from({ length: W }, (_, x) => soft(x, x0, x1)));

  const shadeC = document.createElement("canvas");
  const lightC = document.createElement("canvas");
  shadeC.width = lightC.width = W;
  shadeC.height = lightC.height = H;
  const sImg = new ImageData(W, H);
  const lImg = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    const rowW = rects.map(([, y0, , y1]) => soft(y, y0, y1));
    for (let x = 0; x < W; x++) {
      let mk = 0;
      for (let r = 0; r < rects.length; r++) mk = Math.max(mk, rowW[r] * colsByRect[r][x]);
      const i = y * W + x;
      const ratio = Math.min(1, Math.max(0, g[i] / Math.max(med, 1)));
      let shade = Math.min(1, Math.max(0.5, ratio ** (dark ? 0.55 : 0.9)));
      let light = Math.min(1, Math.max(0, (g[i] - med) / Math.max(255 - med, 1))) * (dark ? 0.9 : 0.5);
      shade = 1 - (1 - shade) * mk;
      light *= mk;
      const s8 = Math.round(shade * 255), l8 = Math.round(light * 255);
      sImg.data.set([s8, s8, s8, 255], i * 4);
      lImg.data.set([l8, l8, l8, 255], i * 4);
    }
  }
  shadeC.getContext("2d").putImageData(sImg, 0, 0);
  lightC.getContext("2d").putImageData(lImg, 0, 0);
  const half = async (c) => {
    const o = document.createElement("canvas");
    o.width = W / 2;
    o.height = H / 2;
    o.getContext("2d").drawImage(c, 0, 0, W / 2, H / 2);
    return new Promise((r) => o.toBlob(r, "image/png"));
  };
  return { shade: await half(shadeC), light: await half(lightC) };
}
