/**
 * Componentes de interfaz compartidos: íconos, header, footer, toasts y
 * diálogos de confirmación.
 */
import { cartCount, onCartChange } from "./cart.js";
import { escapeHtml } from "./format.js";

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

/* ---------------- Header / Footer ---------------- */
const NAV = [
  { href: "index.html", label: "Inicio", key: "home" },
  { href: "catalogo.html", label: "Prendas", key: "catalog" },
  { href: "index.html#como-funciona", label: "Cómo funciona", key: "how" },
  { href: "catalogo.html?diseñar=1", label: "Diseñar", key: "design" },
];

export function renderHeader(active) {
  const el = document.getElementById("site-header");
  if (!el) return;
  el.className = "site-header";
  el.innerHTML = `
    <div class="demo-bar"><strong>Prototipo</strong> · productos y precios de demostración · no se procesan pagos</div>
    <div class="container site-header__inner">
      <a class="logo" href="index.html" aria-label="nevrado, ir al inicio"><img src="assets/img/nevrado-logo.svg" alt="nevrado" width="128" height="30"><small>taller de prendas</small></a>
      <nav class="nav" id="main-nav" aria-label="Principal">
        ${NAV.map((n) => `<a href="${n.href}" ${n.key === active ? 'aria-current="page"' : ""}>${n.label}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="icon-btn menu-toggle" aria-controls="main-nav" aria-expanded="false" aria-label="Abrir menú">${icon("menu")}</button>
        <a class="cart-link" href="carrito.html" aria-label="Carrito">${icon("bag")}<span class="cart-label">Carrito</span><span class="cart-count" data-cart-count>0</span></a>
      </div>
    </div>`;
  const toggle = el.querySelector(".menu-toggle");
  const nav = el.querySelector(".nav");
  toggle.addEventListener("click", () => {
    const open = nav.dataset.open !== "true";
    nav.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) nav.dataset.open = "false";
  });
  updateCartCount(false);
  onCartChange(() => updateCartCount(true));
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

export function renderFooter() {
  const el = document.getElementById("site-footer");
  if (!el) return;
  el.className = "site-footer";
  el.innerHTML = `
    <div class="stripes" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="container footer-grid">
      <div>
        <p class="footer-brand"><img src="assets/img/nevrado-logo-fondo-oscuro.svg" alt="nevrado" width="320" height="75"></p>
        <p class="muted" style="color:#b7b7b7;margin-top:12px;max-width:34ch">Prendas que imprimimos y terminamos en nuestro taller. Vos traés la idea.</p>
      </div>
      <div>
        <h2>Tienda</h2>
        <ul role="list">
          <li><a href="catalogo.html">Prendas</a></li>
          <li><a href="catalogo.html?diseñar=1">Diseñar una prenda</a></li>
          <li><a href="carrito.html">Carrito</a></li>
        </ul>
      </div>
      <div>
        <h2>Info</h2>
        <ul role="list">
          <li><a href="index.html#como-funciona">Cómo funciona</a></li>
          <li><a href="index.html#archivos">Archivos e impresión</a></li>
          <li><a href="index.html#taller">El taller</a></li>
        </ul>
      </div>
      <div>
        <h2>Contacto (ejemplo)</h2>
        <ul role="list">
          <li><a href="mailto:hola@nevrado.example">hola@nevrado.example</a></li>
          <li>+54 11 0000-0000</li>
          <li>Lun a vie · 10 a 18 h</li>
        </ul>
      </div>
    </div>
    <div class="container footer-legal">
      <span>© ${new Date().getFullYear()} nevrado · prototipo de demostración.</span>
      <span>Datos de contacto, productos y precios ficticios.</span>
    </div>`;
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
  renderHeader(active);
  renderFooter();
}

export { injectSprite };
