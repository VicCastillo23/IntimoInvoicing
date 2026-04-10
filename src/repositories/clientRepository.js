/**
 * Repositorio de clientes (receptor CFDI) — persistencia propia, independiente del PAC.
 * Sustituir la implementación por PostgreSQL sin cambiar las rutas HTTP.
 */
import { getEmisorCfdiProfile } from "../config.js";
import { normalizeRfc } from "../rfc.js";
import { readClientsFile, writeClientsFile } from "../persistence/fileClientPersistence.js";

/** @type {Map<string, import("../domain/clientRecord.js").ClientRecord>} */
const cache = new Map();

let initialized = false;

function buildSeedRows() {
  const zip = getEmisorCfdiProfile().expeditionPlace || "42501";
  return [
    {
      rfc: "XAXX010101000",
      legalName: "Público en general (ejemplo precargado)",
      taxRegime: "616",
      zipCode: zip,
      cfdiUse: "S01",
      email: "facturacion@ejemplo.com",
      street: "Calle de ejemplo",
      exteriorNumber: "100",
      interiorNumber: "",
      neighborhood: "Centro",
      locality: "",
      municipality: "Aguascalientes",
      state: "AGU",
      country: "México",
    },
  ];
}

function nowIso() {
  return new Date().toISOString();
}

export async function initClientRepository() {
  if (initialized) return;

  const fileData = await readClientsFile();
  cache.clear();
  for (const [k, v] of Object.entries(fileData)) {
    if (v && typeof v === "object" && v.rfc) {
      cache.set(normalizeRfc(k), { ...v, rfc: normalizeRfc(v.rfc) });
    }
  }

  if (cache.size === 0) {
    for (const row of buildSeedRows()) {
      const rfc = normalizeRfc(row.rfc);
      cache.set(rfc, { ...row, rfc, updatedAt: nowIso() });
    }
    await persistToDisk();
  }

  initialized = true;
}

async function persistToDisk() {
  const obj = Object.fromEntries(cache);
  await writeClientsFile(obj);
}

export function getClientByRfc(rfc) {
  const key = normalizeRfc(rfc);
  return cache.get(key) ?? null;
}

export async function upsertClient(payload) {
  const rfc = normalizeRfc(payload.rfc);
  const record = {
    rfc,
    legalName: String(payload.legalName || "").trim(),
    taxRegime: String(payload.taxRegime || "").trim(),
    zipCode: String(payload.zipCode || "").trim(),
    cfdiUse: String(payload.cfdiUse || "").trim(),
    email: String(payload.email || "").trim(),
    street: String(payload.street || "").trim(),
    exteriorNumber: String(payload.exteriorNumber || "").trim(),
    interiorNumber: String(payload.interiorNumber || "").trim(),
    neighborhood: String(payload.neighborhood || "").trim(),
    locality: String(payload.locality || "").trim(),
    municipality: String(payload.municipality || "").trim(),
    state: String(payload.state || "").trim(),
    country: String(payload.country || "").trim() || "México",
    updatedAt: nowIso(),
  };
  cache.set(rfc, record);
  await persistToDisk();
  return record;
}
