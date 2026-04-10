import { Router } from "express";
import { validateReceiverPayload } from "../services/receiverValidation.js";

export const validationRouter = Router();

/**
 * POST /api/validation/receiver
 * Valida RFC (formato + dígito verificador SAT) y, si envías el resto de campos, coherencia fiscal mínima.
 *
 * Body JSON:
 * - rfc (requerido)
 * - legalName, taxRegime, zipCode, cfdiUse, email (opcionales)
 * - requireFull: si true, exige todos los campos de receptor (flujo timbrado).
 */
validationRouter.post("/validation/receiver", (req, res) => {
  const body = req.body || {};
  const requireFull = body.requireFull === true;
  const result = validateReceiverPayload(
    {
      rfc: body.rfc,
      legalName: body.legalName,
      taxRegime: body.taxRegime,
      zipCode: body.zipCode,
      cfdiUse: body.cfdiUse,
      email: body.email,
      street: body.street,
      exteriorNumber: body.exteriorNumber,
      interiorNumber: body.interiorNumber,
      neighborhood: body.neighborhood,
      locality: body.locality,
      municipality: body.municipality,
      state: body.state,
      country: body.country,
    },
    { requireFullReceiver: requireFull }
  );

  const status = result.ok ? 200 : 422;
  return res.status(status).json({
    ok: result.ok,
    errors: result.errors,
    rfcMeta: result.rfcMeta,
  });
});
