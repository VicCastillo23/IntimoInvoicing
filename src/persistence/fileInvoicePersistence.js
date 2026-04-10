import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readInvoicesFile() {
  try {
    const raw = await fs.readFile(INVOICES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const invoices = parsed.invoices;
    return Array.isArray(invoices) ? invoices : [];
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
      return [];
    }
    throw e;
  }
}

export async function writeInvoicesFile(invoices) {
  await ensureDataDir();
  const payload = JSON.stringify(
    { version: 1, invoices, updatedAt: new Date().toISOString() },
    null,
    2
  );
  await fs.writeFile(INVOICES_FILE, payload, "utf8");
}
