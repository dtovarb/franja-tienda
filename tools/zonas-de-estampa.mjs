/**
 * Imprime en JSON las zonas de estampa de cada prenda que se ven en la foto
 * de frente, en unidades del escenario: el frente en talle M y las zonas del
 * cuerpo (frente, logos) en todos los talles. Lo usa tools/mapas-de-luz.py.
 * Las mangas quedan afuera: tocan el borde de la prenda y el mapa de luz
 * teñiría el fondo de la foto.
 *
 *   node tools/zonas-de-estampa.mjs > /tmp/zonas.json
 */
import { GARMENTS, getPrintSpec, viewOf } from "../assets/js/data/garments.js";
import { SIZE_CHARTS } from "../assets/js/data/size-charts.js";

const out = {};
for (const [type, g] of Object.entries(GARMENTS)) {
  const sizes = SIZE_CHARTS[type]?.rows.map((r) => r.size) || ["M"];
  const rect = (a) => [a.x, a.y, a.w, a.h].map(Math.round);
  out[type] = {
    front: rect(getPrintSpec(type, "front").area),
    zones: Object.keys(g.faces)
      .filter((f) => viewOf(type, f) === "front" && !f.startsWith("sleeve"))
      .flatMap((f) => sizes.map((s) => rect(getPrintSpec(type, f, s).area))),
  };
}
console.log(JSON.stringify(out));
