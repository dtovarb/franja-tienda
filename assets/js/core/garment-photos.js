/**
 * Fotos de prenda por color que la dueña sube desde el panel (pestaña
 * «Productos»). Reemplazan a la foto que viene con la tienda
 * (assets/img/prendas/) para ese tipo de prenda y color, en la tienda y en
 * el editor. Con servidor se guardan en site_settings (clave
 * 'garment_photos'); en la demostración, en este navegador.
 *
 * Cada foto son tres archivos que arma el panel: la foto encuadrada en el
 * escenario de 1000 × 1200 (para que las zonas de estampa caigan en el mismo
 * lugar que en la foto original) y sus dos mapas de luz (sombras y brillos).
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */

export const GARMENT_PHOTOS_KEY = "nevrado:fotos-prendas:v1";
export const PHOTO_LAYERS = ["base", "shade", "light"];
const KEY_RE = /^[a-z]{2,20}-[a-z0-9-]{1,40}$/;

/** Clave de una foto: `${tipo}-${color}`, igual que los archivos de assets/img/prendas/. */
export const garmentPhotoKey = (type, colorId) => `${type}-${colorId}`;

/** Con servidor una dirección https (o del propio sitio); en la demo, una imagen data: del navegador. */
function cleanUrl(u) {
  if (typeof u !== "string") return null;
  if (/^https:\/\//.test(u) || (u.startsWith("/") && !u.startsWith("//"))) return u.slice(0, 600);
  if (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(u)) return u;
  return null;
}

/** Valida y limpia: deja solo las fotos completas (las tres capas) con clave válida. */
export function normalizeGarmentPhotos(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, p] of Object.entries(raw)) {
    if (!KEY_RE.test(key) || !p || typeof p !== "object") continue;
    const urls = PHOTO_LAYERS.map((l) => cleanUrl(p[l]));
    if (urls.some((u) => !u)) continue;
    out[key] = {
      ...Object.fromEntries(PHOTO_LAYERS.map((l, i) => [l, urls[i]])),
      name: String(p.name || "foto").slice(0, 120),
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt.slice(0, 40) : null,
    };
  }
  return out;
}
