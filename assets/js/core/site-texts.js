/**
 * Textos del sitio que la dueña cambia desde el panel (pestaña «Sitio»):
 * títulos, párrafos y botones del inicio, de «Quiénes somos» y de las
 * páginas principales, más la marquesina del inicio.
 *
 * Cada texto tiene una clave. En el HTML va en el elemento como
 * data-text="clave" (con el texto de siempre adentro, para buscadores y por
 * si no carga el JS); los que arma el JS lo piden con siteText(clave).
 * Con servidor, lo que se cambió se guarda en site_settings (claves
 * 'site_texts' y 'marquee'); en la demostración, en este navegador.
 * Solo se guarda lo que es distinto del texto de siempre: borrar un campo
 * vuelve al original.
 *
 * Este archivo no depende del navegador: lo usan el sitio, el panel y el
 * servidor (api/_lib/catalog.js), para validar con las mismas reglas.
 */

/** Páginas, en el orden en que aparecen en el panel. */
export const TEXT_PAGES = {
  inicio: "Inicio",
  nosotros: "Quiénes somos",
  prendas: "Prendas",
  disenos: "Diseños",
  preguntas: "Preguntas frecuentes",
  general: "Pie de página",
};

/**
 * Tipos de texto:
 * - line: una línea (títulos chicos, botones).
 * - multi: puede tener saltos de línea (títulos grandes).
 * - paras: párrafos; una línea en blanco separa uno de otro.
 */
export const TEXT_LIMITS = { line: 160, multi: 300, paras: 2400 };

const T = (key, page, group, label, def, kind = "line") => ({ key, page, group, label, def, kind });

export const SITE_TEXTS = [
  // ---------------- Inicio ----------------
  T("home.hero.eyebrow", "inicio", "Portada", "Línea chica de arriba", "Taller propio en Córdoba · Estampado a pedido"),
  T("home.hero.title", "inicio", "Portada", "Título (el punto de color va solo al final)", "Diseños que se usan", "multi"),
  T("home.hero.lead", "inicio", "Portada", "Texto", "Elegí un diseño de la casa o subí el tuyo. Lo estampamos en nuestro taller y te llega en 5 a 7 días hábiles, con el envío incluido.", "paras"),
  T("home.hero.cta1", "inicio", "Portada", "Botón principal", "Ver diseños"),
  T("home.hero.cta2", "inicio", "Portada", "Botón secundario", "Diseñar la mía"),
  T("home.hero.fact1", "inicio", "Portada", "Dato 1", "Remeras, buzos, gorras y totes"),
  T("home.hero.fact2", "inicio", "Portada", "Dato 2", "Envíos a todo el país"),
  T("home.hero.fact3", "inicio", "Portada", "Dato 3", "Pagás con Mercado Pago"),
  T("home.hero.sticker", "inicio", "Portada", "Sticker redondo sobre la foto", "hecho\na pedido", "multi"),
  T("home.hero.kicker", "inicio", "Portada", "Etiqueta sobre el nombre del diseño", "Diseño de la casa"),
  T("home.hero.buy", "inicio", "Portada", "Botón de la tarjeta del diseño", "Lo quiero"),
  T("home.cats.title", "inicio", "Elegí tu prenda", "Título", "Elegí tu prenda"),
  T("home.feat.eyebrow", "inicio", "Prendas base", "Línea chica", "Prendas base"),
  T("home.feat.title", "inicio", "Prendas base", "Título", "Elegí el lienzo"),
  T("home.feat.lead", "inicio", "Prendas base", "Texto", "Todas se pueden estampar adelante y atrás.", "paras"),
  T("home.feat.more", "inicio", "Prendas base", "Botón", "Ver todo el catálogo"),
  T("home.picks.title", "inicio", "Diseños de la casa", "Título", "Diseños de la casa"),
  T("home.picks.lead", "inicio", "Diseños de la casa", "Texto", "Elegí uno y la prenda donde lo querés. Lo podés pedir así o cambiarlo en el editor.", "paras"),
  T("home.picks.more", "inicio", "Diseños de la casa", "Botón", "Ver todos"),
  T("home.how.eyebrow", "inicio", "Cómo funciona", "Línea chica", "Personalización"),
  T("home.how.title", "inicio", "Cómo funciona", "Título", "Cómo funciona"),
  T("home.how.lead", "inicio", "Cómo funciona", "Texto", "Cuatro pasos, sin crear cuenta. Tu diseño queda guardado en este navegador hasta que hagas el pedido.", "paras"),
  T("home.how.s1.title", "inicio", "Cómo funciona", "Paso 1: título", "Elegí la prenda"),
  T("home.how.s1.text", "inicio", "Cómo funciona", "Paso 1: texto", "Tipo, color, talle y cantidad. El precio se actualiza a medida que elegís.", "paras"),
  T("home.how.s2.title", "inicio", "Cómo funciona", "Paso 2: título", "Diseñala"),
  T("home.how.s2.text", "inicio", "Cómo funciona", "Paso 2: texto", "Subí imágenes JPG, PNG o SVG, sumá textos y acomodá todo dentro del área de impresión, en frente y espalda.", "paras"),
  T("home.how.s3.title", "inicio", "Cómo funciona", "Paso 3: título", "Revisá los archivos"),
  T("home.how.s3.text", "inicio", "Cómo funciona", "Paso 3: texto", "Vista previa, diseño editable y archivo de impresión sin fondo. Te avisamos si una imagen tiene poca resolución.", "paras"),
  T("home.how.s4.title", "inicio", "Cómo funciona", "Paso 4: título", "La producimos"),
  T("home.how.s4.text", "inicio", "Cómo funciona", "Paso 4: texto", "Pagás con Mercado Pago, la estampamos en el taller y te llega en 5 a 7 días hábiles, con el envío incluido.", "paras"),
  T("home.look.eyebrow", "inicio", "Lookbook", "Línea chica", "Lookbook"),
  T("home.look.title", "inicio", "Lookbook", "Título", "Ropa para compartir"),
  T("home.look.tag", "inicio", "Lookbook", "Etiqueta de la frase", "Manifiesto"),
  T("home.look.quote", "inicio", "Lookbook", "Frase", "Una prenda con tu firma vale más que cualquier logo prestado.", "multi"),
  T("home.files.eyebrow", "inicio", "Tu archivo, intacto", "Línea chica", "Archivos e impresión"),
  T("home.files.title", "inicio", "Tu archivo, intacto", "Título", "Tu archivo, intacto"),
  T("home.files.lead", "inicio", "Tu archivo, intacto", "Texto", "Guardamos la imagen que subiste tal como llegó. Lo que preparamos para imprimir es otro archivo, separado, que se genera a partir de tu diseño.", "paras"),
  T("home.files.f1.title", "inicio", "Tu archivo, intacto", "Archivo 1: nombre", "Archivo original"),
  T("home.files.f1.text", "inicio", "Tu archivo, intacto", "Archivo 1: texto", "La imagen que subiste, sin comprimir ni modificar.", "paras"),
  T("home.files.f2.title", "inicio", "Tu archivo, intacto", "Archivo 2: nombre", "Diseño editable"),
  T("home.files.f2.text", "inicio", "Tu archivo, intacto", "Archivo 2: texto", "Textos, posiciones, escalas y rotaciones, para volver a editar o reconstruir el diseño.", "paras"),
  T("home.files.f3.title", "inicio", "Tu archivo, intacto", "Archivo 3: nombre", "Vista previa"),
  T("home.files.f3.text", "inicio", "Tu archivo, intacto", "Archivo 3: texto", "Cómo queda la prenda, para que la revises antes de pedirla.", "paras"),
  T("home.files.f4.title", "inicio", "Tu archivo, intacto", "Archivo 4: nombre", "Archivo de impresión"),
  T("home.files.f4.text", "inicio", "Tu archivo, intacto", "Archivo 4: texto", "Solo el área estampada, fondo transparente, a la medida física y resolución de producción.", "paras"),
  T("home.shop.eyebrow", "inicio", "Taller", "Línea chica", "Taller"),
  T("home.shop.title", "inicio", "Taller", "Título", "Imprimimos nosotros"),
  T("home.shop.lead", "inicio", "Taller", "Texto destacado", "No tercerizamos la impresión. Cada prenda se estampa y se revisa en el taller, por eso podemos mirar tu archivo antes de producirlo.", "paras"),
  T("home.shop.text", "inicio", "Taller", "Texto", "Estamos en Córdoba y enviamos a todo el país por Andreani y Correo Argentino.", "paras"),
  T("home.cta.line1", "inicio", "Cierre", "Título, primera línea", "Tu idea,"),
  T("home.cta.line2", "inicio", "Cierre", "Título, segunda línea (en color)", "nuestra prenda."),
  T("home.cta.button", "inicio", "Cierre", "Botón", "Diseñar ahora"),

  // ---------------- Quiénes somos ----------------
  T("about.eyebrow", "nosotros", "Arriba de todo", "Línea chica", "Quiénes somos"),
  T("about.title", "nosotros", "Arriba de todo", "Título", "Un taller chico\ncon ideas grandes", "multi"),
  T("about.lead", "nosotros", "Arriba de todo", "Texto", "nevrado es una marca de ropa personalizada de Córdoba. Diseñamos, estampamos y terminamos cada prenda en nuestro propio taller.", "paras"),
  T("about.story.title", "nosotros", "Quiénes somos", "Título", "Quiénes somos"),
  T("about.story.text", "nosotros", "Quiénes somos", "Texto", "Empezamos con una idea simple: que la ropa que usás diga algo tuyo. Por eso armamos un taller propio donde estampamos remeras, buzos, gorras y totes a pedido, uno por uno.\n\nNo tercerizamos la impresión. Cada prenda pasa por nuestras manos: miramos tu archivo, la estampamos con DTG y la revisamos antes de mandarla. Si algo no va a quedar bien, te escribimos antes de producir.\n\nNos gusta pensar nevrado como un lugar más que como una tienda: prendas para compartir, para regalar y para usar todos los días.", "paras"),
  T("about.mission.title", "nosotros", "Misión", "Título", "Misión"),
  T("about.mission.text", "nosotros", "Misión", "Texto", "Que cualquiera pueda llevar puesta su idea. Hacemos fácil diseñar una prenda propia y la producimos con cuidado, a pedido y en nuestro taller, para que llegue tal como la imaginaste.", "paras"),
  T("about.vision.title", "nosotros", "Visión", "Título", "Visión"),
  T("about.vision.text", "nosotros", "Visión", "Texto", "Ser el taller de ropa personalizada de referencia en Argentina para quienes buscan prendas con identidad: hechas cerca, con buena calidad y con diseños que no se ven en cualquier vidriera.", "paras"),
  T("about.tone.eyebrow", "nosotros", "Tono de la marca", "Línea chica", "Tono de la marca"),
  T("about.tone.title", "nosotros", "Tono de la marca", "Título", "Así hablamos"),
  T("about.tone.lead", "nosotros", "Tono de la marca", "Texto", "Lo que queremos que se sienta cada vez que alguien abre un paquete de nevrado o nos escribe.", "paras"),
  T("about.tone.t1.title", "nosotros", "Tono de la marca", "Rasgo 1: nombre", "Cercano"),
  T("about.tone.t1.text", "nosotros", "Tono de la marca", "Rasgo 1: texto", "Hablamos como en el taller: de vos, claro y sin vueltas. Si algo no se puede, lo decimos.", "paras"),
  T("about.tone.t2.title", "nosotros", "Tono de la marca", "Rasgo 2: nombre", "Cuidadoso"),
  T("about.tone.t2.text", "nosotros", "Tono de la marca", "Rasgo 2: texto", "Cada prenda es de alguien. La tratamos con el mismo cuidado con el que nos gustaría que traten la nuestra.", "paras"),
  T("about.tone.t3.title", "nosotros", "Tono de la marca", "Rasgo 3: nombre", "Con identidad"),
  T("about.tone.t3.text", "nosotros", "Tono de la marca", "Rasgo 3: texto", "Colores suaves, formas redondas y diseños con personalidad. Nada genérico, nada prestado.", "paras"),
  T("about.tone.t4.title", "nosotros", "Tono de la marca", "Rasgo 4: nombre", "Cálido"),
  T("about.tone.t4.text", "nosotros", "Tono de la marca", "Rasgo 4: texto", "Un lugar cómodo para mostrarte como sos. Acá cada idea tiene lugar.", "paras"),
  T("about.cta.title", "nosotros", "Cierre", "Título", "¿Tenés una idea?"),
  T("about.cta.button", "nosotros", "Cierre", "Botón", "Diseñar la mía"),

  // ---------------- Prendas ----------------
  T("catalog.eyebrow", "prendas", "Arriba de todo", "Línea chica", "Catálogo · prendas para personalizar"),
  T("catalog.title", "prendas", "Arriba de todo", "Título", "Prendas\nbase", "multi"),
  T("catalog.lead", "prendas", "Arriba de todo", "Texto", "Elegí una prenda para personalizarla. Todas se pueden estampar adelante y atrás.", "paras"),
  T("catalog.design.eyebrow", "prendas", "Al entrar desde «Diseñar»", "Línea chica", "Paso 1 de 3 · Elegí la prenda"),
  T("catalog.design.lead", "prendas", "Al entrar desde «Diseñar»", "Texto", "Primero elegí la prenda base. Después vas a poder definir color, talle y cantidad, y entrar al editor.", "paras"),

  // ---------------- Diseños ----------------
  T("designs.eyebrow", "disenos", "Arriba de todo", "Línea chica", "Diseños de la casa"),
  T("designs.title", "disenos", "Arriba de todo", "Título", "Diseños\nlistos", "multi"),
  T("designs.lead", "disenos", "Arriba de todo", "Texto", "Elegí un diseño nuestro y la prenda donde lo querés. Entra al editor ya ubicado: lo podés pedir así o moverlo, cambiarle el tamaño y sumarle texto.", "paras"),

  // ---------------- Preguntas ----------------
  T("faq.eyebrow", "preguntas", "Arriba de todo", "Línea chica", "Ayuda"),
  T("faq.title", "preguntas", "Arriba de todo", "Título", "Preguntas\nfrecuentes", "multi"),
  T("faq.lead", "preguntas", "Arriba de todo", "Texto", "Cómo hacemos las prendas, qué archivos sirven y qué pasa después de pedir.", "paras"),

  // ---------------- Pie de página ----------------
  T("footer.blurb", "general", "Pie de página", "Texto debajo del logo", "Prendas que imprimimos y terminamos en nuestro taller de Córdoba. Vos traés la idea.", "paras"),
  T("footer.legal", "general", "Pie de página", "Línea de abajo, a la derecha", "Envíos a todo el país · Pagos con Mercado Pago"),
];

export const TEXT_BY_KEY = Object.fromEntries(SITE_TEXTS.map((t) => [t.key, t]));

/** Saltos de línea de Windows a \n, espacios de más afuera, sin líneas vacías de más. */
function clean(v, kind) {
  let s = String(v).replace(/\r\n?/g, "\n").trim();
  if (kind === "line") return s.replace(/\s+/g, " ");
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n");
  return kind === "multi" ? s.replace(/\n{2,}/g, "\n") : s.replace(/\n{3,}/g, "\n\n");
}

/**
 * Valida y limpia los textos que llegan del panel ({ clave: texto }).
 * Devuelve { value, errors }: solo las claves conocidas y distintas del
 * texto de siempre; un texto vacío vuelve al de siempre.
 */
export function normalizeSiteTexts(raw) {
  const errors = [];
  const value = {};
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  for (const [key, v] of Object.entries(src)) {
    const def = TEXT_BY_KEY[key];
    if (!def || typeof v !== "string") continue;
    const s = clean(v, def.kind);
    if (!s || s === def.def) continue;
    const max = TEXT_LIMITS[def.kind];
    if (s.length > max) errors.push(`«${TEXT_PAGES[def.page]} · ${def.group} · ${def.label}» es demasiado largo (máximo ${max} caracteres).`);
    value[key] = s.slice(0, max);
  }
  return { value, errors };
}

/* ---------------- Marquesina del inicio ---------------- */
export const MAX_MARQUEE_ITEMS = 12;
export const MAX_MARQUEE_TEXT = 40;
export const DEFAULT_MARQUEE = {
  enabled: true,
  items: ["Remeras", "Buzos", "Gorras", "Totes", "Estampado en taller propio", "Diseño frente y espalda", "Archivos a 300 DPI"],
};

export function normalizeMarquee(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { value: structuredClone(DEFAULT_MARQUEE), errors };
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((x) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ") : ""))
    .filter(Boolean);
  items.forEach((x, i) => x.length > MAX_MARQUEE_TEXT && errors.push(`La frase ${i + 1} de la marquesina es demasiado larga (máximo ${MAX_MARQUEE_TEXT} caracteres).`));
  if (items.length > MAX_MARQUEE_ITEMS) errors.push(`La marquesina tiene más de ${MAX_MARQUEE_ITEMS} frases.`);
  const enabled = raw.enabled !== false;
  if (enabled && !items.length) errors.push("Para mostrar la marquesina escribí al menos una frase.");
  return { value: { enabled, items: items.slice(0, MAX_MARQUEE_ITEMS).map((x) => x.slice(0, MAX_MARQUEE_TEXT)) }, errors };
}
