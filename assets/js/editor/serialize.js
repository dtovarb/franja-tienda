/**
 * Serialización del diseño.
 *
 * Formato editable = JSON de Fabric.js por cara, con estas reglas:
 *  - Las imágenes NO llevan el binario: `src` vale "asset:<sha256>" y
 *    `assetId` apunta al original guardado aparte.
 *  - Todas las coordenadas están en el espacio lógico de la prenda
 *    (1000 × 1200), independiente de la pantalla.
 */
/* global fabric */
import { CUSTOM_PROPS } from "./config.js";
import { assetDisplayUrl, getAsset } from "../core/asset-store.js";

export function snapshot(canvas) {
  return canvas.getObjects().map((o) => {
    const j = o.toObject(CUSTOM_PROPS);
    if (j.type === "image" && o.assetId) j.src = `asset:${o.assetId}`;
    return j;
  });
}

/** Copia del JSON con `src` resuelto a URLs locales de visualización. */
export async function hydrate(objects) {
  const out = JSON.parse(JSON.stringify(objects || []));
  for (const o of out) {
    if (o.type !== "image") continue;
    if (!o.assetId) throw new Error("Hay una imagen sin referencia a su archivo original.");
    const url = await assetDisplayUrl(o.assetId);
    if (!url) throw new Error(`No se encontró el archivo original "${o.assetName || o.assetId}" en este navegador.`);
    o.src = url;
  }
  return out;
}

export function enliven(objects) {
  return new Promise((resolve, reject) => {
    fabric.util.enlivenObjects(objects, (objs) => {
      if (objs.length !== objects.length || objs.some((o) => !o)) reject(new Error("Algunos elementos no se pudieron reconstruir."));
      else resolve(objs);
    });
  });
}

/** Reemplaza el contenido del canvas por `objects` (formato serializado). */
export async function restoreInto(canvas, objects) {
  const live = await enliven(await hydrate(objects));
  canvas.renderOnAddRemove = false;
  canvas.discardActiveObject();
  canvas.remove(...canvas.getObjects());
  live.forEach((o) => canvas.add(o));
  canvas.renderOnAddRemove = true;
  canvas.requestRenderAll();
  return live;
}

/** Crea un StaticCanvas fuera de pantalla con el contenido de una cara. */
export async function staticCanvasFor(objects, { width, height, viewportTransform }) {
  const el = document.createElement("canvas");
  const sc = new fabric.StaticCanvas(el, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  sc.setViewportTransform(viewportTransform);
  const live = await enliven(await hydrate(objects));
  live.forEach((o) => {
    o.objectCaching = false; // render a resolución completa (sin caché reducida)
    sc.add(o);
  });
  sc.renderAll();
  return sc;
}

/**
 * Comprueba que el diseño se pueda reconstruir desde su JSON:
 * mismo número y tipo de elementos y todos los originales disponibles.
 */
export async function verifyRebuild(facesJson) {
  const problems = [];
  let objects = 0;
  const parsed = JSON.parse(JSON.stringify(facesJson)); // ida y vuelta por texto
  for (const [face, objs] of Object.entries(parsed)) {
    for (const o of objs) {
      if (o.type === "image") {
        const a = await getAsset(o.assetId);
        if (!a || !a.blob || a.blob.size !== a.size) problems.push(`Falta el original de "${o.assetName}" (${face}).`);
      }
    }
    try {
      const sc = await staticCanvasFor(objs, { width: 10, height: 12, viewportTransform: [0.01, 0, 0, 0.01, 0, 0] });
      const rebuilt = sc.getObjects();
      if (rebuilt.length !== objs.length) problems.push(`La cara ${face} se reconstruyó con ${rebuilt.length} de ${objs.length} elementos.`);
      rebuilt.forEach((r, i) => r.type !== objs[i].type && problems.push(`Elemento ${i + 1} (${face}) cambió de tipo.`));
      objects += rebuilt.length;
      sc.dispose();
    } catch (err) {
      problems.push(`La cara ${face} no se pudo reconstruir: ${err.message}`);
    }
  }
  return { ok: problems.length === 0, problems, objects };
}

/** Rectángulo envolvente (coordenadas lógicas) de un objeto serializado o vivo. */
export function boundsOf(obj) {
  obj.setCoords();
  const r = obj.getBoundingRect(true, true);
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function isInside(b, area, tol = 0.5) {
  return b.x >= area.x - tol && b.y >= area.y - tol && b.x + b.w <= area.x + area.w + tol && b.y + b.h <= area.y + area.h + tol;
}
