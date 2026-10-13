/**
 * Historial deshacer/rehacer. Una pila independiente por cara, así deshacer
 * en la espalda nunca toca el frente.
 */
import { HISTORY_LIMIT } from "./config.js";

export class History {
  constructor() {
    this.stack = [];
    this.index = -1;
  }
  reset(state) {
    this.stack = [JSON.stringify(state)];
    this.index = 0;
  }
  /** Registra un estado si es distinto del actual. Devuelve true si cambió. */
  push(state) {
    const s = JSON.stringify(state);
    if (this.stack[this.index] === s) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(s);
    if (this.stack.length > HISTORY_LIMIT) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }
  get canUndo() {
    return this.index > 0;
  }
  get canRedo() {
    return this.index < this.stack.length - 1;
  }
  undo() {
    if (!this.canUndo) return null;
    this.index--;
    return JSON.parse(this.stack[this.index]);
  }
  redo() {
    if (!this.canRedo) return null;
    this.index++;
    return JSON.parse(this.stack[this.index]);
  }
}
