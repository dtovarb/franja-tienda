/**
 * Tablas de talles por tipo de prenda, en centímetros.
 * Medidas de prenda (no del cuerpo), tomadas con la prenda estirada sobre una
 * superficie plana. Fuente: la tabla de referencia que eligió la tienda
 * (remanija.com.ar/tabla-de-talles.html, 13/10/2026). El buzo cuello redondo
 * usa la tabla de buzo medio cierre, como indica esa página.
 *
 * La ficha y las preguntas frecuentes muestran solo los talles que la prenda
 * tiene a la venta.
 */

export const MEASURE_NOTES = {
  ancho: "De axila a axila, con la prenda doblada al medio.",
  largo: "Desde el hombro hasta el borde de abajo.",
  manga: "Desde el hombro hasta el puño.",
};

const COLS = { ancho: "Ancho", largo: "Largo", manga: "Manga" };

const rows = (cols, data) => ({ cols, rows: data.map(([size, ...v]) => ({ size, ...Object.fromEntries(cols.map((c, i) => [c, v[i]])) })) });

export const SIZE_CHARTS = {
  tee: rows(["ancho", "largo"], [
    ["XS", 50, 69], ["S", 54, 72], ["M", 57, 73], ["L", 57, 74], ["XL", 59, 75],
    ["XXL", 61, 77], ["3XL", 64, 76], ["4XL", 66, 86], ["5XL", 68, 88],
  ]),
  oversize: rows(["ancho", "largo"], [
    ["XXS", 51, 78], ["XS", 54.6, 80], ["S", 57.6, 82.6], ["M", 61.5, 84.5],
    ["L", 65.6, 86.3], ["XL", 68.5, 88], ["XXL", 71.6, 89.8],
  ]),
  hoodie: rows(["ancho", "largo", "manga"], [
    ["XS", 54, 68, 63], ["S", 54, 72, 64], ["M", 57, 73, 64], ["L", 59, 75, 67], ["XL", 60, 78, 68],
    ["XXL", 62, 82, 71], ["3XL", 67, 83, 71], ["4XL", 72, 86, 71], ["5XL", 78, 88, 71],
    ["6XL", 79, 90, 71.5], ["7XL", 84, 90, 71.5],
  ]),
  crewneck: rows(["ancho", "largo", "manga"], [
    ["XS", 52, 68, 63], ["S", 54, 72, 64], ["M", 57, 73, 64], ["L", 59, 75, 67], ["XL", 60, 78, 68],
    ["XXL", 62, 82, 71], ["3XL", 67, 83, 71], ["4XL", 72, 86, 71], ["5XL", 78, 88, 71], ["6XL", 84, 90, 72],
  ]),
};

const cm = (n) => n.toLocaleString("es-AR");

/** Filas de la tabla para los talles que vende el producto (null si no tiene tabla). */
export function sizeChartFor(product) {
  const chart = SIZE_CHARTS[product.type];
  if (!chart) return null;
  const sold = product.sizes.map((s) => s.id.toUpperCase().replace(/^2XL$/, "XXL"));
  const list = chart.rows.filter((r) => sold.includes(r.size));
  return list.length ? { cols: chart.cols, rows: list } : null;
}

/** Tabla HTML (sin título) de un producto, o "" si no tiene. */
export function sizeChartTable(product, caption) {
  const chart = sizeChartFor(product);
  if (!chart) return "";
  return `<div class="table-wrap"><table class="size-table" data-size-chart="${product.id}">
    <caption class="sr-only">${caption}</caption>
    <thead><tr><th scope="col">Talle</th>${chart.cols.map((c) => `<th scope="col">${COLS[c]} (cm)</th>`).join("")}</tr></thead>
    <tbody>${chart.rows.map((r) => `<tr><th scope="row">${r.size}</th>${chart.cols.map((c) => `<td>${cm(r[c])}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

/** Cómo medir, para las columnas que usa la tabla. */
export function measureHelp(product) {
  const chart = sizeChartFor(product);
  if (!chart) return "";
  return `<ul class="size-help">${chart.cols.map((c) => `<li><b>${COLS[c]}:</b> ${MEASURE_NOTES[c]}</li>`).join("")}</ul>`;
}
