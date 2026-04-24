import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import {
  canStampWithFacturama,
  isCsdConfigured,
  isFacturamaAuthConfigured,
  isPublicInvoiceTokenOnly,
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
import { getSessionMiddleware } from "./auth/sessionConfig.js";
import { requireAuth } from "./auth/middleware.js";
import { handleLogin, handleLogout, handleMe } from "./auth/routes.js";
import { bootstrapAuthUsersIfEmpty } from "./auth/authUsersDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "..", "public");

const trustProxyEnv = String(process.env.TRUST_PROXY || "").toLowerCase();
const useTrustProxy =
  process.env.NODE_ENV === "production" ||
  trustProxyEnv === "1" ||
  trustProxyEnv === "true";
if (useTrustProxy) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(getSessionMiddleware(session));
app.use(express.json());

function isInvoicingPublicApi(req) {
  const p = req.path || "";
  const m = req.method;
  if (p === "/api/public/billable-order" && m === "GET") return true;
  if (p === "/api/clients/lookup" && m === "GET") return true;
  if (p === "/api/invoices/request" && m === "POST") return true;
  if (m === "GET" && p.startsWith("/api/catalogs/postal-code/")) return true;
  if (p === "/api/auth/login" && m === "POST") return true;
  if (p === "/api/auth/logout" && m === "POST") return true;
  if (p === "/api/auth/me" && m === "GET") return true;
  return false;
}

app.use((req, res, next) => {
  if (!String(req.path || "").startsWith("/api/")) return next();
  if (isInvoicingPublicApi(req)) return next();
  return requireAuth(req, res, next);
});

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
    publicInvoiceTokenOnly: isPublicInvoiceTokenOnly(),
    clientStore: "file",
    clientStoreNote:
      "Receptores en `data/clients.json` (modelo propio, independiente del PAC).",
    invoiceStore: "file",
    invoiceStoreNote:
      "CFDI emitidos en `data/invoices.json` (UUID, id Facturama, orden).",
    smtpConfigured: isSmtpConfigured(),
    smtpNote:
      "Gmail: `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación). Ver docs/ENV_SMTP_GMAIL.md",
    portalAuth: "postgresql auth.app_users (sesión cookie intimo.inv.sid)",
  });
});

app.post("/api/auth/login", handleLogin);
app.post("/api/auth/logout", handleLogout);
app.get("/api/auth/me", handleMe);

app.use("/api", billableOrdersRouter);
app.use("/api", clientsRouter);
app.use("/api", invoicesRouter);
app.use("/api", validationRouter);
app.use("/api", catalogsRouter);

app.get("/login.html", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/cliente.html", (_req, res) => {
  res.sendFile(path.join(publicDir, "cliente.html"));
});

function sendHtmlIfAuthed(htmlFile) {
  return (req, res) => {
    if (!req.session?.userId) {
      return res.redirect("/login.html");
    }
    res.sendFile(path.join(publicDir, htmlFile));
  };
}

app.get("/index.html", sendHtmlIfAuthed("index.html"));

app.use(
  express.static(publicDir, {
    index: false,
    fallthrough: true,
  })
);

app.get("/", sendHtmlIfAuthed("index.html"));

async function main() {
  await initClientRepository();
  await initInvoiceRepository();

  if (process.env.DATABASE_URL?.trim()) {
    await bootstrapAuthUsersIfEmpty();
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`intimo-invoicing listening on http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
