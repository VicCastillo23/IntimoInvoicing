import { Router } from "express";
import { getClientByRfc, upsertClient } from "../repositories/clientRepository.js";
import { validateReceiverPayload } from "../services/receiverValidation.js";

export const clientsRouter = Router();

/**
 * GET /api/clients/lookup?rfc=
 */
clientsRouter.get("/clients/lookup", (req, res) => {
  const raw = req.query.rfc;
  const v = validateReceiverPayload({ rfc: raw }, {});

  if (!v.rfcMeta?.normalized) {
    return res.status(400).json({ ok: false, error: "rfc_required" });
  }

  if (!v.ok) {
    return res.status(422).json({
      ok: false,
      found: false,
      errors: v.errors,
      rfcMeta: v.rfcMeta,
    });
  }

  const rfc = v.rfcMeta.normalized;
  const client = getClientByRfc(rfc);
  if (client) {
    return res.json({ ok: true, found: true, rfc: client.rfc, client, rfcMeta: v.rfcMeta });
  }

  return res.json({ ok: true, found: false, rfc, rfcMeta: v.rfcMeta });
});

/**
 * POST /api/clients
 * Persiste receptor en almacenamiento propio (independiente del PAC).
 */
clientsRouter.post("/clients", async (req, res) => {
  const body = req.body || {};
  const v = validateReceiverPayload(
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
    { requireFullReceiver: true }
  );

  if (!v.ok) {
    return res.status(422).json({
      ok: false,
      errors: v.errors,
      rfcMeta: v.rfcMeta,
    });
  }

  const rfc = v.rfcMeta.normalized;
  const client = await upsertClient({
    rfc,
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
  });

  return res.status(201).json({ ok: true, client });
});
