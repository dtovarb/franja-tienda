/**
 * Páginas con datos del servidor para buscadores y vistas previas de links:
 * la ficha de cada diseño (/diseno/:nombre) y el mapa del sitio.
 *
 * La ficha es producto.html con el título, la descripción, la foto y los
 * datos de producto del diseño ya puestos en el <head>; el resto lo dibuja
 * product.js como siempre.
 */
import { readFile } from "node:fs/promises";
import { loadColors, loadProducts, loadStoreDesigns, loadZoneSettings } from "./catalog.js";
import { priceWith } from "../../assets/js/core/pricing.js";
import { designSlug } from "../../assets/js/core/format.js";

const TEMPLATE_URL = new URL("../../producto.html", import.meta.url);
let template = null;

/** Páginas fijas del mapa del sitio (las privadas y de pedidos quedan afuera). */
const STATIC_PAGES = ["", "disenos.html", "catalogo.html", "quienes-somos.html", "preguntas.html", "terminos.html", "privacidad.html", "arrepentimiento.html"];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n) => `$ ${Number(n).toLocaleString("es-AR")}`;
const isRaster = (url) => /\.(jpe?g|png|webp)(\?|$)/i.test(url || "");

/** Busca un diseño publicado por su nombre en la dirección (o por su id, para links viejos). */
export function findDesign(designs, slug) {
  const s = String(slug || "").toLowerCase();
  return designs.find((d) => d.id === slug) || designs.find((d) => designSlug(d) === s) || null;
}

/** Prenda que se muestra: la pedida si le va el diseño; si no, la remera, o la primera que le vaya. */
export function pickProduct(products, design, wanted) {
  const fits = products.filter((p) => p.active !== false && (!design.productIds?.length || design.productIds.includes(p.id)));
  return fits.find((p) => p.id === wanted) || fits.find((p) => p.type === "tee") || fits[0] || null;
}

const unitPrice = (product, design, zonePrices) => {
  const face = product.faces?.includes("front") ? "front" : product.faces?.[0];
  return priceWith(product, { sizeId: product.sizes?.[0]?.id, qty: 1 }, { printedFaces: face ? [face] : [], storeDesigns: [design], zonePrices }).unit;
};

export async function designPage(db, { slug, productId, origin }) {
  const designs = await loadStoreDesigns(db, { publishedOnly: true });
  const design = findDesign(designs, slug);
  if (!design) return null;
  const [products, { zonePrices }] = [await loadProducts(db), await loadZoneSettings(db)];
  const product = pickProduct(products, design, productId);
  if (!product) return null;

  const fits = products.filter((p) => p.active !== false && (!design.productIds?.length || design.productIds.includes(p.id)));
  const prices = fits.map((p) => unitPrice(p, design, zonePrices));
  const price = unitPrice(product, design, zonePrices);
  const colors = await loadColors(db);

  const path = `/diseno/${designSlug(design)}`;
  const url = `${origin}${path}`;
  const title = `${design.name} · ${product.name} · nevrado`;
  const desc = `${design.description ? `${design.description.trim().replace(/\.?$/, ".")} ` : ""}${product.name} desde ${money(price)}. Diseño propio estampado en nuestro taller de Córdoba. Envíos a todo el país.`;
  const photo = design.modelPhoto?.url || (isRaster(design.source?.url) ? design.source.url : null);
  const image = photo ? new URL(photo, origin).href : `${origin}/assets/img/og-nevrado.png`;
  const anyStock = product.sizes?.some((s) => s.stock !== "out");

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${design.name} · ${product.name}`,
    description: desc,
    image: [image],
    url,
    brand: { "@type": "Brand", name: "nevrado" },
    category: product.name,
    color: (product.colors || []).map((c) => colors[c]?.name).filter(Boolean).join(", ") || undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "ARS",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: prices.length,
      availability: anyStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  template ||= await readFile(TEMPLATE_URL, "utf8");
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url)}`)
    .replace(/<meta property="og:type" content="website">/, '<meta property="og:type" content="product">')
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${esc(image)}`)
    // El tamaño fijo es el de la imagen general; con foto propia no se sabe.
    .replace(photo ? /\s*<meta property="og:image:(width|height)" content="\d+">/g : /$^/, "")
    .replace(/href="#main"/, `href="${esc(path)}#main"`);
  // La página vive en /diseno/…: los enlaces y archivos relativos se resuelven desde la raíz.
  const head = `<base href="/">
  <link rel="canonical" href="${esc(url)}">
  <meta property="product:price:amount" content="${price}">
  <meta property="product:price:currency" content="ARS">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
  <script>(function(){var u=new URL(location.href);if(u.searchParams.get("diseno"))return;u.searchParams.set("id",${JSON.stringify(product.id)});u.searchParams.set("diseno",${JSON.stringify(design.id)});history.replaceState(null,"",u)})()</script>`;
  html = html.replace(/<meta charset="utf-8">/, (m) => `${m}\n  ${head}`);
  return html;
}

export async function sitemap(db, { origin }) {
  const designs = await loadStoreDesigns(db, { publishedOnly: true }).catch(() => []);
  const day = (d) => (d ? String(d).slice(0, 10) : null);
  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: `${origin}/${p}` })),
    ...designs.map((d) => ({ loc: `${origin}/diseno/${designSlug(d)}`, lastmod: day(d.updatedAt) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
