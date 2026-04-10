import { Router } from "express";
import {
  canStampWithFacturama,
  isFacturamaAuthConfigured,
  isSmtpConfigured,
} from "../config.js";
import { upsertClient } from "../repositories/clientRepository.js";
import {
  appendInvoice,
  getInvoiceByUuid,
  listInvoices,
} from "../repositories/invoiceRepository.js";
import { getBillableOrderById, markOrderInvoiced } from "../mockBillableOrders.js";
import { buildCfdi4MultiemisorPayload } from "../services/cfdiPayloadBuilder.js";
import { downloadCfdiIssued } from "../services/facturamaDownload.js";
import { sendInvoiceCfdiEmail } from "../services/invoiceEmail.js";
import {
  extractStampMeta,
  stampCfdi4Multiemisor,
} from "../services/facturamaStamp.js";
import { validateReceiverPayload } from "../services/receiverValidation.js";

export const invoicesRouter = Router();

/** GET /api/invoices — últimas facturas emitidas (registro local). */
invoicesRouter.get("/invoices", (_req, res) => {
  res.json({ ok: true, invoices: listInvoices() });
});

/**
 * GET /api/invoices/:uuid/download?format=xml|pdf
 * Solo CFDI timbrados en Facturama (id guardado al emitir).
 */
invoicesRouter.get("/invoices/:uuid/download", async (req, res) => {
  const key = req.params.uuid;
  const format = String(req.query.format || "xml").toLowerCase();
  if (format !== "xml" && format !== "pdf") {
    return res.status(400).json({ ok: false, error: "invalid_format" });
  }

  if (!isFacturamaAuthConfigured()) {
    return res.status(503).json({
      ok: false,
      error: "facturama_not_configured",
      message: "Credenciales Facturama no configuradas.",
    });
  }

  const inv = getInvoiceByUuid(key);
  if (!inv) {
    return res.status(404).json({ ok: false, error: "invoice_not_found" });
  }
  if (inv.stampSource !== "facturama" || !inv.facturamaId) {
    return res.status(404).json({
      ok: false,
      error: "download_not_available",
      message:
        "Solo CFDI timbrados en Facturama tienen XML/PDF descargable aquí.",
    });
  }

  try {
    const { buffer, contentType } = await downloadCfdiIssued(
      format,
      inv.facturamaId
    );
    const ext = format === "pdf" ? "pdf" : "xml";
    const folio =
      inv.folio != null && inv.folio !== ""
        ? String(inv.folio)
        : "cfdi";
    const short = String(inv.uuid || key).replace(/-/g, "").slice(0, 8);
    const filename = `cfdi-${folio}-${short}.${ext}`;
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(buffer);
  } catch (e) {
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status < 600
        ? e.status
        : 502;
    res.status(status).json({
      ok: false,
      error: "download_failed",
      message: e.message || "Error al descargar",
    });
  }
});

/**
 * POST /api/invoices/request
 * Si `canStampWithFacturama()` timbra en Facturama (sandbox/prod); si no, respuesta mock.
 */
invoicesRouter.post("/invoices/request", async (req, res) => {
  const body = req.body || {};
  const orderId = String(body.orderId || "").trim();
  const receiver = body.receiver || {};

  if (!orderId) {
    return res.status(400).json({ ok: false, error: "order_id_required" });
  }

  const order = getBillableOrderById(orderId);
  if (!order) {
    return res.status(404).json({ ok: false, error: "order_not_found" });
  }

  if (order.status !== "pending_invoice") {
    return res.status(409).json({
      ok: false,
      error: "order_not_billable",
      message: "La orden no está pendiente de factura",
    });
  }

  const v = validateReceiverPayload(
    {
      rfc: receiver.rfc,
      legalName: receiver.legalName,
      taxRegime: receiver.taxRegime,
      zipCode: receiver.zipCode,
      cfdiUse: receiver.cfdiUse,
      email: receiver.email,
      street: receiver.street,
      exteriorNumber: receiver.exteriorNumber,
      interiorNumber: receiver.interiorNumber,
      neighborhood: receiver.neighborhood,
      locality: receiver.locality,
      municipality: receiver.municipality,
      state: receiver.state,
      country: receiver.country,
    },
    { requireFullReceiver: true }
  );

  if (!v.ok) {
    return res.status(422).json({
      ok: false,
      errors: v.errors,
      rfcMeta: v.rfcMeta,
    });
  }

  const rfc = v.rfcMeta.normalized;
  const legalName = String(receiver.legalName || "").trim();
  const taxRegime = String(receiver.taxRegime || "").trim();
  const zipCode = String(receiver.zipCode || "").trim();
  const cfdiUse = String(receiver.cfdiUse || "").trim();
  const street = String(receiver.street || "").trim();
  const exteriorNumber = String(receiver.exteriorNumber || "").trim();
  const interiorNumber = String(receiver.interiorNumber || "").trim();
  const neighborhood = String(receiver.neighborhood || "").trim();
  const locality = String(receiver.locality || "").trim();
  const municipality = String(receiver.municipality || "").trim();
  const state = String(receiver.state || "").trim();
  const country = String(receiver.country || "").trim() || "México";

  const saveForLater = body.saveClient !== false;
  if (saveForLater) {
    await upsertClient({
      rfc,
      legalName,
      taxRegime,
      zipCode,
      cfdiUse,
      email: receiver.email,
      street,
      exteriorNumber,
      interiorNumber,
      neighborhood,
      locality,
      municipality,
      state,
      country,
    });
  }

  const receiverPayload = {
    rfc,
    legalName,
    taxRegime,
    zipCode,
    cfdiUse,
    street,
    exteriorNumber,
    interiorNumber,
    neighborhood,
    locality,
    municipality,
    state,
    country,
  };

  let stampSource = "mock";
  /** @type {string} */
  let reference = `MOCK-${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;
  let message =
    "Solicitud registrada en modo simulación. Configura credenciales y emisor en .env para timbrar con Facturama.";
  /** @type {Record<string, unknown> | null} */
  let facturamaRaw = null;
  let stampMeta = null;

  if (canStampWithFacturama()) {
    try {
      const cfdiBody = buildCfdi4MultiemisorPayload(order, receiverPayload);
      facturamaRaw = await stampCfdi4Multiemisor(cfdiBody);
      stampMeta = extractStampMeta(facturamaRaw);
      stampSource = "facturama";
      reference = stampMeta.uuid || stampMeta.id || reference;
      message = `CFDI timbrado en Facturama (${process.env.FACTURAMA_API_URL || "sandbox"}).`;
    } catch (e) {
      const status =
        typeof e.status === "number" && e.status >= 400 && e.status < 600
          ? e.status
          : 502;
      return res.status(status).json({
        ok: false,
        error: "facturama_stamp_failed",
        message: e.message || "Error al timbrar con Facturama",
        details: e.body || null,
      });
    }
  }

  markOrderInvoiced(order.id);

  const uuidStored =
    stampMeta?.uuid ||
    (typeof facturamaRaw?.Complement?.TaxStamp?.Uuid === "string"
      ? facturamaRaw.Complement.TaxStamp.Uuid
      : null);

  const emailDelivery = {
    sent: false,
    skipped: true,
    reason: /** @type {string | null} */ (null),
    error: /** @type {string | null} */ (null),
  };

  const emailTo = String(receiver.email || "").trim();
  if (stampSource === "facturama" && facturamaRaw?.Id) {
    if (!emailTo) {
      emailDelivery.reason = "no_recipient_email";
    } else if (!isSmtpConfigured()) {
      emailDelivery.skipped = false;
      emailDelivery.reason = "smtp_not_configured";
    } else {
      emailDelivery.skipped = false;
      try {
        const [pdfR, xmlR] = await Promise.all([
          downloadCfdiIssued("pdf", facturamaRaw.Id),
          downloadCfdiIssued("xml", facturamaRaw.Id),
        ]);
        await sendInvoiceCfdiEmail({
          to: emailTo,
          uuid: uuidStored || undefined,
          folio: facturamaRaw?.Folio ?? stampMeta?.folio,
          orderNumber: order.orderNumber,
          total: order.total,
          currency: order.currency,
          pdfBuffer: pdfR.buffer,
          xmlBuffer: xmlR.buffer,
        });
        emailDelivery.sent = true;
      } catch (err) {
        console.error("sendInvoiceCfdiEmail", err);
        emailDelivery.error = err.message || String(err);
      }
    }
  } else if (stampSource === "mock") {
    emailDelivery.reason = "mock_stamp";
  }

  let persisted = true;
  try {
    await appendInvoice({
      uuid: uuidStored,
      facturamaId: facturamaRaw?.Id ?? stampMeta?.id ?? null,
      stampSource,
      reference,
      serie: facturamaRaw?.Serie ?? stampMeta?.serie ?? null,
      folio: facturamaRaw?.Folio ?? stampMeta?.folio ?? null,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
      },
      receiver: {
        rfc,
        legalName,
        taxRegime,
        zipCode,
        cfdiUse,
        email: String(receiver.email || "").trim(),
        street,
        exteriorNumber,
        interiorNumber,
        neighborhood,
        locality,
        municipality,
        state,
        country,
      },
    });
  } catch (err) {
    console.error("appendInvoice", err);
    persisted = false;
  }

  const downloadUrls =
    stampSource === "facturama" && uuidStored && facturamaRaw?.Id
      ? {
          xml: `/api/invoices/${encodeURIComponent(uuidStored)}/download?format=xml`,
          pdf: `/api/invoices/${encodeURIComponent(uuidStored)}/download?format=pdf`,
        }
      : null;

  return res.status(201).json({
    ok: true,
    stampSource,
    reference,
    message,
    persisted,
    email: emailDelivery,
    downloadUrls,
    facturama: facturamaRaw
      ? {
          id: facturamaRaw.Id,
          uuid: facturamaRaw?.Complement?.TaxStamp?.Uuid,
          serie: facturamaRaw.Serie,
          folio: facturamaRaw.Folio,
          date: facturamaRaw.Date,
          total: facturamaRaw.Total,
        }
      : null,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
    },
    receiver: {
      rfc,
      legalName,
      taxRegime,
      zipCode,
      cfdiUse,
      email: String(receiver.email || "").trim(),
      street,
      exteriorNumber,
      interiorNumber,
      neighborhood,
      locality,
      municipality,
      state,
      country,
    },
  });
});
