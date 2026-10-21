/**
 * Panel, pestaña «Sitio»: marquesina del inicio y textos de la página.
 * Con servidor se guardan en site_settings; en la demostración, en este
 * navegador (las mismas claves que lee ui.js).
 */
import { SERVER, api } from "../core/api.js";
import { readJSON, writeJSON, removeKey } from "../core/storage.js";
import { toast, SITE_TEXTS_KEY, MARQUEE_KEY } from "../core/ui.js";
import { escapeHtml } from "../core/format.js";
import {
  SITE_TEXTS, TEXT_PAGES, TEXT_LIMITS, TEXT_BY_KEY, normalizeSiteTexts,
  MAX_MARQUEE_ITEMS, MAX_MARQUEE_TEXT, normalizeMarquee,
} from "../core/site-texts.js";

const PAGE_URLS = {
  inicio: "index.html",
  nosotros: "quienes-somos.html",
  prendas: "catalogo.html",
  disenos: "disenos.html",
  preguntas: "preguntas.html",
  general: "index.html#site-footer",
};

const data = SERVER
  ? {
      load: () => api("admin/site-texts"),
      saveTexts: async (siteTexts) => (await api("admin/site-texts", { method: "PUT", body: { siteTexts } })).siteTexts,
      saveMarquee: async (marquee) => (await api("admin/marquee", { method: "PUT", body: { marquee } })).marquee,
    }
  : {
      load: async () => ({
        siteTexts: normalizeSiteTexts(readJSON(SITE_TEXTS_KEY, null)).value,
        marquee: normalizeMarquee(readJSON(MARQUEE_KEY, null)).value,
      }),
      async saveTexts(raw) {
        const { value, errors } = normalizeSiteTexts(raw);
        if (errors.length) throw new Error(errors.join(" "));
        writeJSON(SITE_TEXTS_KEY, value);
        return value;
      },
      async saveMarquee(raw) {
        const { value, errors } = normalizeMarquee(raw);
        if (errors.length) throw new Error(errors.join(" "));
        writeJSON(MARQUEE_KEY, value);
        return value;
      },
    };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const later = SERVER ? ". En la tienda se ve en un minuto como mucho." : " en este navegador.";
const errText = (err, fallback) => (err?.message ? err.message : fallback);

let state = { siteTexts: {}, marquee: { enabled: true, items: [] }, page: "inicio" };

/** Demostración: vuelve a los textos y la marquesina de siempre. */
export function resetSiteContent() {
  removeKey(SITE_TEXTS_KEY);
  removeKey(MARQUEE_KEY);
}

/** Dibuja las dos secciones en sus lugares del panel Sitio. */
export async function renderSiteContent({ marqueeHost, textsHost }) {
  try {
    const r = await data.load();
    state = { ...state, siteTexts: r.siteTexts || {}, marquee: r.marquee };
  } catch (err) {
    textsHost.innerHTML = `<div class="notice notice--danger" role="alert">${escapeHtml(errText(err, "No se pudieron cargar los textos."))}</div>`;
    return;
  }
  renderMarquee(marqueeHost);
  renderTexts(textsHost);
}

/* ---------------- Marquesina ---------------- */
function renderMarquee(host) {
  const m = state.marquee;
  const rows = [...m.items];
  while (rows.length < MAX_MARQUEE_ITEMS) rows.push("");
  host.innerHTML = `
    <div class="admin-head admin-head--sep" id="sitio-marquesina">
      <div>
        <h2 class="h3">Marquesina del inicio</h2>
        <p class="muted">La banda lila que pasa de costado en el inicio, debajo de «Elegí tu prenda». Las frases se separan con la flor de la marca.</p>
      </div>
    </div>
    <form class="admin-form" data-marquee-form novalidate>
      <label class="check"><input type="checkbox" name="enabled" ${m.enabled ? "checked" : ""}> Mostrar la marquesina</label>
      <fieldset class="field">
        <legend>Frases</legend>
        <p class="hint">Hasta ${MAX_MARQUEE_ITEMS} frases cortas de ${MAX_MARQUEE_TEXT} caracteres. Las vacías no se muestran. Con pocas frases, se repiten hasta llenar la banda.</p>
        <ol class="admin-marquee" role="list">
          ${rows
            .map(
              (t, i) => `<li><label class="sr-only" for="mq-${i}">Frase ${i + 1}</label>
              <input class="input" id="mq-${i}" name="item" maxlength="${MAX_MARQUEE_TEXT}" value="${escapeHtml(t)}" placeholder="${i ? "" : "Ej.: Hecho en Córdoba"}"></li>`
            )
            .join("")}
        </ol>
      </fieldset>
      <div class="field">
        <span class="label">Vista previa</span>
        <div class="marquee admin-marquee__preview" aria-hidden="true"><div class="marquee__track" data-marquee-preview></div></div>
      </div>
      <div class="notice notice--danger form-errors" role="alert" data-marquee-errors></div>
      <div class="admin-form__actions">
        <button class="btn btn--primary" type="submit">Guardar marquesina</button>
      </div>
    </form>`;
  const form = $("[data-marquee-form]", host);
  const read = () => ({ enabled: form.enabled.checked, items: $$("[name=item]", form).map((i) => i.value) });
  const preview = () => {
    const v = normalizeMarquee({ ...read(), enabled: true }).value;
    const run = v.items.map((w) => `<span>${escapeHtml(w)}<i class="flor"></i></span>`).join("");
    $("[data-marquee-preview]", form).innerHTML = run + run;
  };
  form.addEventListener("input", preview);
  preview();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("[data-marquee-errors]", form);
    const raw = read();
    const { errors } = normalizeMarquee(raw);
    if (errors.length) return (errEl.innerHTML = errors.map(escapeHtml).join("<br>"));
    errEl.textContent = "";
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      state.marquee = await data.saveMarquee(raw);
      toast(state.marquee.enabled ? `Marquesina guardada${later}` : `Marquesina apagada${later}`, "success");
      renderMarquee(host);
    } catch (err) {
      errEl.textContent = errText(err, "No se pudo guardar la marquesina.");
      btn.disabled = false;
    }
  });
}

/* ---------------- Textos de la página ---------------- */
function field(t) {
  const id = `tx-${t.key.replace(/\./g, "-")}`;
  const cur = state.siteTexts[t.key] ?? t.def;
  const changed = state.siteTexts[t.key] != null;
  const max = TEXT_LIMITS[t.kind];
  const rows = t.kind === "line" ? 0 : Math.min(10, Math.max(2, Math.ceil(cur.length / 70) + (cur.match(/\n/g) || []).length));
  const input =
    t.kind === "line"
      ? `<input class="input" id="${id}" name="${t.key}" maxlength="${max}" value="${escapeHtml(cur)}">`
      : `<textarea class="input" id="${id}" name="${t.key}" maxlength="${max}" rows="${rows}">${escapeHtml(cur)}</textarea>`;
  const hint = t.kind === "multi" ? "Enter = salto de línea." : t.kind === "paras" ? "Una línea en blanco separa los párrafos." : "";
  return `<div class="field admin-text${changed ? " admin-text--changed" : ""}" data-text-field="${t.key}">
      <div class="admin-text__head">
        <label for="${id}">${escapeHtml(t.label)}</label>
        <button class="btn btn--sm btn--ghost" type="button" data-text-reset ${changed ? "" : "hidden"}>Volver al original</button>
      </div>
      ${input}
      ${hint ? `<p class="hint">${hint}</p>` : ""}
    </div>`;
}

function renderTexts(host) {
  const page = state.page;
  const list = SITE_TEXTS.filter((t) => t.page === page);
  const groups = [...new Set(list.map((t) => t.group))];
  const changedIn = (p) => SITE_TEXTS.filter((t) => t.page === p && state.siteTexts[t.key] != null).length;
  host.innerHTML = `
    <div class="admin-head admin-head--sep" id="sitio-textos">
      <div>
        <h2 class="h3">Textos de la página</h2>
        <p class="muted">Títulos, textos y botones de cada página. Cambiá lo que quieras y guardá; «Volver al original» deja el texto de siempre. Las preguntas frecuentes, los textos legales y los de las prendas (nombre, descripción, precio) no se cambian acá: las prendas, en la pestaña Productos.</p>
      </div>
    </div>
    <div class="filters admin-text-pages" role="group" aria-label="Página">
      ${Object.entries(TEXT_PAGES)
        .map(([k, v]) => {
          const n = changedIn(k);
          return `<button class="filter" type="button" data-text-page="${k}" aria-pressed="${k === page}">${escapeHtml(v)}${n ? ` <span class="ed-count">${n}</span>` : ""}</button>`;
        })
        .join("")}
    </div>
    <form class="admin-form" data-texts-form novalidate>
      <p class="hint"><a href="${PAGE_URLS[page]}" target="_blank" rel="noopener">Ver la página «${escapeHtml(TEXT_PAGES[page])}» →</a></p>
      ${groups
        .map(
          (g) => `<fieldset class="field admin-text-group">
            <legend>${escapeHtml(g)}</legend>
            ${list.filter((t) => t.group === g).map(field).join("")}
          </fieldset>`
        )
        .join("")}
      <div class="notice notice--danger form-errors" role="alert" data-texts-errors></div>
      <div class="admin-form__actions admin-form__actions--sticky">
        <button class="btn btn--primary" type="submit">Guardar textos de «${escapeHtml(TEXT_PAGES[page])}»</button>
      </div>
    </form>`;

  host.onclick = (e) => {
    const p = e.target.closest("[data-text-page]");
    if (p && p.dataset.textPage !== state.page) {
      state.page = p.dataset.textPage;
      renderTexts(host);
      return;
    }
    const r = e.target.closest("[data-text-reset]");
    if (r) {
      const f = r.closest("[data-text-field]");
      const t = TEXT_BY_KEY[f.dataset.textField];
      const input = $("input, textarea", f);
      input.value = t.def;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
  };
  const form = $("[data-texts-form]", host);
  form.addEventListener("input", (e) => {
    const f = e.target.closest("[data-text-field]");
    if (!f) return;
    const t = TEXT_BY_KEY[f.dataset.textField];
    const differs = e.target.value.trim() !== "" && e.target.value.trim() !== t.def;
    f.classList.toggle("admin-text--changed", differs);
    $("[data-text-reset]", f).hidden = !differs;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("[data-texts-errors]", form);
    // Los de las otras páginas quedan como están.
    const raw = { ...state.siteTexts };
    for (const t of list) raw[t.key] = form.elements[t.key].value;
    const { errors } = normalizeSiteTexts(raw);
    if (errors.length) return (errEl.innerHTML = errors.map(escapeHtml).join("<br>"));
    errEl.textContent = "";
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      state.siteTexts = await data.saveTexts(raw);
      toast(`Textos de «${TEXT_PAGES[page]}» guardados${later}`, "success");
      renderTexts(host);
    } catch (err) {
      errEl.textContent = errText(err, "No se pudieron guardar los textos.");
      btn.disabled = false;
    }
  });
}
