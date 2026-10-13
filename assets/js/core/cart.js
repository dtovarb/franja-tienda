/**
 * Carrito en el navegador (localStorage).
 * Cada artículo apunta a SU propio documento de diseño y a sus originales,
 * así dos remeras iguales con diseños distintos son artículos distintos.
 * El precio se recalcula siempre desde el catálogo (no se confía en el
 * importe guardado).
 */
import { readJSON, writeJSON } from "./storage.js";
import { uid } from "./format.js";
import { getProduct } from "../data/catalog.js";
import { computePrice } from "./pricing.js";

const KEY = "cart.v1";
const EVT = "nevrado:cart";

export function getCart() {
  return readJSON(KEY, { items: [] });
}

function save(cart) {
  writeJSON(KEY, cart);
  window.dispatchEvent(new CustomEvent(EVT, { detail: cart }));
}

export function onCartChange(fn) {
  window.addEventListener(EVT, (e) => fn(e.detail));
  window.addEventListener("storage", (e) => e.key === "nevrado." + KEY && fn(getCart()));
}

export function cartCount() {
  return getCart().items.reduce((n, i) => n + i.qty, 0);
}

/** Crea o actualiza (si item.id existe) un artículo. */
export function upsertItem(item) {
  const cart = getCart();
  const now = new Date().toISOString();
  const idx = item.id ? cart.items.findIndex((i) => i.id === item.id) : -1;
  if (idx >= 0) {
    cart.items[idx] = { ...cart.items[idx], ...item, updatedAt: now };
  } else {
    cart.items.push({ ...item, id: uid("item"), createdAt: now, updatedAt: now });
  }
  save(cart);
  return idx >= 0 ? cart.items[idx] : cart.items[cart.items.length - 1];
}

export function setQty(itemId, qty) {
  const cart = getCart();
  const it = cart.items.find((i) => i.id === itemId);
  if (!it) return;
  it.qty = Math.min(50, Math.max(1, Math.round(qty) || 1));
  it.updatedAt = new Date().toISOString();
  save(cart);
}

export function removeItem(itemId) {
  const cart = getCart();
  cart.items = cart.items.filter((i) => i.id !== itemId);
  save(cart);
}

export function clearCart() {
  save({ items: [] });
}

export function getItem(itemId) {
  return getCart().items.find((i) => i.id === itemId) || null;
}

/** Precios recalculados desde el catálogo. */
export function priceItem(item) {
  const product = getProduct(item.productId);
  if (!product) return null;
  return computePrice(product, { sizeId: item.variant.sizeId, qty: item.qty }, { printedFaces: item.printedFaces || [] });
}

export function cartTotals() {
  const items = getCart().items;
  const subtotal = items.reduce((sum, i) => sum + (priceItem(i)?.total || 0), 0);
  return { subtotal, shipping: null, total: subtotal, count: items.reduce((n, i) => n + i.qty, 0) };
}
