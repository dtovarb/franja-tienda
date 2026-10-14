/**
 * Función de Vercel: atiende todo /api/* (vercel.json reescribe las rutas
 * hacia acá). La lógica está en api/_lib/; las carpetas con "_" no se
 * publican como funciones.
 */
import { createApp } from "./_lib/app.js";
import { nodeHandler } from "./_lib/http.js";

const app = createApp();
export default nodeHandler(app.handle);
