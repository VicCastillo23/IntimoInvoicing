import { Router } from "express";
import {
  filterBillableOrders,
  getBillableOrderById,
  getBillableOrderByOrderNumber,
  mockBillableOrders,
} from "../mockBillableOrders.js";

export const billableOrdersRouter = Router();

/**
 * GET /api/public/billable-order?orderId=ord-xxx | ?orderNumber=1042
 * Vista cliente / QR: devuelve una sola orden (sin listados). En producción usar token opaco.
 */
billableOrdersRouter.get("/public/billable-order", (req, res) => {
  const orderId = String(req.query.orderId || "").trim();
  const orderNumber = String(req.query.orderNumber || "").trim();

  if (!orderId && !orderNumber) {
    return res.status(400).json({
      ok: false,
      error: "order_id_or_number_required",
      message: "Indica orderId o orderNumber",
    });
  }

  const order = orderId
    ? getBillableOrderById(orderId)
    : getBillableOrderByOrderNumber(orderNumber);

  if (!order) {
    return res.status(404).json({ ok: false, error: "order_not_found" });
  }

  return res.json({ ok: true, order });
});

/**
 * GET /api/billable-orders?q=&status=all|pending_invoice|invoiced
 */
billableOrdersRouter.get("/billable-orders", (req, res) => {
  const q = req.query.q;
  const status = req.query.status || "all";

  let list = filterBillableOrders(mockBillableOrders, q);

  if (status === "pending_invoice") {
    list = list.filter((o) => o.status === "pending_invoice");
  } else if (status === "invoiced") {
    list = list.filter((o) => o.status === "invoiced");
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
  });
});
