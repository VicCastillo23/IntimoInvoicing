/**
 * Tickets facturables desde PostgreSQL (misma base que IntimoAccounting: pos.purchase_orders).
 */
import { getPool } from "../db/pool.js";

const POS_SOURCES = ["intimo_pos", "intimo_pos_split"];

/** UUID estándar (gen_random_uuid), minúsculas para consulta. */
function normalizePublicInvoiceToken(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
  ) {
    return "";
  }
  return s;
}

function publicInvoiceClientUrlFromDbToken(dbToken) {
  const t = normalizePublicInvoiceToken(dbToken);
  if (!t) return "";
  const base = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return "";
  return `${base}/cliente.html?t=${encodeURIComponent(t)}`;
}

export function usesBillableOrdersDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * @param {Set<string> | string[]} invoicedBillableIds ids tipo `pos-123` guardados en facturas locales
 */
export async function listBillableOrdersFromDb({
  q = "",
  status = "all",
  invoicedBillableIds = new Set(),
}) {
  const pool = getPool();
  if (!pool) {
    const err = new Error("DATABASE_URL no configurada");
    err.code = "NO_DATABASE";
    throw err;
  }

  const invoicedNumeric = [];
  for (const id of invoicedBillableIds) {
    const m = /^pos-(\d+)$/i.exec(String(id).trim());
    if (m) invoicedNumeric.push(Number(m[1]));
  }
  const invoicedArr =
    invoicedNumeric.length > 0 ? invoicedNumeric : [];

  const likeRaw = String(q || "").trim().replace(/[%_\\]/g, "");
  const params = [POS_SOURCES];
  const parts = [
    `SELECT
      po.id,
      po.external_id,
      po.occurred_at,
      po.currency,
      po.total,
      COALESCE(NULLIF(BTRIM(po.public_invoice_token::text), ''), '') AS public_invoice_token,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'orderNumber'), ''), '') AS order_number,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'tableName'), ''), '—') AS table_name,
      (SELECT COUNT(*)::int FROM pos.purchase_lines pl WHERE pl.order_id = po.id) AS line_count
    FROM pos.purchase_orders po
    WHERE po.source = ANY($1::text[])`,
  ];

  if (likeRaw.length > 0) {
    params.push(`%${likeRaw}%`);
    parts.push(`AND (
      COALESCE(po.raw_payload->>'orderNumber','') ILIKE $${params.length}
      OR COALESCE(po.raw_payload->>'tableName','') ILIKE $${params.length}
      OR po.external_id ILIKE $${params.length}
      OR CAST(po.id AS TEXT) ILIKE $${params.length}
    )`);
  }

  if (status === "pending_invoice" || status === "invoiced") {
    params.push(invoicedArr);
    const invoicedIdx = params.length;
    if (status === "pending_invoice") {
      parts.push(`AND NOT (po.id = ANY($${invoicedIdx}::bigint[]))`);
    } else {
      parts.push(`AND po.id = ANY($${invoicedIdx}::bigint[])`);
    }
  }

  const limit = Math.min(
    500,
    Math.max(1, Number(process.env.BILLABLE_ORDERS_LIMIT) || 300)
  );
  parts.push(`ORDER BY po.occurred_at DESC LIMIT ${limit}`);

  const sql = parts.join("\n");
  const { rows } = await pool.query(sql, params);
  const invoicedSet = new Set(invoicedNumeric);
  return rows.map((r) => mapRowToBillableOrder(r, invoicedSet));
}

/**
 * @param {string} orderId ej. pos-42
 */
export async function getBillableOrderByIdFromDb(orderId) {
  const pool = getPool();
  if (!pool) {
    const err = new Error("DATABASE_URL no configurada");
    err.code = "NO_DATABASE";
    throw err;
  }
  const raw = String(orderId || "").trim();
  let numericId = null;
  const m = /^pos-(\d+)$/i.exec(raw);
  if (m) numericId = Number(m[1]);
  else if (/^\d+$/.test(raw)) numericId = Number(raw);

  if (numericId == null || !Number.isFinite(numericId)) {
    return null;
  }

  const sql = `
    SELECT
      po.id,
      po.external_id,
      po.occurred_at,
      po.currency,
      po.total,
      COALESCE(NULLIF(BTRIM(po.public_invoice_token::text), ''), '') AS public_invoice_token,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'orderNumber'), ''), '') AS order_number,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'tableName'), ''), '—') AS table_name,
      (SELECT COUNT(*)::int FROM pos.purchase_lines pl WHERE pl.order_id = po.id) AS line_count
    FROM pos.purchase_orders po
    WHERE po.id = $1 AND po.source = ANY($2::text[])
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [numericId, POS_SOURCES]);
  if (!rows.length) return null;
  return mapRowToBillableOrder(rows[0], null);
}

/**
 * Coincidencia por número de orden visible en ticket (raw_payload.orderNumber).
 */
export async function getBillableOrderByOrderNumberFromDb(orderNumber) {
  const pool = getPool();
  if (!pool) {
    const err = new Error("DATABASE_URL no configurada");
    err.code = "NO_DATABASE";
    throw err;
  }
  const num = String(orderNumber || "").trim();
  if (!num) return null;

  const sql = `
    SELECT
      po.id,
      po.external_id,
      po.occurred_at,
      po.currency,
      po.total,
      COALESCE(NULLIF(BTRIM(po.public_invoice_token::text), ''), '') AS public_invoice_token,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'orderNumber'), ''), '') AS order_number,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'tableName'), ''), '—') AS table_name,
      (SELECT COUNT(*)::int FROM pos.purchase_lines pl WHERE pl.order_id = po.id) AS line_count
    FROM pos.purchase_orders po
    WHERE po.source = ANY($1::text[])
      AND TRIM(po.raw_payload->>'orderNumber') = $2
    ORDER BY po.occurred_at DESC
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [POS_SOURCES, num]);
  if (!rows.length) return null;
  return mapRowToBillableOrder(rows[0], null);
}

/**
 * Búsqueda por token opaco (QR cliente). Ver migración `12_purchase_order_public_token.sql`.
 * @param {string} token UUID en texto
 */
export async function getBillableOrderByPublicTokenFromDb(token) {
  const pool = getPool();
  if (!pool) {
    const err = new Error("DATABASE_URL no configurada");
    err.code = "NO_DATABASE";
    throw err;
  }
  const normalized = normalizePublicInvoiceToken(token);
  if (!normalized) return null;

  const sql = `
    SELECT
      po.id,
      po.external_id,
      po.occurred_at,
      po.currency,
      po.total,
      COALESCE(NULLIF(BTRIM(po.public_invoice_token::text), ''), '') AS public_invoice_token,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'orderNumber'), ''), '') AS order_number,
      COALESCE(NULLIF(TRIM(po.raw_payload->>'tableName'), ''), '—') AS table_name,
      (SELECT COUNT(*)::int FROM pos.purchase_lines pl WHERE pl.order_id = po.id) AS line_count
    FROM pos.purchase_orders po
    WHERE po.source = ANY($1::text[])
      AND LOWER(BTRIM(po.public_invoice_token::text)) = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [POS_SOURCES, normalized]);
  if (!rows.length) return null;
  return mapRowToBillableOrder(rows[0], null);
}

/**
 * @param {import("pg").QueryResultRow} r
 * @param {Set<number> | null} invoicedNumeric if null, status queda pending_invoice (fusionar después)
 */
function mapRowToBillableOrder(r, invoicedNumeric) {
  const id = `pos-${r.id}`;
  const orderNumber =
    r.order_number && String(r.order_number).trim() !== ""
      ? String(r.order_number).trim()
      : String(r.id);
  const totalNum = Number(r.total);
  const total = Number.isFinite(totalNum) ? totalNum.toFixed(2) : String(r.total);
  const lineCount = Number(r.line_count) || 0;
  const description =
    lineCount > 0
      ? `Consumo POS · ${lineCount} ítem(s)`
      : "Consumo POS";

  let status = "pending_invoice";
  if (invoicedNumeric && invoicedNumeric.has(Number(r.id))) {
    status = "invoiced";
  }

  return {
    id,
    orderNumber,
    date:
      r.occurred_at instanceof Date
        ? r.occurred_at.toISOString()
        : new Date(r.occurred_at).toISOString(),
    total,
    currency: String(r.currency || "MXN").trim() || "MXN",
    status,
    tableName: String(r.table_name || "—"),
    description,
    publicInvoiceUrl: publicInvoiceClientUrlFromDbToken(r.public_invoice_token),
  };
}

/**
 * Aplica estado facturado según ids de orden en registro local de facturas (`order.id`).
 * @param {object[]} orders
 * @param {Set<string> | Iterable<string>} invoicedBillableIds
 */
export function mergeInvoiceStatusIntoOrders(orders, invoicedBillableIds) {
  const ids = new Set(
    [...invoicedBillableIds].map((x) => String(x).trim()).filter(Boolean)
  );
  return orders.map((o) => {
    const oid = String(o.id).trim();
    const fromFile = ids.has(oid);
    const invoiced = fromFile || o.status === "invoiced";
    return {
      ...o,
      status: invoiced ? "invoiced" : "pending_invoice",
    };
  });
}
