/**
 * Componentes de interfaz compartidos: íconos, header, footer, toasts y
 * diálogos de confirmación.
 */
import { SERVER, CATALOG } from "./api.js";
import { readJSON } from "./storage.js";
import { normalizeAnnouncement, safeLink } from "./announcement.js";
import { normalizeHomeImages } from "./home-images.js";
import { TEXT_BY_KEY, normalizeSiteTexts, normalizeMarquee } from "./site-texts.js";
import { listCollections, listStoreDesigns } from "./store-designs.js";
import { cartCount, onCartChange } from "./cart.js";
import { escapeHtml } from "./format.js";
import { CONTACT, whatsappUrl, instagramUrl, CONSUMER_COMPLAINTS_URL } from "../data/contact.js";

/* ---------------- Íconos (SVG sprite, trazo 2px) ---------------- */
const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5V8"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  shirt: '<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  flip: '<path d="M12 3v18"/><path d="M8 7 4 12l4 5V7z"/><path d="M16 7l4 5-4 5V7z"/>',
  center: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  package: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="m3 7 9 4 9-4M12 11v10"/>',
  chat: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.2L4 20z"/>',
};

export function icon(name, cls = "icon") {
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

function injectSprite() {
  if (document.getElementById("icon-sprite")) return;
  const symbols = Object.entries(ICONS)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
    .join("");
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg id="icon-sprite" width="0" height="0" style="position:absolute" aria-hidden="true">${symbols}</svg>`
  );
}

/* ---------------- Cintillo de anuncios ---------------- */
export const ANNOUNCEMENT_KEY = "announcement.v1";
/** Ejemplo del modo demostración (con servidor manda lo que se guardó en el panel). */
export const DEMO_ANNOUNCEMENT = {
  enabled: true,
  style: "ciruela",
  messages: [
    { text: "Envíos a todo el país", link: "preguntas.html#envios" },
    { text: "Nuevos diseños de la casa", link: "disenos.html" },
  ],
};

export function getAnnouncement() {
  if (CATALOG) return CATALOG.announcement || null;
  return normalizeAnnouncement(readJSON(ANNOUNCEMENT_KEY, DEMO_ANNOUNCEMENT)).value;
}

/* ---------------- Fotos del inicio (se cambian en el panel, «Sitio») ---------------- */
export const HOME_IMAGES_KEY = "home-images.v1";
export function getHomeImages() {
  return normalizeHomeImages(CATALOG ? CATALOG.homeImages : readJSON(HOME_IMAGES_KEY, null)).value;
}

/* ---------------- Textos del sitio y marquesina (panel, «Sitio») ---------------- */
export const SITE_TEXTS_KEY = "site-texts.v1";
export const MARQUEE_KEY = "marquee.v1";
let TEXTS;
export function getSiteTexts() {
  return (TEXTS ||= normalizeSiteTexts(CATALOG ? CATALOG.siteTexts : readJSON(SITE_TEXTS_KEY, null)).value);
}
export function getMarquee() {
  return normalizeMarquee(CATALOG ? CATALOG.marquee : readJSON(MARQUEE_KEY, null)).value;
}
/** El texto de esa clave: el que se cargó en el panel o el de siempre. */
export function siteText(key) {
  return getSiteTexts()[key] ?? TEXT_BY_KEY[key]?.def ?? "";
}
/**
 * HTML seguro de un texto: los saltos de línea pasan a <br>; en los de
 * párrafos, una línea en blanco es un párrafo nuevo (<p> adentro de un
 * <div>, dos <br> adentro de cualquier otro elemento).
 */
export function textHtml(value, kind = "line", inBlock = false) {
  const esc = (s) => escapeHtml(s).replace(/\n/g, "<br>");
  if (kind !== "paras") return esc(value);
  const paras = value.split(/\n{2,}/);
  return inBlock ? paras.map((p) => `<p>${esc(p)}</p>`).join("") : paras.map(esc).join("<br><br>");
}
export function siteTextHtml(key) {
  return textHtml(siteText(key), TEXT_BY_KEY[key]?.kind);
}
/** Pone en cada [data-text] su texto. Solo toca los que se cambiaron en el panel. */
export function applySiteTexts(root = document) {
  const texts = getSiteTexts();
  root.querySelectorAll("[data-text]").forEach((el) => {
    const key = el.dataset.text;
    if (texts[key] == null || !TEXT_BY_KEY[key]) return;
    el.innerHTML = textHtml(texts[key], TEXT_BY_KEY[key].kind, el.tagName === "DIV");
  });
  document.documentElement.classList.remove("textos-cargando");
}

/** HTML del cintillo (vacío si está apagado). Con varios mensajes, rotan. */
export function announcementBar(a = getAnnouncement()) {
  if (!a?.enabled || !a.messages?.length) return "";
  const many = a.messages.length > 1;
  const items = a.messages
    .map((m, i) => {
      const link = safeLink(m.link);
      const ext = link && link.startsWith("https://") ? ' target="_blank" rel="noopener"' : "";
      const inner = `${escapeHtml(m.text)}${link ? ' <span aria-hidden="true">→</span>' : ""}`;
      return `<li class="announce__item"${many && i ? " hidden" : ""}>${link ? `<a href="${escapeHtml(link)}"${ext}>${inner}</a>` : `<span>${inner}</span>`}</li>`;
    })
    .join("");
  return `<div class="announce announce--${escapeHtml(a.style || "ciruela")}" role="region" aria-label="Anuncios"${many ? " data-announce-rotate" : ""}>
      <ul class="announce__list" role="list">${items}</ul>
    </div>`;
}

/** Rota los mensajes cada 5 s; se frena con el mouse o el foco encima. */
function startAnnouncementRotation(root) {
  const bar = root.querySelector("[data-announce-rotate]");
  if (!bar) return;
  const items = [...bar.querySelectorAll(".announce__item")];
  let i = 0;
  let paused = false;
  const pause = (v) => () => (paused = v);
  bar.addEventListener("mouseenter", pause(true));
  bar.addEventListener("mouseleave", pause(false));
  bar.addEventListener("focusin", pause(true));
  bar.addEventListener("focusout", pause(false));
  setInterval(() => {
    if (paused || document.hidden) return;
    items[i].hidden = true;
    i = (i + 1) % items.length;
    items[i].hidden = false;
  }, 5000);
}

/* ---------------- Header / Footer ---------------- */
const NAV = [
  { href: "index.html", label: "Inicio", key: "home" },
  { href: "disenos.html", label: "Diseños", key: "designs" },
  { href: "catalogo.html", label: "Prendas", key: "catalog" },
  { href: "quienes-somos.html", label: "Nosotros", key: "about" },
  { href: "preguntas.html", label: "Preguntas", key: "faq" },
  { href: "catalogo.html?diseñar=1", label: "Diseñar", key: "design" },
];

/** Colecciones con algún diseño publicado: van en el desplegable de «Diseños». */
function activeCollections() {
  try {
    const published = listStoreDesigns({ publishedOnly: true });
    return listCollections().filter((c) => published.some((d) => d.collectionId === c.id));
  } catch {
    return [];
  }
}

function navItem(n, active) {
  const current = n.key === active ? 'aria-current="page"' : "";
  if (n.key !== "designs") return `<a href="${n.href}" ${current}>${n.label}</a>`;
  const cols = activeCollections();
  if (!cols.length) return `<a href="${n.href}" ${current}>${n.label}</a>`;
  return `<div class="nav__drop" data-nav-drop>
      <a href="${n.href}" ${current}>${n.label}</a>
      <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-colecciones" aria-label="Ver colecciones">${icon("down")}</button>
      <ul class="nav__menu" id="nav-colecciones" role="list">
        <li><a href="disenos.html">Todos los diseños</a></li>
        ${cols.map((c) => `<li><a href="disenos.html?coleccion=${encodeURIComponent(c.id)}">${escapeHtml(c.name)}</a></li>`).join("")}
      </ul>
    </div>`;
}

export function renderHeader(active) {
  const el = document.getElementById("site-header");
  if (!el) return;
  el.className = "site-header";
  el.innerHTML = `
    ${
      // Con el servidor y el cobro activos la tienda es la real: sin banda.
      !SERVER
        ? '<div class="demo-bar"><strong>Prototipo</strong> · productos y precios de demostración · no se procesan pagos</div>'
        : !SERVER.services.payments
          ? '<div class="demo-bar"><strong>Tienda en preparación</strong> · cobro online todavía sin activar</div>'
          : ""
    }
    <div class="container site-header__inner">
      <a class="logo" href="index.html" aria-label="nevrado, ir al inicio"><img src="assets/img/nevrado-logo.svg" alt="nevrado" width="128" height="30"><small>taller de prendas</small></a>
      <nav class="nav" id="main-nav" aria-label="Principal">
        ${NAV.map((n) => navItem(n, active)).join("")}
      </nav>
      <div class="header-actions">
        <button class="icon-btn menu-toggle" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menú">${icon("menu")}</button>
        <a class="cart-link" href="carrito.html" aria-label="Carrito">${icon("bag")}<span class="cart-label">Carrito</span><span class="cart-count" data-cart-count>0</span></a>
      </div>
    </div>`;
  // El cintillo va arriba del header y se va con el scroll (el header queda fijo).
  document.querySelector(".announce")?.remove();
  if (active !== "admin") {
    el.insertAdjacentHTML("beforebegin", announcementBar());
    startAnnouncementRotation(el.parentElement);
  }
  const toggle = el.querySelector(".menu-toggle");
  const nav = el.querySelector(".nav");
  toggle.addEventListener("click", () => {
    const open = nav.dataset.open !== "true";
    nav.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  nav.addEventListener("click", (e) => {
    const t = e.target.closest(".nav__toggle");
    if (t) return setDrop(t.closest("[data-nav-drop]"), t.getAttribute("aria-expanded") !== "true");
    if (e.target.closest("a")) nav.dataset.open = "false";
  });
  // Desplegable de colecciones: se abre con el mouse encima o con el botón
  // de la flecha; se cierra con Escape, al salir o al hacer clic afuera.
  const drop = nav.querySelector("[data-nav-drop]");
  if (drop) {
    const hover = matchMedia("(hover: hover) and (min-width: 761px)");
    drop.addEventListener("mouseenter", () => hover.matches && setDrop(drop, true));
    drop.addEventListener("mouseleave", () => hover.matches && setDrop(drop, false));
    drop.addEventListener("focusout", (e) => !drop.contains(e.relatedTarget) && setDrop(drop, false));
    drop.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || drop.dataset.open !== "true") return;
      setDrop(drop, false);
      drop.querySelector(".nav__toggle").focus();
    });
    document.addEventListener("click", (e) => !drop.contains(e.target) && setDrop(drop, false));
  }
  updateCartCount(false);
  onCartChange(() => updateCartCount(true));
}

function setDrop(drop, open) {
  if (!drop) return;
  drop.dataset.open = String(open);
  drop.querySelector(".nav__toggle").setAttribute("aria-expanded", String(open));
}

export function updateCartCount(animate) {
  document.querySelectorAll("[data-cart-count]").forEach((b) => {
    const n = cartCount();
    b.textContent = n;
    b.dataset.empty = String(n === 0);
    b.closest("a")?.setAttribute("aria-label", `Carrito, ${n} ${n === 1 ? "prenda" : "prendas"}`);
    if (animate) {
      b.classList.remove("bump");
      void b.offsetWidth;
      b.classList.add("bump");
    }
  });
}

export function renderFooter({ whatsapp = true } = {}) {
  const el = document.getElementById("site-footer");
  if (!el) return;
  el.className = "site-footer";
  el.innerHTML = `
    <div class="stripes" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="container footer-grid">
      <div>
        <p class="footer-brand"><img src="assets/img/nevrado-logo-fondo-oscuro.svg" alt="nevrado" width="320" height="75"></p>
        <p class="muted" style="color:rgba(255,255,255,.8);margin-top:12px;max-width:34ch">${siteTextHtml("footer.blurb")}</p>
      </div>
      <div>
        <h2>Tienda</h2>
        <ul role="list">
          <li><a href="catalogo.html">Prendas</a></li>
          <li><a href="catalogo.html?diseñar=1">Diseñar una prenda</a></li>
          <li><a href="disenos.html">Diseños listos</a></li>
          <li><a href="carrito.html">Carrito</a></li>
          ${SERVER ? '<li><a href="pedido.html">Mis pedidos</a></li>' : '<li><a href="admin.html">Panel de la tienda (demo)</a></li>'}
        </ul>
      </div>
      <div>
        <h2>Info</h2>
        <ul role="list">
          <li><a href="quienes-somos.html">Quiénes somos</a></li>
          <li><a href="preguntas.html">Preguntas frecuentes</a></li>
          <li><a href="terminos.html">Términos y condiciones</a></li>
          <li><a href="privacidad.html">Privacidad</a></li>
        </ul>
      </div>
      <div>
        <h2>Contacto</h2>
        <ul role="list">
          <li><a href="${whatsappUrl()}" target="_blank" rel="noopener">WhatsApp</a></li>
          <li><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li>
          <li><a href="${instagramUrl}" target="_blank" rel="noopener">Instagram @${CONTACT.instagram}</a></li>
          <li>${CONTACT.city}</li>
        </ul>
      </div>
    </div>
    <div class="container footer-consumer">
      <a class="footer-regret" href="arrepentimiento.html">Botón de arrepentimiento</a>
      <a class="footer-complaints" href="${CONSUMER_COMPLAINTS_URL}" target="_blank" rel="noopener">Defensa de las y los Consumidores. Para reclamos <u>ingrese aquí</u></a>
    </div>
    <div class="container footer-legal">
      <span>© ${new Date().getFullYear()} nevrado · ${CONTACT.city}${SERVER ? "" : " · prototipo de demostración"}</span>
      <span>${siteTextHtml("footer.legal")}</span>
    </div>
    ${
      whatsapp
        ? `<a class="wa-float" href="${whatsappUrl("Hola nevrado, tengo una consulta")}" target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp">${icon("chat")}<span>WhatsApp</span></a>`
        : ""
    }`;
}

/* ---------------- Toasts ---------------- */
let toastHost;
export function toast(message, type = "info", ms = 3800) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
  }
  const t = document.createElement("div");
  t.className = `toast toast--${type}`;
  const ic = { success: "check", error: "alert", warning: "alert", info: "info" }[type] || "info";
  t.innerHTML = `${icon(ic)}<span>${escapeHtml(message)}</span>`;
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

/* ---------------- Diálogo de confirmación ---------------- */
export function confirmDialog({ title, body = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "dialog";
    d.setAttribute("aria-labelledby", "dlg-title");
    d.innerHTML = `
      <form method="dialog" class="dialog__body">
        <h2 id="dlg-title" class="h3">${escapeHtml(title)}</h2>
        ${body ? `<div class="muted" style="color:var(--c-ink-2)">${body}</div>` : ""}
        <div class="dialog__actions">
          <button class="btn btn--ghost" value="cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? "btn--dark" : "btn--primary"}" value="ok" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => {
      resolve(d.returnValue === "ok");
      d.remove();
    });
    d.showModal();
    d.querySelector("[data-confirm]").focus();
  });
}

export function initPage(active) {
  injectSprite();
  if (active !== "admin") applySiteTexts();
  renderHeader(active);
  renderFooter({ whatsapp: active !== "admin" });
}

export { injectSprite };
