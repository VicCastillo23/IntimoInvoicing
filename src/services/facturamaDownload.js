/**
 * Descarga XML/PDF del CFDI timbrado (API: GET /cfdi/{format}/issuedLite/{id} → JSON base64).
 */
import { facturamaFetch } from "../facturamaHttp.js";

const MIME_BY_SHORT = {
  pdf: "application/pdf",
  xml: "application/xml",
  html: "text/html",
};

/**
 * @param {"xml" | "pdf"} format
 * @param {string} facturamaId — Id devuelto al crear el CFDI
 */
export async function downloadCfdiIssued(format, facturamaId) {
  const id = encodeURIComponent(facturamaId);
  const res = await facturamaFetch(`cfdi/${format}/issuedLite/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    const msg =
      json.Message ||
      json.message ||
      text?.slice(0, 500) ||
      `HTTP ${res.status}`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }

  const b64 = json.Content;
  if (typeof b64 !== "string" || !b64.length) {
    const err = new Error("Respuesta Facturama sin Content base64");
    err.status = 502;
    throw err;
  }

  const buffer = Buffer.from(b64, "base64");
  const ctKey = String(json.ContentType || format).toLowerCase();
  const contentType =
    MIME_BY_SHORT[ctKey] ||
    (format === "pdf" ? "application/pdf" : "application/xml");

  return { buffer, contentType };
}
