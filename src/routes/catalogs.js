import { Router } from "express";
import { resolvePostalCodeCatalog } from "../services/facturamaPostalCatalog.js";

export const catalogsRouter = Router();

/**
 * GET /api/catalogs/postal-code/:cp
 * Colonias + datos de estado/municipio según catálogo Facturama (credenciales en servidor).
 */
catalogsRouter.get("/catalogs/postal-code/:cp", async (req, res) => {
  const cp = String(req.params.cp || "").trim();
  try {
    const data = await resolvePostalCodeCatalog(cp);
    if (data.ok === false && data.error === "invalid_postal_code") {
      return res.status(400).json(data);
    }
    const status = data.ok ? 200 : data.error === "facturama_not_configured" ? 503 : 502;
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: "catalog_unavailable",
      message: e.message || "Error al consultar catálogo",
    });
  }
});
