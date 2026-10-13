/**
 * Tipos de prenda: mockups vectoriales originales + áreas imprimibles.
 *
 * Todas las prendas usan un espacio lógico fijo de 1000 × 1200 unidades.
 * El editor escala ese espacio al tamaño de pantalla (zoom), por lo que el
 * área imprimible queda definida en coordenadas proporcionales al producto
 * y nunca en píxeles de pantalla.
 *
 * `cmPerUnit` relaciona el espacio lógico con medidas físicas (talle de
 * referencia M). El área de impresión física se deriva de ahí, de modo que
 * proporciones en pantalla y archivo de impresión coinciden siempre.
 */

export const STAGE = { width: 1000, height: 1200 };

const FACE_LABELS = { front: "Frente", back: "Espalda" };

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

function frame({ uid, color, body, inner = "", details = "", folds = "", extraUnder = "" }) {
  const dark = luminance(color) < 0.18;
  const seam = dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.2)";
  const edge = dark ? "rgba(0,0,0,.6)" : "rgba(0,0,0,.28)";
  const shade = dark ? 0.45 : 0.16;
  const light = dark ? 0.07 : 0.22;
  return `
  <defs>
    <clipPath id="clip-${uid}"><path d="${body}"/></clipPath>
    <linearGradient id="side-${uid}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="${shade}"/>
      <stop offset=".2" stop-color="#000" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="${light * 0.5}"/>
      <stop offset=".8" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="${shade}"/>
    </linearGradient>
    <linearGradient id="top-${uid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${light}"/>
      <stop offset=".35" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="${shade * 0.6}"/>
    </linearGradient>
    <filter id="drop-${uid}" x="-10%" y="-10%" width="120%" height="125%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
  </defs>
  <path d="${body}" transform="translate(0 16)" fill="#000" opacity=".16" filter="url(#drop-${uid})"/>
  ${extraUnder}
  <path d="${body}" fill="${color}" stroke="${edge}" stroke-width="2"/>
  ${inner.replaceAll("{c}", color).replaceAll("{edge}", edge)}
  <g clip-path="url(#clip-${uid})" style="pointer-events:none">
    <rect width="1000" height="1200" fill="url(#side-${uid})"/>
    <rect width="1000" height="1200" fill="url(#top-${uid})"/>
    <g fill="#000" opacity="${dark ? 0.3 : 0.07}">${folds}</g>
  </g>
  <g fill="none" stroke="${seam}" stroke-width="2.5" stroke-dasharray="7 6" style="pointer-events:none">${details}</g>`;
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
    <path d="M160 300 C200 330 220 380 230 400 L210 420 C200 380 180 340 160 300 Z"/>`;
  return frame({ uid, color, body, inner, details, folds });
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
    <path d="M720 620 C700 820 724 950 716 1120 L748 1120 C752 950 730 820 720 620 Z"/>`;
  return frame({ uid, color, body, inner, details, folds });
}

function drawHoodie(face, color, uid) {
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
       <rect x="537" y="426" width="14" height="30" rx="4" fill="#d9d9d9" stroke="#555"/>
       <path d="M318 770 L682 770 L740 1030 L260 1030 Z" fill="{c}" stroke="{edge}" stroke-width="2"/>
       <path d="M318 770 L682 770 L740 1030 L260 1030 Z" fill="#000" opacity=".06"/>`
    : `<path d="M342 240 C320 330 380 420 500 430 C620 420 680 330 658 240 C600 214 400 214 342 240 Z" fill="{c}" stroke="{edge}" stroke-width="2"/>
       <path d="M500 250 L500 428" stroke="{edge}" stroke-width="2" opacity=".6"/>
       <path d="M350 250 C370 360 430 418 500 428" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="18"/>`;
  const details = front
    ? `<path d="M240 226 C250 320 245 400 236 470"/><path d="M760 226 C750 320 755 400 764 470"/>
       <path d="M110 960 L212 972"/><path d="M890 960 L788 972"/>
       <path d="M232 1082 C400 1094 600 1094 768 1082"/>
       <path d="M330 782 L670 782 M282 1018 L718 1018"/>`
    : `<path d="M240 226 C250 320 245 400 236 470"/><path d="M760 226 C750 320 755 400 764 470"/>
       <path d="M110 960 L212 972"/><path d="M890 960 L788 972"/>
       <path d="M232 1082 C400 1094 600 1094 768 1082"/>`;
  const folds = `
    <path d="M140 420 C150 600 150 800 150 1000 L120 1000 C125 800 130 600 140 420 Z"/>
    <path d="M860 420 C850 600 850 800 850 1000 L880 1000 C875 800 870 600 860 420 Z"/>
    <path d="M300 560 C320 700 300 820 310 1080 L280 1080 C278 820 290 700 300 560 Z"/>`;
  return frame({ uid, color, body: HOODIE_BODY, inner, details, folds, extraUnder: front ? hoodBack : "" });
}

function drawTote(face, color, uid) {
  const handles = `
    <path d="M330 344 C330 120 450 110 452 344" fill="none" stroke="${color}" stroke-width="34"/>
    <path d="M548 344 C550 110 670 120 670 344" fill="none" stroke="${color}" stroke-width="34"/>
    <path d="M330 344 C330 120 450 110 452 344 M548 344 C550 110 670 120 670 344" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="34"/>
    <path d="M330 344 C330 120 450 110 452 344 M548 344 C550 110 670 120 670 344" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-dasharray="7 6"/>`;
  const details = `<path d="M184 372 L816 372"/><path d="M330 344 L330 420 M452 344 L452 420 M548 344 L548 420 M670 344 L670 420"/>`;
  const folds = `<path d="M240 340 C250 600 230 900 240 1130 L210 1130 C205 900 225 600 240 340 Z"/>`;
  return frame({ uid, color, body: TOTE_BODY, details, folds, extraUnder: handles });
}

/* ---------------- Catálogo de tipos ---------------- */

export const GARMENTS = {
  tee: {
    id: "tee",
    name: "Remera",
    cmPerUnit: 0.09,
    draw: drawTee,
    faces: {
      front: { printArea: { x: 332, y: 250, w: 336, h: 448 } },
      back: { printArea: { x: 332, y: 210, w: 336, h: 480 } },
    },
  },
  oversize: {
    id: "oversize",
    name: "Remera oversize",
    cmPerUnit: 0.095,
    draw: drawOversize,
    faces: {
      front: { printArea: { x: 320, y: 270, w: 360, h: 470 } },
      back: { printArea: { x: 312, y: 230, w: 376, h: 520 } },
    },
  },
  hoodie: {
    id: "hoodie",
    name: "Buzo canguro",
    cmPerUnit: 0.09,
    draw: drawHoodie,
    faces: {
      front: { printArea: { x: 350, y: 470, w: 300, h: 280 } },
      back: { printArea: { x: 320, y: 450, w: 360, h: 470 } },
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

export function faceLabel(face) {
  return FACE_LABELS[face] || face;
}

export function getGarment(type) {
  const g = GARMENTS[type];
  if (!g) throw new Error(`Tipo de prenda desconocido: ${type}`);
  return g;
}

/** Área imprimible lógica + medidas físicas derivadas (cm). */
export function getPrintSpec(type, face) {
  const g = getGarment(type);
  const area = g.faces[face]?.printArea;
  if (!area) throw new Error(`La prenda ${type} no tiene cara ${face}`);
  const round = (n) => Math.round(n * 10) / 10;
  return {
    area: { ...area },
    cmPerUnit: g.cmPerUnit,
    widthCm: round(area.w * g.cmPerUnit),
    heightCm: round(area.h * g.cmPerUnit),
  };
}

/** Devuelve el SVG (string) de una prenda en un color, sin guías. */
export function garmentSvg(type, face, colorHex, { art = "", className = "", title = "" } = {}) {
  const g = getGarment(type);
  const uid = nextUid();
  const artLayer = art ? artInArea(art, g.faces[face].printArea) : "";
  const label = title || `${g.name} — ${faceLabel(face)}`;
  return `<svg class="${className}" viewBox="0 0 ${STAGE.width} ${STAGE.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${g.draw(face, colorHex, uid)}${artLayer}</svg>`;
}

/** Ubica un arte (viewBox 0 0 100 100) dentro del área imprimible, centrado arriba. */
function artInArea(art, area) {
  const size = Math.min(area.w, area.h) * 0.92;
  const x = area.x + (area.w - size) / 2;
  const y = area.y + Math.min(area.h * 0.06, 30);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100">${art}</svg>`;
}
