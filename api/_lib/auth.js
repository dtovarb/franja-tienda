/**
 * Login del panel de la tienda.
 *
 * Quién entra:
 *   - Con Supabase configurado: usuarias creadas en Supabase Auth cuyo mail
 *     esté en OWNER_EMAILS. Si OWNER_EMAILS está vacío no entra nadie
 *     (Supabase permite registrarse a cualquiera por defecto).
 *   - Sin Supabase (desarrollo): cuentas de la tabla staff_users, creadas
 *     con `npm run usuaria -- mail@ejemplo.com`.
 *
 * Después del login el servidor emite su propia sesión: un JWT firmado
 * (HS256, 12 h) en una cookie httpOnly, SameSite=Strict. Las acciones que
 * cambian datos además exigen que el Origin sea el de la tienda.
 */
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { HttpError, getCookie } from "./http.js";

const scryptAsync = promisify(scrypt);
export const SESSION_COOKIE = "nv_sesion";
const SESSION_HOURS = 12;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [alg, n, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const got = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(expected, got);
}

/* Freno simple contra adivinar contraseñas (por instancia del servidor). */
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60_000);
  if (list.length >= 10) throw new HttpError(429, "Demasiados intentos. Esperá unos minutos y probá de nuevo.");
  list.push(now);
  attempts.set(key, list);
}

export function createAuth(config, { db, fetchImpl = fetch }) {
  if (!config.sessionSecret) return null;
  const key = new TextEncoder().encode(config.sessionSecret);
  const useSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

  async function checkCredentials(email, password) {
    if (useSupabase) {
      const r = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.supabaseAnonKey, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) return false;
      const data = await r.json();
      return (data.user?.email || "").toLowerCase() === email;
    }
    const [row] = await db.query("select password_hash from staff_users where email = $1", [email]);
    return row ? verifyPassword(password, row.password_hash) : false;
  }

  function isOwner(email) {
    if (config.ownerEmails.length) return config.ownerEmails.includes(email);
    return !useSupabase; // cuentas locales: todas son de la tienda
  }

  return {
    provider: useSupabase ? "supabase" : "local",

    async login(request, { email, password }, ip = "?") {
      email = String(email || "").trim().toLowerCase();
      password = String(password || "");
      if (!email || !password) throw new HttpError(422, "Escribí tu mail y tu contraseña.");
      throttle(`${ip}|${email}`);
      const ok = (await checkCredentials(email, password)) && isOwner(email);
      if (!ok) throw new HttpError(401, "El mail o la contraseña no son correctos.");
      attempts.delete(`${ip}|${email}`);
      const token = await new SignJWT({ role: "owner" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(email)
        .setIssuedAt()
        .setExpirationTime(`${SESSION_HOURS}h`)
        .sign(key);
      return { email, cookie: sessionCookie(request, token, SESSION_HOURS * 3600) };
    },

    logoutCookie: (request) => sessionCookie(request, "", 0),

    /** Usuaria de la sesión, o null. */
    async current(request) {
      const token = getCookie(request, SESSION_COOKIE);
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        if (payload.role !== "owner" || !isOwner(payload.sub)) return null;
        return { email: payload.sub, role: "owner" };
      } catch {
        return null;
      }
    },

    async require(request) {
      const user = await this.current(request);
      if (!user) throw new HttpError(401, "Tenés que entrar al panel.");
      if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
      return user;
    },
  };
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "Origen no permitido.");
}
