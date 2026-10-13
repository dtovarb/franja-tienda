/**
 * Pedidos de DEMOSTRACIÓN (localStorage).
 *
 * El checkout del prototipo no cobra ni envía nada: guarda el pedido acá para
 * que el panel de la tienda lo muestre y se pueda practicar el circuito de
 * producción. En producción, los pedidos los crea POST /api/orders después de
 * recalcular precios y stock en el servidor.
 */
import { readJSON, writeJSON, removeKey } from "./storage.js";
import { uid } from "./format.js";

const KEY = "orders.v1";

export const ORDER_STATUSES = [
  { id: "pendiente", label: "Pendiente" },
  { id: "produccion", label: "En producción" },
  { id: "listo", label: "Listo para entregar" },
  { id: "entregado", label: "Entregado" },
  { id: "cancelado", label: "Cancelado" },
];

export function listOrders() {
  return readJSON(KEY, []);
}

export function createDemoOrder(payload) {
  const orders = listOrders();
  const order = {
    ...payload,
    id: uid("ord"),
    number: orders.reduce((n, o) => Math.max(n, o.number || 0), 1000) + 1,
    status: "pendiente",
    demo: true,
    createdAt: new Date().toISOString(),
  };
  orders.unshift(order);
  writeJSON(KEY, orders);
  return order;
}

export function setOrderStatus(id, status) {
  const orders = listOrders();
  const o = orders.find((x) => x.id === id);
  if (!o || !ORDER_STATUSES.some((s) => s.id === status)) return;
  o.status = status;
  o.updatedAt = new Date().toISOString();
  writeJSON(KEY, orders);
}

export function clearOrders() {
  removeKey(KEY);
}
