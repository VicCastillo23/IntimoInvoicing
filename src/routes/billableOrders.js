import { Router } from "express";
import { isPublicInvoiceTokenOnly } from "../config.js";
import { checkDb } from "../db/pool.js";
import {
  filterBillableOrders,
  getBillableOrderById as getMockBillableOrderById,
  getBillableOrderByOrderNumber as getMockBillableOrderByOrderNumber,
  mockBillableOrders,
} from "../mockBillableOrders.js";
import {
  getBillableOrderByIdFromDb,
  getBillableOrderByOrderNumberFromDb,
  getBillableOrderByPublicTokenFromDb,
  listBillableOrdersFromDb,
  mergeInvoiceStatusIntoOrders,
  usesBillableOrdersDatabase,
} from "../repositories/billableOrdersRepository.js";
import { getInvoicedBillableOrderIdSet } from "../repositories/invoiceRepository.js";

export const billableOrdersRouter = Router();

/**
 * GET /api/public/billable-order
 * - ?t=UUID | ?token=UUID — enlace seguro (QR recomendado).
 * - ?orderId=pos-123 | ?id=pos-123 | ?orderNumber= | ?n= — legado / mostrador (desactivar con INTIMO_PUBLIC_INVOICE_TOKEN_ONLY=1).
 * Con DATABASE_URL: lee pos.purchase_orders. Sin URL: mock.
 */
billableOrdersRouter.get("/public/billable-order", async (req, res) => {
  const publicToken = String(req.query.t || req.query.token || "").trim();
  const orderId = String(req.query.orderId || req.query.id || "").trim();
  const orderNumber = String(
    req.query.orderNumber || req.query.n || req.query.orden || ""
  ).trim();

  if (!publicToken && !orderId && !orderNumber) {
    return res.status(400).json({
      ok: false,
      error: "order_lookup_required",
      message:
        "Indica el token del QR (t o token), o orderId / número de orden si está permitido.",
    });
  }

  try {
    const order = await resolvePublicBillableOrder({
      publicToken,
      orderId,
      orderNumber,
    });
    if (!order) {
      return res.status(404).json({ ok: false, error: "order_not_found" });
    }
    return res.json({ ok: true, order });
  } catch (e) {
    const code = e?.code;
    if (code === "NO_DATABASE") {
      return res.status(503).json({
        ok: false,
        error: "database_not_configured",
        message: e.message,
      });
    }
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({
      ok: false,
      error: "billable_order_lookup_failed",
      message: e.message || "Error al consultar la orden",
    });
  }
});

/**
 * GET /api/billable-orders?q=&status=all|pending_invoice|invoiced
 */
billableOrdersRouter.get("/billable-orders", async (req, res) => {
  const q = req.query.q;
  const status = req.query.status || "all";

  try {
    const invoicedIds = getInvoicedBillableOrderIdSet();
    let list;
    let source;

    if (usesBillableOrdersDatabase()) {
      const db = await checkDb();
      if (!db.configured || !db.ok) {
        return res.status(503).json({
          ok: false,
          error: "database_unavailable",
          message: db.message || "PostgreSQL no disponible",
        });
      }
      list = await listBillableOrdersFromDb({
        q,
        status,
        invoicedBillableIds: invoicedIds,
      });
      source = "postgresql";
    } else {
      list = filterBillableOrders(mockBillableOrders, q);
      if (status === "pending_invoice") {
        list = list.filter((o) => o.status === "pending_invoice");
      } else if (status === "invoiced") {
        list = list.filter((o) => o.status === "invoiced");
      }
      list = mergeInvoiceStatusIntoOrders(list, invoicedIds);
      source = "mock";
    }

    list = [...list].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json({
      ok: true,
      query: q || null,
      statusFilter: status,
      count: list.length,
      orders: list,
      source,
    });
  } catch (e) {
    console.error("billable-orders", e);
    res.status(500).json({
      ok: false,
      error: "billable_orders_failed",
      message: e.message || String(e),
    });
  }
});

/**
 * @param {{ publicToken?: string, orderId?: string, orderNumber?: string }} p
 */
async function resolvePublicBillableOrder(p) {
  const tokenOnly = isPublicInvoiceTokenOnly();
  if (tokenOnly && (p.orderId || p.orderNumber)) {
    const err = new Error(
      "Solo se permite búsqueda con el enlace seguro (parámetro t o token)."
    );
    err.status = 400;
    throw err;
  }
  if (tokenOnly && !p.publicToken) {
    const err = new Error("Indica el token del enlace (t o token).");
    err.status = 400;
    throw err;
  }

  const invoicedIds = getInvoicedBillableOrderIdSet();
  if (usesBillableOrdersDatabase()) {
    const db = await checkDb();
    if (!db.configured || !db.ok) {
      const err = new Error(db.message || "PostgreSQL no disponible");
      err.status = 503;
      throw err;
    }
    let raw = null;
    if (p.publicToken) {
      raw = await getBillableOrderByPublicTokenFromDb(p.publicToken);
    } else if (p.orderId) {
      raw = await getBillableOrderByIdFromDb(p.orderId);
    } else if (p.orderNumber) {
      raw = await getBillableOrderByOrderNumberFromDb(p.orderNumber);
    }
    if (!raw) return null;
    const [merged] = mergeInvoiceStatusIntoOrders([raw], invoicedIds);
    return merged;
  }
  if (p.publicToken) return null;
  const order = p.orderId
    ? getMockBillableOrderById(p.orderId)
    : getMockBillableOrderByOrderNumber(p.orderNumber);
  return order;
}
