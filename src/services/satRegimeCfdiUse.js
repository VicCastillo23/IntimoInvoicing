/**
 * Comprobaciones de compatibilidad régimen fiscal (c_RegimenFiscal) vs uso CFDI (c_UsoCFDI).
 * El SAT exige combinaciones válidas; el PAC devuelve error si no coinciden (p. ej. ModelState en Facturama).
 */

/**
 * @param {string} taxRegime
 * @param {string} cfdiUse
 * @returns {{ code: string, message: string }[]}
 */
export function validateRegimeAndCfdiUse(taxRegime, cfdiUse) {
  const r = String(taxRegime || "").trim();
  const u = String(cfdiUse || "")
    .trim()
    .toUpperCase();

  /** @type {{ code: string, message: string }[]} */
  const errors = [];

  // Documentado por PAC: G03 no aplica a 605 (sueldos y salarios).
  if (r === "605" && u === "G03") {
    errors.push({
      code: "regime_cfdi_incompatible",
      message:
        "El uso CFDI G03 (gastos en general) no es válido con el régimen 605 (sueldos y salarios). Para una compra en cafetería suele usarse otro régimen (p. ej. 612 persona física con actividad empresarial, 616, 626 RESICO) según tu constancia; o elige un uso CFDI permitido para 605 según el catálogo SAT.",
    });
  }

  return errors;
}
