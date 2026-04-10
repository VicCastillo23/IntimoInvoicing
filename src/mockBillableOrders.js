/**
 * Datos de ejemplo para órdenes facturables (hasta conectar PostgreSQL / POS).
 */
export const mockBillableOrders = [
  {
    id: "ord-001",
    orderNumber: "1042",
    date: "2026-04-01T14:32:00.000Z",
    total: "186.50",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 4",
    description: "Consumo en salón · 3 ítems",
  },
  {
    id: "ord-002",
    orderNumber: "1043",
    date: "2026-04-01T13:15:00.000Z",
    total: "92.00",
    currency: "MXN",
    status: "invoiced",
    tableName: "Barra 1",
    description: "Para llevar · 2 ítems",
  },
  {
    id: "ord-003",
    orderNumber: "1040",
    date: "2026-03-31T19:45:00.000Z",
    total: "412.00",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 8",
    description: "Cena · 6 ítems",
  },
  {
    id: "ord-004",
    orderNumber: "1038",
    date: "2026-03-31T11:20:00.000Z",
    total: "55.00",
    currency: "MXN",
    status: "invoiced",
    tableName: "Terraza 2",
    description: "Desayuno · 2 ítems",
  },
  {
    id: "ord-005",
    orderNumber: "1045",
    date: "2026-04-01T10:05:00.000Z",
    total: "128.00",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 2",
    description: "Desayuno · 2 ítems",
  },
  {
    id: "ord-006",
    orderNumber: "1046",
    date: "2026-04-01T11:40:00.000Z",
    total: "245.75",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Barra 3",
    description: "Bebidas de especialidad · 4 ítems",
  },
  {
    id: "ord-007",
    orderNumber: "1047",
    date: "2026-04-01T12:15:00.000Z",
    total: "78.50",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Para llevar",
    description: "Pedido mostrador · 2 ítems",
  },
  {
    id: "ord-008",
    orderNumber: "1048",
    date: "2026-04-01T13:00:00.000Z",
    total: "512.00",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 12",
    description: "Grupo · 8 ítems",
  },
  {
    id: "ord-009",
    orderNumber: "1049",
    date: "2026-04-01T14:22:00.000Z",
    total: "34.00",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Terraza 1",
    description: "Café y pan · 2 ítems",
  },
  {
    id: "ord-010",
    orderNumber: "1050",
    date: "2026-04-01T15:50:00.000Z",
    total: "199.90",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 6",
    description: "Comida · 5 ítems",
  },
  {
    id: "ord-011",
    orderNumber: "1051",
    date: "2026-04-01T16:30:00.000Z",
    total: "67.25",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mostrador",
    description: "Postres · 3 ítems",
  },
  {
    id: "ord-012",
    orderNumber: "1052",
    date: "2026-04-01T17:45:00.000Z",
    total: "301.00",
    currency: "MXN",
    status: "pending_invoice",
    tableName: "Mesa 1",
    description: "Cena · 4 ítems",
  },
];

export function getBillableOrderById(id) {
  return mockBillableOrders.find((o) => o.id === id) ?? null;
}

/** Coincidencia exacta por número de ticket visible (p. ej. "1042"). */
export function getBillableOrderByOrderNumber(orderNumber) {
  const s = String(orderNumber || "").trim();
  if (!s) return null;
  return mockBillableOrders.find((o) => String(o.orderNumber) === s) ?? null;
}

export function markOrderInvoiced(id) {
  const o = mockBillableOrders.find((x) => x.id === id);
  if (o) o.status = "invoiced";
  return o ?? null;
}

export function filterBillableOrders(orders, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return orders;
  return orders.filter((o) => {
    const haystack = [
      o.orderNumber,
      o.tableName,
      o.description,
      o.id,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
