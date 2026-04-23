/**
 * Registro local de CFDI emitidos (UUID, id Facturama, orden) — sustituible por PostgreSQL.
 */
import { readInvoicesFile, writeInvoicesFile } from "../persistence/fileInvoicePersistence.js";

/** @type {object[]} */
let cache = [];
let initialized = false;

export async function initInvoiceRepository() {
  if (initialized) return;
  cache = await readInvoicesFile();
  initialized = true;
}

export async function appendInvoice(record) {
  const row = {
    ...record,
    storedAt: new Date().toISOString(),
  };
  cache.unshift(row);
  await writeInvoicesFile(cache);
  return row;
}

export function listInvoices() {
  return [...cache];
}

/** Busca por UUID SAT o por referencia local (mock). */
export function getInvoiceByUuid(uuidOrReference) {
  const u = String(uuidOrReference || "").toLowerCase();
  return (
    cache.find((x) => String(x.uuid || "").toLowerCase() === u) ||
    cache.find((x) => String(x.reference || "").toLowerCase() === u) ||
    null
  );
}

/** Ids de ticket usados en UI (`pos-123` o legado mock `ord-…`) con CFDI guardado. */
export function getInvoicedBillableOrderIdSet() {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const inv of cache) {
    const oid = inv?.order?.id;
    if (oid == null || String(oid).trim() === "") continue;
    ids.add(String(oid).trim());
  }
  return ids;
}
