#!/usr/bin/env node
/**
 * Sube o actualiza el CSD del emisor en Facturama (sandbox/prod) usando `.env`.
 *
 * Uso:
 *   npm run facturama:upload-csd
 *   npm run facturama:upload-csd -- --update   # fuerza PUT si ya existe
 */
import "dotenv/config";

const args = process.argv.slice(2);
const forceUpdate = args.includes("--update") || args.includes("-u");

const base = (process.env.FACTURAMA_API_URL || "https://apisandbox.facturama.mx").replace(
  /\/$/,
  ""
);
const user = process.env.FACTURAMA_USER?.trim();
const pass = process.env.FACTURAMA_PASSWORD?.trim();
const rfc = process.env.FACTURAMA_EMISOR_RFC?.trim();
const certificate = process.env.FACTURAMA_CSD_CERTIFICATE_BASE64?.trim();
const privateKey = process.env.FACTURAMA_CSD_PRIVATE_KEY_BASE64?.trim();
const privateKeyPassword = process.env.FACTURAMA_CSD_PRIVATE_KEY_PASSWORD?.trim();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!user || !pass) fail("Falta FACTURAMA_USER o FACTURAMA_PASSWORD en .env");
if (!rfc) fail("Falta FACTURAMA_EMISOR_RFC en .env");
if (!certificate || !privateKey || !privateKeyPassword) {
  fail(
    "Faltan FACTURAMA_CSD_CERTIFICATE_BASE64, FACTURAMA_CSD_PRIVATE_KEY_BASE64 o FACTURAMA_CSD_PRIVATE_KEY_PASSWORD en .env"
  );
}

const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
const rfcUpper = rfc.toUpperCase();

const payload = {
  Rfc: rfcUpper,
  Certificate: certificate,
  PrivateKey: privateKey,
  PrivateKeyPassword: privateKeyPassword,
};
const body = JSON.stringify(payload);

const headers = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": user,
};

function csdAlreadyExists(json, text) {
  const rfcMsgs = json?.ModelState?.Rfc;
  if (Array.isArray(rfcMsgs)) {
    return rfcMsgs.some((m) => /ya existe|asociado a este RFC/i.test(String(m)));
  }
  return /ya existe un CSD|asociado a este RFC/i.test(String(text));
}

async function doPut() {
  const url = `${base}/api-lite/csds/${encodeURIComponent(rfcUpper)}`;
  console.log(`PUT ${url}`);
  console.log(`RFC emisor: ${rfcUpper}`);
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function doPost() {
  const url = `${base}/api-lite/csds`;
  console.log(`POST ${url}`);
  console.log(`RFC emisor: ${rfcUpper}`);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

if (forceUpdate) {
  const { res, json, text } = await doPut();
  if (!res.ok) {
    console.error("Error HTTP", res.status);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log("OK — CSD actualizado en Facturama (PUT).");
  if (text && text !== "{}") console.log(JSON.stringify(json, null, 2));
  process.exit(0);
}

let { res, json, text } = await doPost();

if (!res.ok && csdAlreadyExists(json, text)) {
  console.log("");
  console.log(
    "ℹ️  Ya había un CSD registrado para este RFC en tu cuenta Facturama. No hace falta volver a subirlo."
  );
  console.log(
    "   Si el timbrado fallaba por CSD, revisa que uses el mismo usuario API o sube el certificado en el panel."
  );
  console.log(
    "   Para reemplazar certificado/llave desde este .env: npm run facturama:upload-csd -- --update"
  );
  process.exit(0);
}

if (!res.ok) {
  console.error("Error HTTP", res.status);
  console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log("OK — CSD registrado en Facturama para este usuario API.");
if (text && text !== "{}") console.log(JSON.stringify(json, null, 2));
