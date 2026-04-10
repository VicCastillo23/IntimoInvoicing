import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * @returns {Promise<Record<string, import("../domain/clientRecord.js").ClientRecord>>}
 */
export async function readClientsFile() {
  try {
    const raw = await fs.readFile(CLIENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const clients = parsed.clients || {};
    return typeof clients === "object" && clients !== null ? clients : {};
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
      return {};
    }
    throw e;
  }
}

/**
 * @param {Record<string, import("../domain/clientRecord.js").ClientRecord>} clients
 */
export async function writeClientsFile(clients) {
  await ensureDataDir();
  const payload = JSON.stringify(
    { version: 1, clients, updatedAt: new Date().toISOString() },
    null,
    2
  );
  await fs.writeFile(CLIENTS_FILE, payload, "utf8");
}
