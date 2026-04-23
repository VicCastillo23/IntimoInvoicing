import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CFDI_SUBDIR = "cfdi-files";

function artifactsRoot() {
  const override = process.env.INVOICE_CFDI_DIR?.trim();
  if (override) return path.isAbsolute(override) ? override : path.join(DATA_DIR, override);
  return path.join(DATA_DIR, CFDI_SUBDIR);
}

/**
 * @param {string | null | undefined} uuid
 */
function safeDirName(uuid) {
  const u = String(uuid || "").trim();
  if (u.length >= 8 && /^[0-9a-f-]{36}$/i.test(u)) return u.toLowerCase();
  const cleaned = u.replace(/[^0-9A-Za-z._-]/g, "_").slice(0, 64);
  return cleaned || `cfdi-${Date.now()}`;
}

/**
 * Guarda PDF y XML devueltos por Facturama (buffers ya decodificados).
 * Rutas relativas a `data/` para guardar en invoices.json.
 *
 * @param {{ uuid: string | null, pdfBuffer: Buffer, xmlBuffer: Buffer }} p
 * @returns {Promise<{ storedPdfPath: string, storedXmlPath: string } | null>}
 */
export async function persistCfdiArtifacts({ uuid, pdfBuffer, xmlBuffer }) {
  if (!Buffer.isBuffer(pdfBuffer) || !Buffer.isBuffer(xmlBuffer)) return null;
  if (pdfBuffer.length === 0 || xmlBuffer.length === 0) return null;

  const dirName = safeDirName(uuid);
  const root = artifactsRoot();
  const dir = path.join(root, dirName);
  await fs.mkdir(dir, { recursive: true });

  const pdfName = "cfdi.pdf";
  const xmlName = "cfdi.xml";
  const pdfAbs = path.join(dir, pdfName);
  const xmlAbs = path.join(dir, xmlName);

  await fs.writeFile(pdfAbs, pdfBuffer);
  await fs.writeFile(xmlAbs, xmlBuffer);

  const rel = (abs) =>
    path
      .relative(DATA_DIR, abs)
      .split(path.sep)
      .join("/");

  return {
    storedPdfPath: rel(pdfAbs),
    storedXmlPath: rel(xmlAbs),
  };
}

/**
 * @param {string} relativeFromDataDir ej. cfdi-files/uuid/cfdi.xml
 * @returns {Promise<Buffer | null>}
 */
export async function readStoredArtifact(relativeFromDataDir) {
  const rel = String(relativeFromDataDir || "").trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;
  const full = path.join(DATA_DIR, rel);
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export function getDataDirForInvoices() {
  return DATA_DIR;
}
