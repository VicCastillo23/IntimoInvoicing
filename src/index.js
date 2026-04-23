import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  canStampWithFacturama,
  isCsdConfigured,
  isFacturamaAuthConfigured,
  isSmtpConfigured,
  mustStampWithFacturama,
} from "./config.js";
import { checkDb } from "./db/pool.js";
import { usesBillableOrdersDatabase } from "./repositories/billableOrdersRepository.js";
import { initClientRepository } from "./repositories/clientRepository.js";
import { initInvoiceRepository } from "./repositories/invoiceRepository.js";
import { billableOrdersRouter } from "./routes/billableOrders.js";
import { clientsRouter } from "./routes/clients.js";
import { invoicesRouter } from "./routes/invoices.js";
import { validationRouter } from "./routes/validation.js";
import { catalogsRouter } from "./routes/catalogs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;

await initClientRepository();
await initInvoiceRepository();

app.use(express.json());

app.get("/health", async (_req, res) => {
  const db = await checkDb();
  res.json({
    ok: true,
    service: "intimo-invoicing",
    env: process.env.NODE_ENV || "development",
    billableOrdersSource: usesBillableOrdersDatabase()
      ? "postgresql"
      : "mock",
    database: db,
    facturamaApiUrl: process.env.FACTURAMA_API_URL || null,
    facturamaAuthConfigured: isFacturamaAuthConfigured(),
    csdConfigured: isCsdConfigured(),
    facturamaStampReady: canStampWithFacturama(),
    requireFacturamaStamp: mustStampWithFacturama(),
    clientStore: "file",
    clientStoreNote:
      "Receptores en `data/clients.json` (modelo propio, independiente del PAC).",
    invoiceStore: "file",
    invoiceStoreNote:
      "CFDI emitidos en `data/invoices.json` (UUID, id Facturama, orden).",
    smtpConfigured: isSmtpConfigured(),
    smtpNote:
      "Gmail: `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación). Ver docs/ENV_SMTP_GMAIL.md",
  });
});

app.use("/api", billableOrdersRouter);
app.use("/api", clientsRouter);
app.use("/api", invoicesRouter);
app.use("/api", validationRouter);
app.use("/api", catalogsRouter);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.listen(port, "0.0.0.0", () => {
  console.log(`intimo-invoicing listening on http://0.0.0.0:${port}`);
});
