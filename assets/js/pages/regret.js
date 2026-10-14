/**
 * Botón de arrepentimiento (Res. SCI 424/2020): pedido de cancelación sin
 * registro previo. Con servidor queda guardado y se manda el código de
 * identificación por mail; sin servidor (prototipo) se arma un mail.
 */
import { initPage } from "../core/ui.js";
import { SERVER, api } from "../core/api.js";
import { escapeHtml } from "../core/format.js";
import { CONTACT, whatsappUrl } from "../data/contact.js";

initPage("legal");

const form = document.querySelector("[data-regret-form]");
const errorBox = form.querySelector("[data-regret-error]");
const submit = form.querySelector("[data-regret-submit]");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const body = {
    name: data.name.trim(),
    email: data.email.trim(),
    order: data.order.replace(/\D/g, ""),
    phone: data.phone.trim(),
    details: data.details.trim(),
    website: data.website,
  };
  if (body.name.length < 2) return showError("Escribí tu nombre y apellido."), form.elements.name.focus();
  if (!EMAIL.test(body.email)) return showError("Revisá el mail: así no nos llega la respuesta."), form.elements.email.focus();
  showError("");

  if (!SERVER) {
    const text = [`Pedido de arrepentimiento`, `Nombre: ${body.name}`, `Mail: ${body.email}`, body.order && `Pedido: #${body.order}`, body.phone && `Teléfono: ${body.phone}`, body.details]
      .filter(Boolean)
      .join("\n");
    location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent("Botón de arrepentimiento")}&body=${encodeURIComponent(text)}`;
    return;
  }

  submit.disabled = true;
  submit.textContent = "Enviando…";
  try {
    const r = await api("arrepentimiento", { method: "POST", body });
    form.closest(".regret").innerHTML = `
      <section class="regret__done" aria-live="polite">
        <span class="tag tag--magenta">Recibido</span>
        <h2 class="h2">Tu código de arrepentimiento es <span class="mono">${escapeHtml(r.code)}</span></h2>
        <p>${r.mailed ? `Guardalo: también te lo mandamos a <b>${escapeHtml(body.email)}</b>.` : "Guardalo: con este código seguimos tu pedido."} Te escribimos para coordinar la cancelación o la devolución.</p>
        <p class="hint">¿Dudas? <a href="${whatsappUrl(`Hola, hice un pedido de arrepentimiento con el código ${r.code}`)}" target="_blank" rel="noopener">Escribinos por WhatsApp</a>.</p>
      </section>`;
  } catch (err) {
    submit.disabled = false;
    submit.innerHTML = "Enviar pedido de arrepentimiento";
    showError(`${err.message} Si no funciona, escribinos a ${CONTACT.email}.`);
  }
});

