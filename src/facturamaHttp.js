/**
 * Cliente HTTP mínimo para la API REST de Facturama (mismo contrato que usa el SDK oficial en el navegador).
 * El repo [facturama-javascript-sdk](https://github.com/Facturama/facturama-javascript-sdk) envuelve estas rutas con jQuery;
 * en Node conviene llamar a la API directamente (timbrado, catálogos, etc.).
 */
import { isFacturamaAuthConfigured } from "./config.js";

export function getFacturamaBaseUrl() {
  const u = process.env.FACTURAMA_API_URL?.trim();
  return u || "https://apisandbox.facturama.mx";
}

export function buildFacturamaAuthorizationHeader() {
  const user = process.env.FACTURAMA_USER?.trim();
  const pass = process.env.FACTURAMA_PASSWORD?.trim();
  if (!user || !pass) return null;
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/**
 * @param {string} path ej. "api/Client/URE180429TM6" o "/api-lite/csds"
 * @param {RequestInit} [init]
 */
export async function facturamaFetch(path, init = {}) {
  const auth = buildFacturamaAuthorizationHeader();
  if (!auth) {
    throw new Error("Facturama credentials not configured");
  }
  const base = getFacturamaBaseUrl().replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  const url = `${base}/${p}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", auth);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("User-Agent")) {
    headers.set(
      "User-Agent",
      process.env.FACTURAMA_USER_AGENT?.trim() ||
        process.env.FACTURAMA_USER?.trim() ||
        "intimo-invoicing"
    );
  }
  return fetch(url, { ...init, headers });
}

export function isFacturamaHttpReady() {
  return isFacturamaAuthConfigured();
}
