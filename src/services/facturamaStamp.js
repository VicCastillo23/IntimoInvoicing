/**
 * Timbrado CFDI 4.0 vía Facturama API Lite (multiemisor).
 */
import { facturamaFetch } from "../facturamaHttp.js";

/**
 * @param {object} cfdiBody — resultado de buildCfdi4MultiemisorPayload
 * @returns {Promise<object>} Respuesta Facturama (incluye Id, Complement.TaxStamp.Uuid, …)
 */
export async function stampCfdi4Multiemisor(cfdiBody) {
  const res = await facturamaFetch("api-lite/3/cfdis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfdiBody),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      json.Message ||
      json.message ||
      json.ModelState ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

export function extractStampMeta(facturamaResponse) {
  const uuid = facturamaResponse?.Complement?.TaxStamp?.Uuid || null;
  return {
    id: facturamaResponse?.Id || null,
    uuid,
    serie: facturamaResponse?.Serie ?? null,
    folio: facturamaResponse?.Folio ?? null,
    date: facturamaResponse?.Date ?? null,
    total: facturamaResponse?.Total ?? null,
  };
}
