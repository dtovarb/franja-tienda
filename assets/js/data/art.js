/**
 * Gráficas de DEMOSTRACIÓN (originales, vectoriales) para mockups del sitio.
 * Cada arte usa viewBox 0 0 100 100. `ink` se adapta al color de la prenda.
 */
const P = { red: "#A0533A", orange: "#F2BC98", white: "#FFFFFF", pink: "#D9A3BC", magenta: "#7D3A5E" };

export const DEMO_ART = {
  sol: ({ ink, uid }) => `
    <defs><clipPath id="sun-${uid}"><circle cx="50" cy="44" r="36"/></clipPath></defs>
    <g clip-path="url(#sun-${uid})">
      <rect x="0" y="8" width="100" height="14" fill="${P.red}"/>
      <rect x="0" y="23.5" width="100" height="12" fill="${P.orange}"/>
      <rect x="0" y="37" width="100" height="10" fill="${P.white}"/>
      <rect x="0" y="48.5" width="100" height="10" fill="${P.pink}"/>
      <rect x="0" y="60" width="100" height="22" fill="${P.magenta}"/>
    </g>
    <text x="50" y="94" text-anchor="middle" font-family="Archivo" font-stretch="70%" font-weight="900" font-size="12" letter-spacing=".2" fill="${ink}">calor de taller</text>`,
  franja: ({ ink }) => `
    <text x="50" y="40" text-anchor="middle" font-family="Archivo" font-stretch="62%" font-weight="900" font-size="34" fill="${ink}">nevrado</text>
    <g transform="translate(14 46)">
      <rect width="72" height="5" fill="${P.red}"/><rect y="6" width="72" height="5" fill="${P.orange}"/>
      <rect y="12" width="72" height="5" fill="${P.white}" stroke="${ink}" stroke-width=".4"/>
      <rect y="18" width="72" height="5" fill="${P.pink}"/><rect y="24" width="72" height="5" fill="${P.magenta}"/>
    </g>
    <text x="14" y="88" font-family="Space Mono" font-size="5" fill="${ink}">ED. 001 — HECHO EN TALLER PROPIO</text>`,
  hecho: ({ ink }) => `
    <text x="6" y="34" font-family="Archivo" font-stretch="75%" font-weight="850" font-size="25" fill="${ink}">lo</text>
    <text x="6" y="64" font-family="Archivo" font-stretch="75%" font-weight="850" font-size="25" fill="${ink}">hicimos</text>
    <text x="6" y="94" font-family="Archivo" font-stretch="75%" font-weight="850" font-size="25" fill="${P.red}">juntas.</text>
    <g transform="rotate(-14 76 30)">
      <circle cx="76" cy="30" r="17" fill="${P.pink}"/>
      <text x="76" y="28" text-anchor="middle" font-family="Space Mono" font-weight="700" font-size="5.5" fill="#1E1A1C">DISEÑO</text>
      <text x="76" y="35" text-anchor="middle" font-family="Space Mono" font-weight="700" font-size="5.5" fill="#1E1A1C">PROPIO</text>
    </g>`,
};

let n = 0;
export function demoArt(id, inkIsLight) {
  const fn = DEMO_ART[id];
  return fn ? fn({ ink: inkIsLight ? "#FFFFFF" : "#1E1A1C", uid: `a${++n}` }) : "";
}
