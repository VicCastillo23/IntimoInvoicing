/**
 * Resolución de CP → estado, municipio y colonias vía catálogos Facturama (SAT).
 */
import { facturamaFetch } from "../facturamaHttp.js";
import { isFacturamaAuthConfigured } from "../config.js";

/** @type {Array<{Name:string, Value:string}> | null} */
let statesMxCache = null;

/** @type {Map<string, Array<{Name:string, Value:string, State?:string}>>} */
const municipalitiesByState = new Map();

async function getStatesMx() {
  if (statesMxCache) return statesMxCache;
  const res = await facturamaFetch("catalogs/States?countryCode=MEX");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  statesMxCache = await res.json();
  return statesMxCache;
}

async function getMunicipalities(stateCode) {
  const key = String(stateCode || "").toUpperCase();
  if (municipalitiesByState.has(key)) {
    return municipalitiesByState.get(key);
  }
  const res = await facturamaFetch(
    `catalogs/Municipalities?stateCode=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  /** @type {Array<{Name:string, Value:string, State?:string}>} */
  const arr = await res.json();
  municipalitiesByState.set(key, arr);
  return arr;
}

/**
 * @param {string} postalCode — 5 dígitos
 * @returns {Promise<object>}
 */
export async function resolvePostalCodeCatalog(postalCode) {
  const pc = String(postalCode || "").trim();
  if (!/^\d{5}$/.test(pc)) {
    return { ok: false, error: "invalid_postal_code", message: "El código postal debe ser de 5 dígitos." };
  }

  if (!isFacturamaAuthConfigured()) {
    return {
      ok: false,
      error: "facturama_not_configured",
      message:
        "Catálogo por CP no disponible: configura FACTURAMA_USER y FACTURAMA_PASSWORD en el servidor.",
    };
  }

  const [pcRes, nbRes] = await Promise.all([
    facturamaFetch(`catalogs/PostalCodes?keyword=${encodeURIComponent(pc)}`),
    facturamaFetch(`catalogs/Neighborhoods?postalCode=${encodeURIComponent(pc)}`),
  ]);

  if (!pcRes.ok) {
    const t = await pcRes.text();
    return {
      ok: false,
      error: "postal_catalog_failed",
      message: t || `HTTP ${pcRes.status}`,
    };
  }
  if (!nbRes.ok) {
    const t = await nbRes.text();
    return {
      ok: false,
      error: "neighborhoods_catalog_failed",
      message: t || `HTTP ${nbRes.status}`,
    };
  }

  /** @type {Array<{StateCode?: string, MunicipalityCode?: string, Name?: string, Value?: string}>} */
  const postalRows = await pcRes.json();
  /** @type {Array<{Name?: string, Value?: string}>} */
  const rawNeighborhoods = await nbRes.json();

  const row0 = Array.isArray(postalRows) && postalRows.length ? postalRows[0] : null;
  const stateCode = row0?.StateCode ? String(row0.StateCode).toUpperCase() : "";
  const municipalityCode = row0?.MunicipalityCode
    ? String(row0.MunicipalityCode).trim()
    : "";

  const states = await getStatesMx();
  const stateRow = states.find((s) => s.Value === stateCode);
  const stateName = stateRow?.Name || stateCode || "";

  let municipalityName = "";
  if (stateCode && municipalityCode) {
    const munis = await getMunicipalities(stateCode);
    const mRow = munis.find((m) => String(m.Value).trim() === municipalityCode);
    municipalityName = mRow?.Name || "";
  }

  const neighborhoods = (Array.isArray(rawNeighborhoods) ? rawNeighborhoods : [])
    .filter((n) => n && typeof n.Name === "string" && n.Name.trim())
    .map((n) => ({
      name: n.Name.trim(),
      value: n.Value != null ? String(n.Value) : "",
    }));

  return {
    ok: true,
    postalCode: pc,
    stateCode,
    stateName,
    municipalityCode,
    municipalityName,
    neighborhoods,
  };
}
