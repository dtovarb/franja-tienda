/**
 * Opiniones de EJEMPLO.
 *
 * Son textos simulados para mostrar cómo se va a ver la sección: no las
 * escribió ninguna clienta y la tienda las muestra siempre con la etiqueta
 * "Opiniones de ejemplo". Cuando lleguen las reales, este módulo se
 * reemplaza por GET /api/reviews?product=… con la misma estructura
 * (ver docs/ARQUITECTURA.md), y `verifiedPurchase` sale del pedido.
 *
 * Forma de cada opinión (nevrado.review/v1):
 *   id, productId, author (nombre + inicial), city, rating (1–5),
 *   title, body, size, colorId, date (ISO), verifiedPurchase, demo
 */

export const REVIEW_SCHEMA = "nevrado.review/v1";

const r = (id, productId, author, city, rating, title, body, size, colorId, date) => ({
  id,
  schema: REVIEW_SCHEMA,
  productId,
  author,
  city,
  rating,
  title,
  body,
  size,
  colorId,
  date,
  verifiedPurchase: false,
  demo: true,
});

export const DEMO_REVIEWS = [
  r("rv-01", "remera-clasica", "Martina G.", "CABA", 5, "La estampa quedó igual a la vista previa",
    "Subí un dibujo mío escaneado y me avisaron que estaba un poco chico para el tamaño que quería. Lo mandé de nuevo y quedó perfecto. Ya la lavé varias veces y no se agrietó.",
    "M", "blanco", "2026-09-02"),
  r("rv-02", "remera-oversize", "Juli R.", "Rosario", 5, "El corte es justo lo que buscaba",
    "Hombro caído de verdad y la tela es pesada, no se transparenta. Pedí la espalda con letras grandes y se ven nítidas.",
    "L", "negro", "2026-08-21"),
  r("rv-03", "remera-oversize", "Cami S.", "La Plata", 4, "Muy linda, viene amplia",
    "La calidad está muy bien. Le pongo cuatro porque me quedó más grande de lo que esperaba: si te gusta menos suelta, pedí un talle menos.",
    "M", "arena", "2026-09-15"),
  r("rv-04", "buzo-canguro", "Flor M.", "Córdoba", 5, "Abriga y la estampa no se mueve",
    "Lo uso casi todos los días desde que llegó. La frisa es suave por dentro y el diseño del pecho quedó bien centrado arriba del bolsillo.",
    "S", "negro", "2026-07-30"),
  r("rv-05", "buzo-cuello-redondo", "Agus P.", "Mar del Plata", 5, "Colores tal cual la foto",
    "Tenía miedo de que el bordó viniera más apagado y no: es el de la foto. El rib del cuello y los puños es firme.",
    "L", "bordo", "2026-09-28"),
  r("rv-06", "buzo-cuello-redondo", "Lu V.", "CABA", 4, "Lindo y prolijo",
    "Me gustó mucho cómo quedó el texto en el pecho. Tardó un par de días más de lo que pensaba, pero me fueron avisando.",
    "M", "rosa", "2026-10-01"),
  r("rv-07", "gorra", "Ro T.", "Mendoza", 5, "El lavado le queda hermoso",
    "Le puse las dos lunas chiquitas en el frente y queda muy bien con el color gastado. Se regula fácil.",
    "Único", "celeste", "2026-08-12"),
  r("rv-08", "tote-bag", "Sofi A.", "Salta", 5, "La llevo a todos lados",
    "El lienzo es grueso y las manijas aguantan la compu y el termo. La estampa grande en el frente se ve muy bien.",
    "Único", "crudo", "2026-09-09"),
  r("rv-09", "remera-clasica", "Vale N.", "Neuquén", 4, "Buena base para regalar",
    "Hice dos con la misma foto para un cumpleaños. La remera es cómoda; me hubiese gustado tener más colores para elegir.",
    "S", "grafito", "2026-10-05"),
  r("rv-10", "buzo-canguro", "Pili C.", "Tucumán", 5, "La capucha es enorme",
    "Capucha amplia y forrada, bolsillo cómodo y la estampa del pecho quedó bien arriba del bolsillo. Lo pedí en blanco y se mantiene blanco.",
    "XL", "blanco", "2026-09-19"),
];

/** Opiniones (de una prenda o todas), de la más nueva a la más vieja. */
export function listReviews({ productId = null } = {}) {
  return DEMO_REVIEWS.filter((x) => !productId || x.productId === productId).sort((a, b) => b.date.localeCompare(a.date));
}

/** Promedio, cantidad y reparto por estrellas. */
export function reviewSummary(list) {
  const count = list.length;
  const average = count ? list.reduce((n, x) => n + x.rating, 0) / count : 0;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: list.filter((x) => x.rating === stars).length }));
  return { count, average: Math.round(average * 10) / 10, distribution };
}
