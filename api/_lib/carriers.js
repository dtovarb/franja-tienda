/**
 * Cotización de envíos con las empresas de correo.
 *
 * Correo Argentino: API MiCorreo (https://api.correoargentino.com.ar/micorreo/v1).
 *   POST /token con usuario y contraseña de la API (Basic) → token.
 *   POST /rates con customerId, CP de origen y destino y el paquete.
 *   Las credenciales las da un ejecutivo comercial de Correo Argentino
 *   (formulario en correoargentino.com.ar/MiCorreo/public/primeros-pasos).
 *
 * Andreani: API de tarifas (https://apis.andreani.com/v1/tarifas), para
 *   clientes con contrato (número de contrato y de cliente). Si además hay
 *   usuario y contraseña, se pide antes el token de /login.
 *
 * Solo se ofrece entrega a domicilio: la tienda no tiene retiro.
 * Una empresa sin credenciales simplemente no aparece; si ninguna responde,
 * shipping.js usa la tabla de tarifas del panel.
 */

/** Paquete aproximado por prenda (gramos y medidas de la prenda doblada en bolsa). */
export const PARCEL_BY_TYPE = {
  tee: { grams: 250, cm: [30, 25, 3] },
  oversize: { grams: 320, cm: [32, 27, 4] },
  hoodie: { grams: 750, cm: [35, 30, 8] },
  crewneck: { grams: 600, cm: [35, 30, 6] },
  cap: { grams: 150, cm: [22, 18, 12] },
  tote: { grams: 200, cm: [30, 25, 2] },
};
const PACKAGING_GRAMS = 60;

/** Un solo bulto para todo el pedido: suma pesos y apila alturas. */
export function parcelFor(lines) {
  let grams = PACKAGING_GRAMS;
  let length = 20, width = 15, height = 0;
  for (const { type, qty } of lines) {
    const p = PARCEL_BY_TYPE[type] || PARCEL_BY_TYPE.tee;
    grams += p.grams * qty;
    length = Math.max(length, p.cm[0]);
    width = Math.max(width, p.cm[1]);
    height += p.cm[2] * qty;
  }
  height = Math.min(Math.max(height, 3), 150);
  // Pedidos muy grandes: más de un bulto. Se cotiza como uno de hasta 25 kg.
  return { grams: Math.min(grams, 25000), length, width, height, declaredValue: 0 };
}

const days = (min, max) => (min && max ? (min === max ? `${min} días hábiles` : `${min} a ${max} días hábiles`) : null);

function correoArgentino(config, fetchImpl) {
  const c = config.micorreo;
  if (!c?.user || !c?.password || (!c.customerId && !(c.accountEmail && c.accountPassword))) return null;
  let token = null;
  let customerId = c.customerId;
  async function auth() {
    if (token && token.until > Date.now()) return token.value;
    const r = await fetchImpl(`${c.api}/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString("base64")}` },
    });
    if (!r.ok) throw new Error(`MiCorreo /token ${r.status}`);
    const data = await r.json();
    const exp = Date.parse(data.expires);
    token = { value: data.token, until: (Number.isFinite(exp) ? exp : Date.now() + 30 * 60_000) - 60_000 };
    if (!customerId) {
      const v = await fetchImpl(`${c.api}/users/validate`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.value}`, "content-type": "application/json" },
        body: JSON.stringify({ email: c.accountEmail, password: c.accountPassword }),
      });
      if (!v.ok) throw new Error(`MiCorreo /users/validate ${v.status}`);
      customerId = (await v.json()).customerId;
    }
    return token.value;
  }
  return {
    id: "correo-argentino",
    name: "Correo Argentino",
    async quote({ postalCode, parcel }) {
      const bearer = await auth();
      const r = await fetchImpl(`${c.api}/rates`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          postalCodeOrigin: config.originPostalCode,
          postalCodeDestination: String(postalCode),
          deliveredType: "D",
          dimensions: { weight: parcel.grams, height: parcel.height, width: parcel.width, length: parcel.length },
        }),
      });
      if (!r.ok) throw new Error(`MiCorreo /rates ${r.status}`);
      const data = await r.json();
      return (data.rates || [])
        .filter((x) => x.deliveredType === "D" && Number(x.price) > 0)
        .map((x) => ({
          id: `correo-argentino:${x.productType || "CP"}`,
          carrier: "Correo Argentino",
          service: x.productName || "Paq.ar",
          price: Math.ceil(Number(x.price)),
          days: days(x.deliveryTimeMin, x.deliveryTimeMax),
        }));
    },
  };
}

function andreani(config, fetchImpl) {
  const a = config.andreani;
  if (!a?.contract || !a?.client) return null;
  let token = null;
  async function headers() {
    if (!a.user || !a.password) return {};
    if (!token || token.until < Date.now()) {
      const r = await fetchImpl(`${a.api}/login`, {
        headers: { authorization: `Basic ${Buffer.from(`${a.user}:${a.password}`).toString("base64")}` },
      });
      if (!r.ok) throw new Error(`Andreani /login ${r.status}`);
      token = { value: r.headers.get("x-authorization-token"), until: Date.now() + 12 * 3600_000 };
    }
    return { "x-authorization-token": token.value };
  }
  return {
    id: "andreani",
    name: "Andreani",
    async quote({ postalCode, parcel }) {
      const qs = new URLSearchParams({
        cpDestino: String(postalCode),
        contrato: a.contract,
        cliente: a.client,
        "bultos[0][kilos]": String(parcel.grams / 1000),
        "bultos[0][volumen]": String(parcel.length * parcel.width * parcel.height),
        "bultos[0][valorDeclarado]": String(parcel.declaredValue || 0),
      });
      if (a.originBranch) qs.set("sucursalOrigen", a.originBranch);
      const r = await fetchImpl(`${a.api}/v1/tarifas?${qs}`, { headers: await headers() });
      if (!r.ok) throw new Error(`Andreani /v1/tarifas ${r.status}`);
      const data = await r.json();
      const total = Number(data?.tarifaConIva?.total);
      if (!(total > 0)) return [];
      return [{ id: "andreani:domicilio", carrier: "Andreani", service: "Envío a domicilio", price: Math.ceil(total), days: null }];
    },
  };
}

export function createCarriers(config, fetchImpl = fetch) {
  return [correoArgentino(config, fetchImpl), andreani(config, fetchImpl)].filter(Boolean);
}
