import { Router } from "express";
import {
  canStampWithFacturama,
  isFacturamaAuthConfigured,
  isSmtpConfigured,
  mustStampWithFacturama,
} from "../config.js";
import { upsertClient } from "../repositories/clientRepository.js";
import {
  appendInvoice,
  getInvoiceByUuid,
  getInvoicedBillableOrderIdSet,
  listInvoices,
} from "../repositories/invoiceRepository.js";
import { getBillableOrderById, markOrderInvoiced } from "../mockBillableOrders.js";
import {
  getBillableOrderByIdFromDb,
  mergeInvoiceStatusIntoOrders,
  usesBillableOrdersDatabase,
} from "../repositories/billableOrdersRepository.js";
import {
  persistCfdiArtifacts,
  readStoredArtifact,
} from "../persistence/invoiceArtifactFiles.js";
import { buildCfdi4MultiemisorPayload } from "../services/cfdiPayloadBuilder.js";
import { downloadCfdiIssued } from "../services/facturamaDownload.js";
import { sendInvoiceCfdiEmail } from "../services/invoiceEmail.js";
import {
  extractStampMeta,
  stampCfdi4Multiemisor,
} from "../services/facturamaStamp.js";
import { syncInvoiceUrlsToPosPurchaseOrder } from "../services/syncInvoiceToPosOrder.js";
import { validateReceiverPayload } from "../services/receiverValidation.js";

export const invoicesRouter = Router();

async function getBillableOrderForInvoice(orderId) {
  if (usesBillableOrdersDatabase()) {
    const raw = await getBillableOrderByIdFromDb(orderId);
    if (!raw) return null;
    const [merged] = mergeInvoiceStatusIntoOrders(
      [raw],
      getInvoicedBillableOrderIdSet()
    );
    return merged;
  }
  return getBillableOrderById(orderId);
}

/** GET /api/invoices — últimas facturas emitidas (registro local). */
invoicesRouter.get("/invoices", (_req, res) => {
  res.json({ ok: true, invoices: listInvoices() });
});

function dispositionHeader(filename, inline) {
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename="${filename}"`;
}

/**
 * GET /api/invoices/:uuid/download?format=xml|pdf
 * Query `inline=1`: Content-Disposition inline (ver en pestaña en lugar de forzar descarga).
 * Prioridad: archivos guardados en disco (`data/cfdi-files/…`); si no, Facturama issuedLite.
 */
invoicesRouter.get("/invoices/:uuid/download", async (req, res) => {
  const key = req.params.uuid;
  const format = String(req.query.format || "xml").toLowerCase();
  const inline = String(req.query.inline || "").trim() === "1";
  if (format !== "xml" && format !== "pdf") {
    return res.status(400).json({ ok: false, error: "invalid_format" });
  }

  const inv = getInvoiceByUuid(key);
  if (!inv) {
    return res.status(404).json({ ok: false, error: "invoice_not_found" });
  }

  const storedPath =
    format === "pdf" ? inv.storedPdfPath : inv.storedXmlPath;
  if (storedPath) {
    try {
      const buffer = await readStoredArtifact(storedPath);
      if (buffer && buffer.length > 0) {
        const contentType =
          format === "pdf" ? "application/pdf" : "application/xml";
        const ext = format === "pdf" ? "pdf" : "xml";
        const folio =
          inv.folio != null && inv.folio !== ""
            ? String(inv.folio)
            : "cfdi";
        const short = String(inv.uuid || key).replace(/-/g, "").slice(0, 8);
        const filename = `cfdi-${folio}-${short}.${ext}`;
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", dispositionHeader(filename, inline));
        return res.send(buffer);
      }
    } catch (e) {
      console.error("readStoredArtifact", e);
    }
  }

  if (!isFacturamaAuthConfigured()) {
    return res.status(503).json({
      ok: false,
      error: "facturama_not_configured",
      message:
        "No hay copia local del archivo y Facturama no está configurado para descargarlo.",
    });
  }

  if (inv.stampSource !== "facturama" || !inv.facturamaId) {
    return res.status(404).json({
      ok: false,
      error: "download_not_available",
      message:
        "No se encontró archivo guardado ni id Facturama para este CFDI.",
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
    res.setHeader("Content-Disposition", dispositionHeader(filename, inline));
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

  const order = await getBillableOrderForInvoice(orderId);
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

  if (!canStampWithFacturama() && mustStampWithFacturama()) {
    return res.status(503).json({
      ok: false,
      error: "facturama_required",
      message:
        "Timbrado simulación desactivado (INTIMO_REQUIRE_FACTURAMA_STAMP=1). Configura FACTURAMA_USER, FACTURAMA_PASSWORD, FACTURAMA_EMISOR_RFC y lugar de expedición válido.",
    });
  }

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

  if (!usesBillableOrdersDatabase()) {
    markOrderInvoiced(order.id);
  }

  const uuidStored =
    stampMeta?.uuid ||
    (typeof facturamaRaw?.Complement?.TaxStamp?.Uuid === "string"
      ? facturamaRaw.Complement.TaxStamp.Uuid
      : null);

  /** @type {Buffer | null} */
  let cfdiPdfBuffer = null;
  /** @type {Buffer | null} */
  let cfdiXmlBuffer = null;
  /** @type {{ storedPdfPath: string, storedXmlPath: string } | null} */
  let storedArtifacts = null;

  if (stampSource === "facturama" && facturamaRaw?.Id) {
    try {
      const [pdfR, xmlR] = await Promise.all([
        downloadCfdiIssued("pdf", facturamaRaw.Id),
        downloadCfdiIssued("xml", facturamaRaw.Id),
      ]);
      cfdiPdfBuffer = pdfR.buffer;
      cfdiXmlBuffer = xmlR.buffer;
      storedArtifacts = await persistCfdiArtifacts({
        uuid: uuidStored,
        pdfBuffer: cfdiPdfBuffer,
        xmlBuffer: cfdiXmlBuffer,
      });
      if (!storedArtifacts) {
        console.warn(
          "[invoicing] No se persistieron PDF/XML en disco (revisa permisos o buffers)."
        );
      }
    } catch (e) {
      console.error("cfdi download/persist after stamp", e);
    }
  }

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
      if (cfdiPdfBuffer && cfdiXmlBuffer) {
        try {
          await sendInvoiceCfdiEmail({
            to: emailTo,
            uuid: uuidStored || undefined,
            folio: facturamaRaw?.Folio ?? stampMeta?.folio,
            orderNumber: order.orderNumber,
            total: order.total,
            currency: order.currency,
            pdfBuffer: cfdiPdfBuffer,
            xmlBuffer: cfdiXmlBuffer,
          });
          emailDelivery.sent = true;
        } catch (err) {
          console.error("sendInvoiceCfdiEmail", err);
          emailDelivery.error = err.message || String(err);
        }
      } else {
        emailDelivery.reason = "cfdi_download_failed";
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
      storedPdfPath: storedArtifacts?.storedPdfPath ?? null,
      storedXmlPath: storedArtifacts?.storedXmlPath ?? null,
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

  if (persisted && stampSource === "facturama" && uuidStored) {
    const sync = await syncInvoiceUrlsToPosPurchaseOrder({
      billableOrderId: order.id,
      uuid: uuidStored,
    });
    if (!sync.ok && sync.reason && !["no_database", "not_pos_order_id"].includes(sync.reason)) {
      console.warn("[invoicing] No se actualizaron enlaces en pos.purchase_orders:", sync);
    }
  }

  const downloadUrls =
    uuidStored &&
    (storedArtifacts?.storedPdfPath ||
      storedArtifacts?.storedXmlPath ||
      (stampSource === "facturama" && facturamaRaw?.Id))
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
    storedArtifacts,
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
