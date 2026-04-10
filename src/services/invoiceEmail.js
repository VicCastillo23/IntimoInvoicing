/**
 * Envío del CFDI timbrado por correo propio (SMTP), con adjuntos PDF + XML desde Facturama.
 */
import nodemailer from "nodemailer";
import { isSmtpConfigured } from "../config.js";

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const gmail = /smtp\.gmail\.com/i.test(host || "");
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass != null && pass !== "" ? { user, pass } : undefined,
    /** Gmail (587): STARTTLS; evita fallos en algunos entornos. */
    requireTLS: gmail && !secure && port === 587,
  });
}

function safeFilePart(s) {
  return String(s || "cfdi")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 80);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFromHeader() {
  const raw = process.env.SMTP_FROM?.trim() || "";
  if (raw.includes("<") && raw.includes(">")) {
    return raw;
  }
  const name = process.env.SMTP_FROM_NAME?.trim() || "Facturación Íntimo";
  return `"${name.replace(/"/g, "")}" <${raw}>`;
}

/**
 * @param {object} p
 * @param {string} p.to
 * @param {string} [p.uuid]
 * @param {string|number} [p.folio]
 * @param {string} p.orderNumber
 * @param {string|number} p.total
 * @param {string} [p.currency]
 * @param {Buffer} p.pdfBuffer
 * @param {Buffer} p.xmlBuffer
 */
export async function sendInvoiceCfdiEmail(p) {
  if (!isSmtpConfigured()) {
    const err = new Error("SMTP no configurado (SMTP_HOST / SMTP_FROM)");
    err.code = "smtp_not_configured";
    throw err;
  }

  const transporter = createTransport();
  const folioShort = safeFilePart(p.folio ?? p.orderNumber);
  const uuidShort = safeFilePart(
    String(p.uuid || "").replace(/-/g, "").slice(0, 12) || "cfdi"
  );

  const subject =
    process.env.SMTP_MAIL_SUBJECT?.trim() ||
    `Factura electrónica (CFDI) — Pedido ${p.orderNumber}`;

  const lines = [
    "Adjuntamos tu comprobante fiscal digital (CFDI) en PDF y XML.",
    "",
    `Pedido: ${p.orderNumber}`,
    `Total: ${p.total} ${p.currency || "MXN"}`,
  ];
  if (p.uuid) lines.push(`UUID: ${p.uuid}`);
  lines.push(
    "",
    "Este mensaje se generó de forma automática. Si no solicitaste esta factura, ignora el correo."
  );

  const html = `<p>Adjuntamos tu <strong>comprobante fiscal digital (CFDI)</strong> en PDF y XML.</p>
<ul>
<li><strong>Pedido:</strong> ${escapeHtml(p.orderNumber)}</li>
<li><strong>Total:</strong> ${escapeHtml(String(p.total))} ${escapeHtml(p.currency || "MXN")}</li>
${
  p.uuid
    ? `<li><strong>UUID:</strong> ${escapeHtml(p.uuid)}</li>`
    : ""
}</ul>`;

  await transporter.sendMail({
    from: buildFromHeader(),
    to: p.to,
    subject,
    text: lines.join("\n"),
    html,
    attachments: [
      {
        filename: `cfdi-${folioShort}-${uuidShort}.pdf`,
        content: p.pdfBuffer,
      },
      {
        filename: `cfdi-${folioShort}-${uuidShort}.xml`,
        content: p.xmlBuffer,
      },
    ],
  });
}
