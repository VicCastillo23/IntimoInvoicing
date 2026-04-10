/**
 * Prueba SMTP (Gmail): envía un correo de prueba desde SMTP_FROM.
 * Uso: node scripts/smtp-ping.mjs [destino@correo.com]
 * Por defecto envía a la misma cuenta SMTP_FROM.
 */
import "dotenv/config";
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST?.trim();
const from = process.env.SMTP_FROM?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();

if (!host || !from) {
  console.error("Falta SMTP_HOST o SMTP_FROM en .env");
  process.exit(1);
}
if (!user || !pass) {
  console.error("Falta SMTP_USER o SMTP_PASS (Gmail: contraseña de aplicación).");
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT) || 587;
const secure = process.env.SMTP_SECURE === "true" || String(port) === "465";
const gmail = /smtp\.gmail\.com/i.test(host);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  requireTLS: gmail && !secure && port === 587,
});

const to = process.argv[2]?.trim() || from;
const name = process.env.SMTP_FROM_NAME?.trim() || "Íntimo Café";

await transporter.sendMail({
  from: `"${name.replace(/"/g, "")}" <${from}>`,
  to,
  subject: "[Prueba] IntimoInvoicing — SMTP OK",
  text: "Si lees esto, la configuración SMTP (Gmail) funciona.",
});

console.log(`Enviado de ${from} a ${to}`);
