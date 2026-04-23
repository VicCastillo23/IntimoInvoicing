import { Router } from "express";
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
  listBillableOrdersFromDb,
  mergeInvoiceStatusIntoOrders,
  usesBillableOrdersDatabase,
} from "../repositories/billableOrdersRepository.js";
import { getInvoicedBillableOrderIdSet } from "../repositories/invoiceRepository.js";

export const billableOrdersRouter = Router();

/**
 * GET /api/public/billable-order?orderId=pos-123 | ?orderNumber=1042
 * Con DATABASE_URL: lee pos.purchase_orders (IntimoAccounting). Sin URL: mock.
 */
billableOrdersRouter.get("/public/billable-order", async (req, res) => {
  const orderId = String(req.query.orderId || "").trim();
  const orderNumber = String(req.query.orderNumber || "").trim();

  if (!orderId && !orderNumber) {
    return res.status(400).json({
      ok: false,
      error: "order_id_or_number_required",
      message: "Indica orderId o orderNumber",
    });
  }

  try {
    const order = await resolvePublicBillableOrder({ orderId, orderNumber });
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
 * @param {{ orderId?: string, orderNumber?: string }} p
 */
async function resolvePublicBillableOrder(p) {
  const invoicedIds = getInvoicedBillableOrderIdSet();
  if (usesBillableOrdersDatabase()) {
    const db = await checkDb();
    if (!db.configured || !db.ok) {
      const err = new Error(db.message || "PostgreSQL no disponible");
      err.status = 503;
      throw err;
    }
    const raw = p.orderId
      ? await getBillableOrderByIdFromDb(p.orderId)
      : await getBillableOrderByOrderNumberFromDb(p.orderNumber);
    if (!raw) return null;
    const [merged] = mergeInvoiceStatusIntoOrders([raw], invoicedIds);
    return merged;
  }
  const order = p.orderId
    ? getMockBillableOrderById(p.orderId)
    : getMockBillableOrderByOrderNumber(p.orderNumber);
  return order;
}
