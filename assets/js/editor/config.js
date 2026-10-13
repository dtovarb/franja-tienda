/** Configuración del editor. Valores pensados para ajustarse con el taller. */

/** Tipografías de estampa (servidas localmente). `bold`: tiene peso 700 real. */
export const FONTS = [
  { family: "Archivo Black", bold: false },
  { family: "Anton", bold: false },
  { family: "Bebas Neue", bold: false },
  { family: "Archivo", bold: true },
  { family: "Space Grotesk", bold: true },
  { family: "Space Mono", bold: true },
  { family: "Permanent Marker", bold: false },
];

/** Colores de tinta sugeridos (no son colores de prenda). */
export const INKS = [
  { name: "Negro", hex: "#121212" },
  { name: "Blanco", hex: "#ffffff" },
  { name: "Terracota", hex: "#a0533a" },
  { name: "Durazno", hex: "#f2bc98" },
  { name: "Rosa polvo", hex: "#d9a3bc" },
  { name: "Ciruela", hex: "#7d3a5e" },
  { name: "Amarillo", hex: "#f2c200" },
  { name: "Azul", hex: "#1d4ed8" },
];

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxSide: 12000, // px: más grande no se puede procesar con seguridad en el navegador
  maxPixels: 80_000_000,
  minSide: 50,
  accept: {
    "image/png": { ext: ["png"], label: "PNG" },
    "image/jpeg": { ext: ["jpg", "jpeg"], label: "JPG" },
    "image/svg+xml": { ext: ["svg"], label: "SVG" },
  },
};

/** Propiedades propias que se guardan en el JSON de Fabric. */
export const CUSTOM_PROPS = ["assetId", "assetName", "srcWidth", "srcHeight", "isVector", "uid", "kind", "storeDesignId"];

export const HISTORY_LIMIT = 60;

/** Opciones de exportación de impresión. */
export const EXPORT_DPI_OPTIONS = [150, 200, 300];
export const DEFAULT_DPI = 300;
