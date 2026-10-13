import { CURRENCY } from "../data/catalog.js";

const money = new Intl.NumberFormat(CURRENCY.locale, {
  style: "currency",
  currency: CURRENCY.code,
  maximumFractionDigits: 0,
});

export const formatPrice = (n) => money.format(Math.round(n));

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function uid(prefix = "id") {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${rnd[0].toString(36)}${rnd[1].toString(36).slice(0, 4)}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function params() {
  return new URLSearchParams(location.search);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
