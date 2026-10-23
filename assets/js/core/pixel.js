/**
 * Píxel de Meta: cuenta visitas, prendas vistas, agregados al carrito,
 * inicios de compra y compras, para medir los anuncios de Facebook e Instagram.
 * Solo corre en la tienda real (www.nevrado.com): ni en la demo, ni en las
 * vistas previas de Vercel, ni en el panel.
 */
const PIXEL_ID = "28696474826676453";
const LIVE = /(^|\.)nevrado\.com$/.test(location.hostname);

let ready = false;

export function loadPixel(page) {
  if (ready || !LIVE || page === "admin") return;
  ready = true;
  loadVercelAnalytics();
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,"script","https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

/** Evento estándar de Meta (ViewContent, AddToCart, InitiateCheckout, Purchase). */
export function track(event, params = {}, options) {
  if (!ready || typeof window.fbq !== "function") return;
  window.fbq("track", event, { currency: "ARS", ...params }, options);
}

/** Igual que track, pero una sola vez por clave (al recargar la página no se repite). */
export function trackOnce(key, event, params, options) {
  if (!ready) return;
  const store = "nevrado.pixel.v1";
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(store) || "[]"); } catch {}
  if (seen.includes(key)) return;
  track(event, params, options);
  try { localStorage.setItem(store, JSON.stringify([...seen, key].slice(-50))); } catch {}
}

/**
 * Vercel Analytics: visitas por página y de dónde llegan, en el panel de
 * Vercel (pestaña Analytics). No usa cookies. Hay que activarlo una vez en
 * Vercel; mientras no esté activo, el script no carga y no pasa nada.
 */
function loadVercelAnalytics() {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/insights/script.js";
  document.head.appendChild(s);
}
