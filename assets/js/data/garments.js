/**
 * Tipos de prenda: mockups vectoriales originales + áreas imprimibles.
 *
 * Todas las prendas usan un espacio lógico fijo de 1000 × 1200 unidades.
 * El editor escala ese espacio al tamaño de pantalla (zoom), por lo que el
 * área imprimible queda definida en coordenadas proporcionales al producto
 * y nunca en píxeles de pantalla.
 *
 * Cada zona define su medida de estampa en centímetros, por talle. `cmPerUnit`
 * relaciona el espacio lógico con centímetros en el talle M (el de las fotos)
 * y se escala para los otros talles con la tabla de talles: el área en
 * pantalla y el archivo de impresión salen de la misma cuenta.
 */

import { SIZE_CHARTS } from "./size-charts.js";

export const STAGE = { width: 1000, height: 1200 };

/**
 * Zonas de estampa. Cada zona es una "cara" del editor con su propia área
 * imprimible y su archivo de impresión. Las zonas chicas se dibujan sobre
 * una vista de la prenda (`view`: frente o espalda).
 */
const FACE_LABELS = {
  front: "Frente",
  back: "Espalda",
  chest: "Logo en el pecho",
  heart: "Logo en el corazón",
  "front-low": "Logo abajo",
  "sleeve-left": "Manga izquierda",
  "sleeve-right": "Manga derecha",
  label: "Etiqueta interior",
};
/** Aclaración breve de cada zona chica, para la clienta. */
const FACE_HINTS = {
  chest: "Arriba del frente, para un logo o una palabra.",
  heart: "Logo chico en el pecho izquierdo de quien la usa: en la foto queda a la derecha.",
  "front-low": "Abajo del frente, cerca del ruedo.",
  "sleeve-left": "La de quien la usa: en la foto queda a la derecha.",
  "sleeve-right": "La de quien la usa: en la foto queda a la izquierda.",
  label: "Se imprime del lado de adentro, en la nuca, donde iría la etiqueta.",
};

/* ---------------- Formas ---------------- */

const TEE_BODY =
  "M395 120 C430 178 570 178 605 120 L760 158 C820 185 880 300 930 400 L815 470 " +
  "C795 440 780 420 770 400 L778 1100 C600 1116 400 1116 222 1100 L230 400 " +
  "C220 420 205 440 185 470 L70 400 C120 300 180 185 240 158 Z";
const TEE_BODY_BACK =
  "M395 120 C440 142 560 142 605 120 L760 158 C820 185 880 300 930 400 L815 470 " +
  "C795 440 780 420 770 400 L778 1100 C600 1116 400 1116 222 1100 L230 400 " +
  "C220 420 205 440 185 470 L70 400 C120 300 180 185 240 158 Z";

const OVR_BODY =
  "M390 130 C430 192 570 192 610 130 L795 182 C850 215 905 380 945 560 L808 610 " +
  "C800 570 792 520 790 470 L796 1120 C600 1134 400 1134 204 1120 L210 470 " +
  "C208 520 200 570 192 610 L55 560 C95 380 150 215 205 182 Z";
const OVR_BODY_BACK =
  "M390 130 C440 156 560 156 610 130 L795 182 C850 215 905 380 945 560 L808 610 " +
  "C800 570 792 520 790 470 L796 1120 C600 1134 400 1134 204 1120 L210 470 " +
  "C208 520 200 570 192 610 L55 560 C95 380 150 215 205 182 Z";

const HOODIE_BODY =
  "M380 200 C420 250 580 250 620 200 L760 222 C850 250 880 420 892 1010 L790 1022 " +
  "C786 820 778 620 765 470 L768 1080 L770 1146 C600 1160 400 1160 230 1146 L232 1080 " +
  "L235 470 C222 620 214 820 210 1022 L108 1010 C120 420 150 250 240 222 Z";

const TOTE_BODY = "M180 340 L820 340 L836 1130 L164 1130 Z";

const CAP_CROWN = "M196 790 C190 500 320 330 500 326 C680 330 810 500 804 790 Z";
const CAP_BRIM =
  "M150 792 C320 742 680 742 850 792 C866 846 822 900 752 924 C600 878 400 878 248 924 C178 900 134 846 150 792 Z";

/* ---------------- Utilidades de color ---------------- */

export function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

let uidCounter = 0;
const nextUid = () => `g${(++uidCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Arma las capas de una prenda:
 *  - base:  tela con su color, interior de cuello/capucha, costuras.
 *  - shade: sombras (pliegues, volumen en los bordes, textura de punto). Se
 *           aplica en modo MULTIPLICAR por encima de la estampa, así la
 *           estampa toma los pliegues de la tela.
 *  - light: brillos suaves y grano. Se aplica en modo TRAMA (screen).
 * Las tres capas comparten el espacio lógico 1000 × 1200: el área imprimible
 * no se mueve.
 */
function frame({ uid, color, body, inner = "", details = "", folds = "", highlights = "", extraUnder = "" }) {
  const dark = luminance(color) < 0.18;
  const seam = dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.2)";
  const edge = dark ? "rgba(0,0,0,.6)" : "rgba(0,0,0,.28)";
  const k = dark ? 1 : 0.4; // intensidad de sombras
  const fk = dark ? 0.5 : 0.2; // intensidad de pliegues
  const hl = dark ? 0.16 : 0.34; // intensidad de brillos
  const defs = `
  <defs>
    <clipPath id="clip-${uid}"><path d="${body}"/></clipPath>
    <linearGradient id="side-${uid}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="${0.55 * k}"/>
      <stop offset=".18" stop-color="#000" stop-opacity="0"/>
      <stop offset=".82" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="${0.6 * k}"/>
    </linearGradient>
    <linearGradient id="vert-${uid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset=".7" stop-color="#000" stop-opacity="${0.08 * k}"/>
      <stop offset="1" stop-color="#000" stop-opacity="${0.3 * k}"/>
    </linearGradient>
    <radialGradient id="glow-${uid}" cx=".44" cy=".3" r=".55">
      <stop offset="0" stop-color="#fff" stop-opacity="${hl}"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="softer-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="drop-${uid}" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="grain-${uid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="1.15 0.95" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 .4  0 0 0 0 .4  0 0 0 0 .4  2.6 0 0 0 -1.25"/>
    </filter>
    <pattern id="knit-${uid}" width="6" height="5" patternUnits="userSpaceOnUse">
      <path d="M0 2.5 Q1.5 0.6 3 2.5 T6 2.5" fill="none" stroke="#000" stroke-width=".7" opacity=".5"/>
    </pattern>
  </defs>`;
  const base = `
  <path d="${body}" transform="translate(0 18)" fill="#000" opacity=".18" filter="url(#drop-${uid})"/>
  ${extraUnder}
  <path d="${body}" fill="${color}"/>
  ${inner.replaceAll("{c}", color).replaceAll("{edge}", edge)}
  <g fill="none" stroke="${seam}" stroke-width="2.5" stroke-dasharray="7 6" style="pointer-events:none">${details}</g>`;
  const shade = `
  <g clip-path="url(#clip-${uid})">
    <rect width="1000" height="1200" fill="url(#side-${uid})"/>
    <rect width="1000" height="1200" fill="url(#vert-${uid})"/>
    <path d="${body}" fill="none" stroke="#000" stroke-width="60" opacity="${0.35 * k}" filter="url(#softer-${uid})"/>
    <g fill="#000" opacity="${fk}" filter="url(#softer-${uid})">${folds}</g>
    <g fill="none" stroke="#000" stroke-width="5" opacity="${0.22 * k}" filter="url(#soft-${uid})">${details}</g>
    <rect width="1000" height="1200" fill="url(#knit-${uid})" opacity="${dark ? 0.3 : 0.07}"/>
    <rect width="1000" height="1200" filter="url(#grain-${uid})" opacity="${dark ? 0.3 : 0.14}"/>
  </g>
  <path d="${body}" fill="none" stroke="${edge}" stroke-width="2"/>`;
  const light = `
  <g clip-path="url(#clip-${uid})">
    <rect width="1000" height="1200" fill="url(#glow-${uid})"/>
    <g fill="#fff" opacity="${hl * 0.9}" filter="url(#soft-${uid})">${highlights}</g>
    <rect width="1000" height="1200" filter="url(#grain-${uid})" opacity="${dark ? 0.12 : 0}"/>
  </g>`;
  return { defs, base, shade, light };
}

/* ---------------- Dibujo de cada prenda ---------------- */

function drawTee(face, color, uid) {
  const front = face === "front";
  const body = front ? TEE_BODY : TEE_BODY_BACK;
  const inner = front
    ? `<path d="M395 120 C450 98 550 98 605 120 C570 178 430 178 395 120 Z" fill="{c}"/>
       <path d="M395 120 C450 98 550 98 605 120 C570 178 430 178 395 120 Z" fill="#000" opacity=".28"/>
       <path d="M392 118 C430 186 570 186 608 118" fill="none" stroke="{edge}" stroke-width="16" opacity=".35"/>
       <path d="M392 118 C430 186 570 186 608 118" fill="none" stroke="{c}" stroke-width="12"/>`
    : `<path d="M392 118 C440 146 560 146 608 118" fill="none" stroke="{c}" stroke-width="14"/>
       <path d="M392 118 C440 146 560 146 608 118" fill="none" stroke="{edge}" stroke-width="2"/>`;
  const details = `
    <path d="M${front ? "399 136 C432 196 568 196 601 136" : "399 132 C440 158 560 158 601 132"}"/>
    <path d="M242 162 C256 250 248 330 232 402"/>
    <path d="M758 162 C744 250 752 330 768 402"/>
    <path d="M82 382 L196 452"/><path d="M918 382 L804 452"/>
    <path d="M224 1080 C400 1094 600 1094 776 1080"/>`;
  const folds = `
    <path d="M300 520 C330 700 300 900 330 1100 L290 1100 C270 900 290 700 300 520 Z"/>
    <path d="M690 560 C670 760 700 900 690 1100 L720 1100 C730 900 700 760 690 560 Z"/>
    <path d="M160 300 C200 330 220 380 230 400 L210 420 C200 380 180 340 160 300 Z"/>
    <path d="M420 700 C460 760 470 860 450 980 L430 980 C440 860 430 770 420 700 Z"/>
    <path d="M760 170 C800 200 840 280 870 350 L850 360 C820 290 790 220 760 170 Z"/>
    <path d="M250 990 C380 1010 620 1012 760 990 L762 1030 C620 1050 380 1050 248 1030 Z" opacity=".5"/>`;
  const highlights = `
    <path d="M330 520 C355 700 335 900 355 1090 L338 1090 C318 900 335 700 330 520 Z"/>
    <path d="M660 560 C645 760 668 900 662 1090 L680 1090 C688 900 668 760 660 560 Z"/>
    <path d="M470 720 C500 780 505 870 492 970 L478 970 C488 870 482 780 470 720 Z"/>
    <path d="M190 260 C215 300 225 330 236 360 L222 368 C210 335 200 300 190 260 Z"/>`;
  return frame({ uid, color, body, inner, details, folds, highlights });
}

function drawOversize(face, color, uid) {
  const front = face === "front";
  const body = front ? OVR_BODY : OVR_BODY_BACK;
  const inner = front
    ? `<path d="M390 130 C450 106 550 106 610 130 C570 192 430 192 390 130 Z" fill="{c}"/>
       <path d="M390 130 C450 106 550 106 610 130 C570 192 430 192 390 130 Z" fill="#000" opacity=".28"/>
       <path d="M386 128 C428 204 572 204 614 128" fill="none" stroke="{edge}" stroke-width="20" opacity=".35"/>
       <path d="M386 128 C428 204 572 204 614 128" fill="none" stroke="{c}" stroke-width="16"/>`
    : `<path d="M386 128 C440 160 560 160 614 128" fill="none" stroke="{c}" stroke-width="16"/>
       <path d="M386 128 C440 160 560 160 614 128" fill="none" stroke="{edge}" stroke-width="2"/>`;
  const details = `
    <path d="M${front ? "394 150 C432 214 568 214 606 150" : "394 146 C440 172 560 172 606 146"}"/>
    <path d="M207 190 C214 300 214 400 212 470"/>
    <path d="M793 190 C786 300 786 400 788 470"/>
    <path d="M70 536 L196 584"/><path d="M930 536 L804 584"/>
    <path d="M206 1098 C400 1112 600 1112 794 1098"/>`;
  const folds = `
    <path d="M280 600 C310 800 290 950 300 1120 L262 1120 C255 950 270 800 280 600 Z"/>
    <path d="M720 620 C700 820 724 950 716 1120 L748 1120 C752 950 730 820 720 620 Z"/>
    <path d="M440 760 C480 840 490 960 470 1110 L448 1110 C462 960 455 840 440 760 Z"/>
    <path d="M110 420 C140 470 170 520 190 590 L170 598 C150 530 125 480 110 420 Z"/>
    <path d="M890 420 C860 470 830 520 810 590 L830 598 C850 530 875 480 890 420 Z"/>
    <path d="M230 1010 C400 1030 600 1030 772 1010 L774 1060 C600 1080 400 1080 228 1060 Z" opacity=".5"/>`;
  const highlights = `
    <path d="M318 610 C342 800 325 950 334 1110 L316 1110 C308 950 322 800 318 610 Z"/>
    <path d="M684 630 C668 820 690 950 684 1110 L702 1110 C708 950 690 820 684 630 Z"/>
    <path d="M495 780 C525 860 530 960 515 1100 L500 1100 C512 960 508 860 495 780 Z"/>`;
  return frame({ uid, color, body, inner, details, folds, highlights });
}

function drawHoodie(face, color, uid, { pocket = true } = {}) {
  const front = face === "front";
  const hoodBack = `<path d="M340 238 C320 120 400 52 500 52 C600 52 680 120 660 238 C600 210 400 210 340 238 Z" fill="${color}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>`;
  const inner = front
    ? `<path d="M342 236 C326 140 400 70 500 70 C600 70 674 140 658 236 C620 270 380 270 342 236 Z" fill="{c}" stroke="{edge}" stroke-width="2"/>
       <path d="M402 228 C410 150 590 150 598 228 C570 268 430 268 402 228 Z" fill="#000" opacity=".42"/>
       <path d="M402 228 C430 262 570 262 598 228" fill="none" stroke="{c}" stroke-width="12"/>
       <path d="M462 262 L456 430" stroke="{c}" stroke-width="9" stroke-linecap="round"/>
       <path d="M538 262 L544 430" stroke="{c}" stroke-width="9" stroke-linecap="round"/>
       <path d="M462 262 L456 430 M538 262 L544 430" stroke="#000" stroke-opacity=".22" stroke-width="9" stroke-linecap="round"/>
       <rect x="449" y="426" width="14" height="30" rx="4" fill="#d9d9d9" stroke="#555"/>
       <rect x="537" y="426" width="14" height="30" rx="4" fill="#d9d9d9" stroke="#555"/>${
         pocket
           ? `<path d="M318 770 L682 770 L740 1030 L260 1030 Z" fill="{c}" stroke="{edge}" stroke-width="2"/>
       <path d="M318 770 L682 770 L740 1030 L260 1030 Z" fill="#000" opacity=".06"/>`
           : ""
       }`
    : `<path d="M342 240 C320 330 380 420 500 430 C620 420 680 330 658 240 C600 214 400 214 342 240 Z" fill="{c}" stroke="{edge}" stroke-width="2"/>
       <path d="M500 250 L500 428" stroke="{edge}" stroke-width="2" opacity=".6"/>
       <path d="M350 250 C370 360 430 418 500 428" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="18"/>`;
  const details = front
    ? `<path d="M240 226 C250 320 245 400 236 470"/><path d="M760 226 C750 320 755 400 764 470"/>
       <path d="M110 960 L212 972"/><path d="M890 960 L788 972"/>
       <path d="M232 1082 C400 1094 600 1094 768 1082"/>
       ${pocket ? `<path d="M330 782 L670 782 M282 1018 L718 1018"/>` : ""}`
    : `<path d="M240 226 C250 320 245 400 236 470"/><path d="M760 226 C750 320 755 400 764 470"/>
       <path d="M110 960 L212 972"/><path d="M890 960 L788 972"/>
       <path d="M232 1082 C400 1094 600 1094 768 1082"/>`;
  const folds = `
    <path d="M140 420 C150 600 150 800 150 1000 L120 1000 C125 800 130 600 140 420 Z"/>
    <path d="M860 420 C850 600 850 800 850 1000 L880 1000 C875 800 870 600 860 420 Z"/>
    <path d="M300 560 C320 700 300 820 310 1080 L280 1080 C278 820 290 700 300 560 Z"/>
    <path d="M700 580 C690 720 712 860 700 1080 L728 1080 C736 860 716 720 700 580 Z"/>
    <path d="M150 760 C170 790 190 800 210 800 L210 830 C185 830 165 815 150 790 Z"/>
    <path d="M850 760 C830 790 810 800 790 800 L790 830 C815 830 835 815 850 790 Z"/>
    <path d="M232 1040 C400 1056 600 1056 768 1040 L770 1100 C600 1116 400 1116 230 1100 Z" opacity=".55"/>`;
  const highlights = `
    <path d="M170 440 C178 620 178 800 176 990 L160 990 C162 800 162 620 170 440 Z"/>
    <path d="M830 440 C822 620 822 800 824 990 L840 990 C838 800 838 620 830 440 Z"/>
    <path d="M330 580 C345 720 330 840 338 1070 L322 1070 C316 840 330 720 330 580 Z"/>
    <path d="M668 600 C660 740 676 860 668 1070 L684 1070 C690 860 676 740 668 600 Z"/>`;
  return frame({ uid, color, body: HOODIE_BODY, inner, details, folds, highlights, extraUnder: front ? hoodBack : "" });
}

function drawCrewneck(face, color, uid) {
  // Buzo de frisa cuello redondo: mismo cuerpo que el buzo, sin capucha.
  const front = face === "front";
  const inner = front
    ? `<path d="M380 200 C420 168 580 168 620 200 C590 262 410 262 380 200 Z" fill="{c}"/>
       <path d="M380 200 C420 168 580 168 620 200 C590 262 410 262 380 200 Z" fill="#000" opacity=".3"/>
       <path d="M376 198 C410 276 590 276 624 198" fill="none" stroke="{edge}" stroke-width="24" opacity=".3"/>
       <path d="M376 198 C410 276 590 276 624 198" fill="none" stroke="{c}" stroke-width="20"/>`
    : `<path d="M376 198 C420 226 580 226 624 198" fill="none" stroke="{c}" stroke-width="20"/>
       <path d="M376 198 C420 226 580 226 624 198" fill="none" stroke="{edge}" stroke-width="2"/>`;
  const details = `
    <path d="M${front ? "384 214 C416 282 584 282 616 214" : "384 212 C420 236 580 236 616 212"}"/>
    <path d="M240 226 C250 320 245 400 236 470"/><path d="M760 226 C750 320 755 400 764 470"/>
    <path d="M110 960 L212 972"/><path d="M890 960 L788 972"/>
    <path d="M232 1082 C400 1094 600 1094 768 1082"/>`;
  const folds = `
    <path d="M140 420 C150 600 150 800 150 1000 L120 1000 C125 800 130 600 140 420 Z"/>
    <path d="M860 420 C850 600 850 800 850 1000 L880 1000 C875 800 870 600 860 420 Z"/>
    <path d="M300 560 C320 700 300 820 310 1080 L280 1080 C278 820 290 700 300 560 Z"/>
    <path d="M700 580 C690 720 712 860 700 1080 L728 1080 C736 860 716 720 700 580 Z"/>
    <path d="M232 1040 C400 1056 600 1056 768 1040 L770 1100 C600 1116 400 1116 230 1100 Z" opacity=".55"/>`;
  const highlights = `
    <path d="M170 440 C178 620 178 800 176 990 L160 990 C162 800 162 620 170 440 Z"/>
    <path d="M830 440 C822 620 822 800 824 990 L840 990 C838 800 838 620 830 440 Z"/>
    <path d="M330 580 C345 720 330 840 338 1070 L322 1070 C316 840 330 720 330 580 Z"/>`;
  return frame({ uid, color, body: HOODIE_BODY, inner, details, folds, highlights });
}

function drawTote(face, color, uid) {
  const handles = `
    <path d="M330 344 C330 120 450 110 452 344" fill="none" stroke="${color}" stroke-width="34"/>
    <path d="M548 344 C550 110 670 120 670 344" fill="none" stroke="${color}" stroke-width="34"/>
    <path d="M330 344 C330 120 450 110 452 344 M548 344 C550 110 670 120 670 344" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="34"/>
    <path d="M330 344 C330 120 450 110 452 344 M548 344 C550 110 670 120 670 344" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-dasharray="7 6"/>`;
  const details = `<path d="M184 372 L816 372"/><path d="M330 344 L330 420 M452 344 L452 420 M548 344 L548 420 M670 344 L670 420"/>`;
  const folds = `<path d="M240 340 C250 600 230 900 240 1130 L210 1130 C205 900 225 600 240 340 Z"/>
    <path d="M760 360 C770 620 752 900 764 1130 L790 1130 C780 900 796 620 760 360 Z"/>
    <path d="M180 1080 C400 1100 600 1100 830 1080 L834 1130 C600 1140 400 1140 166 1130 Z" opacity=".5"/>`;
  const highlights = `<path d="M270 360 C282 620 262 900 272 1120 L256 1120 C248 900 266 620 270 360 Z"/>
    <path d="M520 380 C540 560 520 700 530 860 L516 860 C508 700 524 560 520 380 Z" opacity=".6"/>`;
  return frame({ uid, color, body: TOTE_BODY, details, folds, highlights, extraUnder: handles });
}

function drawCap(face, color, uid) {
  // Vista frontal: copa de seis paneles y visera. Una sola cara estampable.
  const body = `${CAP_CROWN} ${CAP_BRIM}`;
  const inner = `
    <path d="${CAP_BRIM}" fill="#000" opacity=".22"/>
    <path d="M150 792 C320 742 680 742 850 792" fill="none" stroke="{edge}" stroke-width="3"/>
    <path d="M252 912 C400 868 600 868 748 912" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="10"/>
    <circle cx="500" cy="330" r="20" fill="{c}" stroke="{edge}" stroke-width="2"/>
    <circle cx="500" cy="330" r="20" fill="#000" opacity=".12"/>
    <circle cx="300" cy="520" r="7" fill="#000" opacity=".35"/>
    <circle cx="700" cy="520" r="7" fill="#000" opacity=".35"/>`;
  const details = `
    <path d="M500 350 C420 380 330 520 300 780"/><path d="M500 350 C580 380 670 520 700 780"/>
    <path d="M206 772 C330 742 670 742 794 772"/>
    <path d="M168 806 C330 760 670 760 832 806"/>
    <path d="M186 840 C330 800 670 800 814 840"/>`;
  const folds = `<path d="M250 600 C260 680 250 740 240 790 L214 790 C222 740 236 680 250 600 Z"/>
    <path d="M760 560 C780 650 790 720 790 790 L766 790 C766 720 758 650 760 560 Z"/>
    <path d="M160 800 C330 760 670 760 840 800 L846 830 C670 790 330 790 154 830 Z" opacity=".8"/>`;
  const highlights = `<path d="M380 380 C330 450 300 560 292 700 L312 700 C318 560 345 450 392 386 Z"/>
    <path d="M300 850 C420 820 580 820 700 850 L700 862 C580 834 420 834 300 862 Z" opacity=".6"/>`;
  return frame({ uid, color, body, inner, details, folds, highlights });
}

/* ---------------- Catálogo de tipos ---------------- */

// Medidas de estampa por talle, en cm (ancho × alto). Siguen la práctica
// habitual de DTG: el frente ocupa ~60–65 % del ancho de pecho del talle y
// crece con él, con tope en 40 × 50 cm (plancha grande). Los logos, mangas y
// etiqueta miden lo mismo en todos los talles, como se hace en taller. El
// logo del corazón va a ~10 cm del centro, del lado izquierdo de quien la usa.
//
// `at` ubica la zona sobre la foto (talle M) en unidades del escenario:
// centro horizontal `cx` y, en vertical, el borde de arriba (`top`), el de
// abajo (`bottom`) o el centro (`cy`). Así el frente arranca siempre a la
// misma distancia del cuello y el logo de abajo a la misma distancia del ruedo.
// Las mangas van sobre la vista de frente: la manga izquierda de quien la usa
// queda a la derecha de la foto.
export const GARMENTS = {
  tee: {
    id: "tee",
    name: "Remera",
    cmPerUnit: 0.09,
    draw: drawTee,
    faces: {
      front: { at: { cx: 500, top: 305 }, cm: { S: [32, 42], M: [34, 44], L: [35, 46], XL: [37, 48], XXL: [38, 49] } },
      back: { at: { cx: 500, top: 220 }, cm: { S: [32, 44], M: [34, 46], L: [35, 48], XL: [37, 50], XXL: [38, 50] } },
      chest: { view: "front", at: { cx: 500, top: 305 }, cm: [25, 9] },
      heart: { view: "front", at: { cx: 611, top: 320 }, cm: [9, 9] },
      "front-low": { view: "front", at: { cx: 500, bottom: 900 }, cm: [25, 8] },
      "sleeve-left": { view: "front", at: { cx: 808, cy: 405 }, cm: [7, 7] },
      "sleeve-right": { view: "front", at: { cx: 172, cy: 405 }, cm: [7, 7] },
      label: { view: "back", at: { cx: 500, top: 165 }, cm: [8, 6] },
    },
  },
  oversize: {
    id: "oversize",
    name: "Remera oversize",
    cmPerUnit: 0.095,
    draw: drawOversize,
    faces: {
      front: { at: { cx: 500, top: 300 }, cm: { S: [35, 45], M: [37, 47], L: [38, 49], XL: [40, 50], XXL: [40, 50] } },
      back: { at: { cx: 500, top: 235 }, cm: { S: [36, 47], M: [38, 49], L: [39, 50], XL: [40, 50], XXL: [40, 50] } },
      chest: { view: "front", at: { cx: 500, top: 300 }, cm: [25, 9] },
      heart: { view: "front", at: { cx: 605, top: 315 }, cm: [9, 9] },
      "front-low": { view: "front", at: { cx: 500, bottom: 930 }, cm: [25, 8] },
      "sleeve-left": { view: "front", at: { cx: 829, cy: 430 }, cm: [8, 8] },
      "sleeve-right": { view: "front", at: { cx: 171, cy: 430 }, cm: [8, 8] },
      label: { view: "back", at: { cx: 500, top: 178 }, cm: [8, 6] },
    },
  },
  hoodie: {
    id: "hoodie",
    name: "Buzo canguro",
    cmPerUnit: 0.09,
    draw: drawHoodie,
    // Sin logo de pecho ni abajo: la capucha y el bolsillo ocupan esas zonas.
    // El logo del corazón sí entra, debajo del escote de la capucha.
    // El frente va entre el escote de la capucha y el bolsillo.
    faces: {
      front: { at: { cx: 500, bottom: 750 }, cm: { S: [28, 24], M: [30, 25], L: [31, 26], XL: [32, 26], XXL: [33, 27] } },
      back: { at: { cx: 500, top: 450 }, cm: { S: [33, 40], M: [35, 42], L: [36, 43], XL: [37, 44], XXL: [38, 45] } },
      heart: { view: "front", at: { cx: 611, top: 485 }, cm: [9, 9] },
      "sleeve-left": { view: "front", at: { cx: 800, cy: 640 }, cm: [7, 9] },
      "sleeve-right": { view: "front", at: { cx: 200, cy: 640 }, cm: [7, 9] },
      label: { view: "back", at: { cx: 500, top: 250 }, cm: [8, 6] },
    },
  },
  crewneck: {
    id: "crewneck",
    name: "Buzo cuello redondo",
    cmPerUnit: 0.09,
    draw: drawCrewneck,
    faces: {
      front: { at: { cx: 500, top: 360 }, cm: { S: [31, 38], M: [33, 40], L: [34, 42], XL: [35, 43], XXL: [36, 44] } },
      back: { at: { cx: 500, top: 300 }, cm: { S: [33, 40], M: [35, 42], L: [36, 43], XL: [37, 44], XXL: [38, 45] } },
      chest: { view: "front", at: { cx: 500, top: 360 }, cm: [25, 9] },
      heart: { view: "front", at: { cx: 611, top: 375 }, cm: [9, 9] },
      "front-low": { view: "front", at: { cx: 500, bottom: 950 }, cm: [25, 8] },
      "sleeve-left": { view: "front", at: { cx: 805, cy: 560 }, cm: [7, 9] },
      "sleeve-right": { view: "front", at: { cx: 195, cy: 560 }, cm: [7, 9] },
      label: { view: "back", at: { cx: 500, top: 240 }, cm: [8, 6] },
    },
  },
  cap: {
    id: "cap",
    name: "Gorra",
    cmPerUnit: 0.04,
    draw: drawCap,
    faces: {
      front: { printArea: { x: 360, y: 500, w: 280, h: 190 } },
    },
  },
  tote: {
    id: "tote",
    name: "Tote bag",
    cmPerUnit: 0.065,
    draw: drawTote,
    faces: {
      front: { printArea: { x: 280, y: 470, w: 440, h: 540 } },
      back: { printArea: { x: 280, y: 470, w: 440, h: 540 } },
    },
  },
};

/* ---------------- Fotos de prenda ---------------- */

/**
 * Prendas con foto: `${tipo}-${color}`. Cada foto está normalizada al
 * escenario lógico 1000 × 1200 (tools/preparar-fotos.py), así el área
 * imprimible cae sobre el pecho sin cambiar coordenadas ni medidas.
 * Junto a cada foto hay dos mapas de luz sacados de la misma foto
 * (-sombra.png para multiplicar, -brillo.png para trama) que se aplican
 * sólo sobre el área imprimible: la estampa toma los pliegues reales.
 * Las fotos son de frente; la espalda sigue siendo la ilustración.
 */
const PHOTO_DIR = "assets/img/prendas/";
const PHOTOS = new Set([
  "tee-blanco", "tee-negro", "tee-arena", "tee-grafito",
  "tee-rosa-palo", "tee-nude", "tee-marron-claro", "tee-gris",
  "oversize-blanco", "oversize-negro", "oversize-arena", "oversize-grafito",
  "oversize-rosa-palo", "oversize-nude", "oversize-marron-claro", "oversize-gris",
  "crewneck-marino", "crewneck-blanco", "crewneck-bordo", "crewneck-marron",
  "crewneck-rosa", "crewneck-negro", "crewneck-rojo",
  "hoodie-blanco", "hoodie-negro",
  "tote-crudo", "tote-negro",
  "cap-naranja", "cap-verde", "cap-azul", "cap-celeste",
]);

/** URLs de la foto y sus mapas de luz, o null si esa prenda/color/cara no tiene foto. */
export function garmentPhoto(type, face, colorId) {
  const key = `${type}-${colorId}`;
  if (viewOf(type, face) !== "front" || !colorId || !PHOTOS.has(key)) return null;
  return { base: `${PHOTO_DIR}${key}.jpg`, shade: `${PHOTO_DIR}${key}-sombra.png`, light: `${PHOTO_DIR}${key}-brillo.png` };
}

function photoLayers(photo) {
  const img = (href) => `<image href="${href}" x="0" y="0" width="${STAGE.width}" height="${STAGE.height}" preserveAspectRatio="none"/>`;
  return { defs: "", base: img(photo.base), shade: img(photo.shade), light: img(photo.light) };
}

export function faceLabel(face) {
  return FACE_LABELS[face] || face;
}

export function faceHint(face) {
  return FACE_HINTS[face] || "";
}

/** Vista de la prenda sobre la que se dibuja la zona (frente o espalda). */
export function viewOf(type, face) {
  return GARMENTS[type]?.faces[face]?.view || face;
}

/** Zona principal (frente o espalda) o zona chica (logo, mangas, etiqueta). */
export const isMainFace = (type, face) => !GARMENTS[type]?.faces[face]?.view;

/**
 * Ventana del escenario que muestra el editor para una zona: la prenda
 * entera para frente y espalda, un acercamiento para las zonas chicas.
 * Mantiene la proporción del escenario (1000 × 1200).
 */
export function editorWindow(type, face, sizeId = REF_SIZE) {
  const area = getPrintSpec(type, face, sizeId).area;
  if (isMainFace(type, face)) return { x: 0, y: 0, w: STAGE.width, h: STAGE.height };
  const w = Math.min(STAGE.width, Math.max(area.w * 2.6, 380));
  const h = w * (STAGE.height / STAGE.width);
  const clamp = (v, max) => Math.max(0, Math.min(v, max));
  return {
    x: Math.round(clamp(area.x + area.w / 2 - w / 2, STAGE.width - w)),
    y: Math.round(clamp(area.y + area.h / 2 - h / 2, STAGE.height - h)),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function getGarment(type) {
  const g = GARMENTS[type];
  if (!g) throw new Error(`Tipo de prenda desconocido: ${type}`);
  return g;
}

/** Talle de referencia: el de las fotos y el que se usa si no hay talle elegido. */
export const REF_SIZE = "M";

/** "2XL" → "XXL", "m" → "M"; "Único" queda igual. */
const sizeKey = (sizeId) => String(sizeId || REF_SIZE).toUpperCase().replace(/^2XL$/, "XXL");

/**
 * Centímetros por unidad del escenario para un talle. La foto es la del talle
 * M; un talle más grande es la misma prenda en otra escala, según su ancho y
 * su largo en la tabla de talles. Sin tabla (gorra, tote) no cambia.
 */
export function cmPerUnitFor(type, sizeId = REF_SIZE) {
  const g = getGarment(type);
  const rows = SIZE_CHARTS[type]?.rows || [];
  const ref = rows.find((r) => r.size === REF_SIZE);
  const row = rows.find((r) => r.size === sizeKey(sizeId));
  if (!ref || !row) return g.cmPerUnit;
  return g.cmPerUnit * Math.sqrt((row.ancho / ref.ancho) * (row.largo / ref.largo));
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL"];

/** Medida de estampa (cm) de una zona en un talle; si ese talle no tiene medida, la del talle más cercano. */
function faceCm(def, sizeId) {
  if (Array.isArray(def.cm)) return def.cm;
  const key = sizeKey(sizeId);
  if (def.cm[key]) return def.cm[key];
  const i = SIZE_ORDER.indexOf(key);
  if (i < 0) return def.cm[REF_SIZE];
  const near = Object.keys(def.cm).sort((x, y) => Math.abs(SIZE_ORDER.indexOf(x) - i) - Math.abs(SIZE_ORDER.indexOf(y) - i));
  return def.cm[near[0]];
}

/**
 * Área imprimible de una zona en un talle: en unidades del escenario (para
 * el editor) y en centímetros (para el archivo de impresión y los textos).
 */
export function getPrintSpec(type, face, sizeId = REF_SIZE) {
  const g = getGarment(type);
  const def = g.faces[face];
  if (!def) throw new Error(`La prenda ${type} no tiene cara ${face}`);
  const round = (n) => Math.round(n * 10) / 10;
  if (def.printArea) {
    const area = { ...def.printArea };
    return { area, cmPerUnit: g.cmPerUnit, widthCm: round(area.w * g.cmPerUnit), heightCm: round(area.h * g.cmPerUnit) };
  }
  const cmPerUnit = cmPerUnitFor(type, sizeId);
  const [widthCm, heightCm] = faceCm(def, sizeId);
  const w = widthCm / cmPerUnit;
  const h = heightCm / cmPerUnit;
  const { cx, top, bottom, cy } = def.at;
  const y = top ?? (bottom != null ? bottom - h : cy - h / 2);
  const r2 = (n) => Math.round(n * 100) / 100;
  return { area: { x: r2(cx - w / 2), y: r2(y), w: r2(w), h: r2(h) }, cmPerUnit, widthCm, heightCm };
}

/**
 * SVG (string) de una prenda en un color, sin guías.
 * layer: "full" (tela + arte + sombras y brillos encima), "base" (solo tela),
 * "shade" o "light" (solo esa capa de luz, para superponer en otro lado).
 * colorId: si la prenda tiene foto en ese color, se usa la foto.
 */
export function garmentSvg(type, face, colorHex, { art = "", className = "", title = "", layer = "full", colorId = null, viewBox = null } = {}) {
  const g = getGarment(type);
  const photo = garmentPhoto(type, face, colorId);
  const L = photo ? photoLayers(photo) : g.draw(viewOf(type, face), colorHex, nextUid());
  const artLayer = art ? artInArea(art, getPrintSpec(type, face).area) : "";
  const label = title || `${g.name} — ${faceLabel(face)}`;
  const fit = photo ? ` data-photo preserveAspectRatio="xMidYMid slice"` : "";
  const vb = viewBox ? `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}` : `0 0 ${STAGE.width} ${STAGE.height}`;
  const open = `<svg class="${className}" viewBox="${vb}"${fit} xmlns="http://www.w3.org/2000/svg"`;
  if (layer === "shade" || layer === "light") return `${open} aria-hidden="true">${L.defs}${L[layer]}</svg>`;
  const body =
    layer === "base"
      ? L.base
      : `${L.base}${artLayer}<g style="mix-blend-mode:multiply">${L.shade}</g><g style="mix-blend-mode:screen">${L.light}</g>`;
  return `${open} role="img" aria-label="${label}">${L.defs}${body}</svg>`;
}

/** Ubica un arte (viewBox 0 0 100 100) dentro del área imprimible, centrado arriba. */
function artInArea(art, area) {
  const size = Math.min(area.w, area.h) * 0.92;
  const x = area.x + (area.w - size) / 2;
  const y = area.y + Math.min(area.h * 0.06, 30);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100">${art}</svg>`;
}
