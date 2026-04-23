/**
 * Escribe en pos.purchase_orders las URLs públicas de descarga PDF/XML del CFDI,
 * para que IntimoAccounting las muestre al armar pólizas desde tickets del día.
 */
import { getPool } from "../db/pool.js";

/**
 * @param {{ billableOrderId: string, uuid: string | null }} p
 * @returns {Promise<{ ok: boolean, reason?: string, rowCount?: number }>}
 */
export async function syncInvoiceUrlsToPosPurchaseOrder({ billableOrderId, uuid }) {
  const pool = getPool();
  if (!pool) {
    return { ok: false, reason: "no_database" };
  }
  const m = /^pos-(\d+)$/i.exec(String(billableOrderId || "").trim());
  if (!m) {
    return { ok: false, reason: "not_pos_order_id" };
  }
  const posId = Number(m[1]);
  const u = String(uuid || "").trim();
  const base = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!u || !base) {
    return { ok: false, reason: "missing_public_base_or_uuid" };
  }

  const pdf = `${base}/api/invoices/${encodeURIComponent(u)}/download?format=pdf`;
  const xml = `${base}/api/invoices/${encodeURIComponent(u)}/download?format=xml`;

  try {
    const r = await pool.query(
      `
      UPDATE pos.purchase_orders
      SET
        cfdi_uuid = $1,
        invoice_pdf_url = $2,
        invoice_xml_url = $3,
        updated_at = now()
      WHERE id = $4
      `,
      [u, pdf, xml, posId]
    );
    if (r.rowCount === 0) {
      return { ok: false, reason: "pos_order_not_found", rowCount: 0 };
    }
    return { ok: true, rowCount: r.rowCount };
  } catch (e) {
    console.error("syncInvoiceUrlsToPosPurchaseOrder", e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
