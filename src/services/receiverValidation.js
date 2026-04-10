/**
 * Validación de receptor para CFDI (RFC genuino SAT + campos fiscales mínimos).
 */
import { isValidRfcFormat, normalizeRfc } from "../rfc.js";
import { isRfcExemptFromCheckDigit, isRfcGenuino, verifyRfcCheckDigit } from "../rfcSat.js";
import { validateRegimeAndCfdiUse } from "./satRegimeCfdiUse.js";

const CFDI_USE_RE = /^[A-Z0-9]{3}$/;
const TAX_REGIME_RE = /^\d{3}$/;

function trimStr(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object} input
 * @param {object} [options]
 * @param {boolean} [options.requireFullReceiver] Exige razón social, régimen, CP, uso CFDI y domicilio fiscal completo.
 */
export function validateReceiverPayload(input, options = {}) {
  const requireFull = options.requireFullReceiver === true;

  const rfc = normalizeRfc(input.rfc);
  const legalName = trimStr(input.legalName);
  const taxRegime = trimStr(input.taxRegime);
  const zipCode = trimStr(input.zipCode);
  const cfdiUse = trimStr(input.cfdiUse);
  const email = trimStr(input.email);

  let street = trimStr(input.street);
  let exteriorNumber = trimStr(input.exteriorNumber);
  const interiorNumber = trimStr(input.interiorNumber);
  let neighborhood = trimStr(input.neighborhood);
  let municipality = trimStr(input.municipality);
  let state = trimStr(input.state);
  let country = trimStr(input.country);
  const locality = trimStr(input.locality);
  if (requireFull && !country) country = "México";

  const rfcMeta = {
    normalized: rfc || null,
    exemptFromCheckDigit: rfc ? isRfcExemptFromCheckDigit(rfc) : false,
    checkDigitOk: rfc ? isRfcGenuino(rfc) : false,
  };

  /** @type {{ code: string, message: string }[]} */
  const errors = [];

  if (!rfc) {
    errors.push({ code: "rfc_required", message: "El RFC es obligatorio." });
    return { ok: false, errors, rfcMeta };
  }

  if (!isValidRfcFormat(rfc)) {
    errors.push({
      code: "rfc_invalid_format",
      message: "El RFC no tiene el formato esperado.",
    });
    return { ok: false, errors, rfcMeta };
  }

  if (!isRfcGenuino(rfc)) {
    const d = verifyRfcCheckDigit(rfc);
    errors.push({
      code: "rfc_check_digit_invalid",
      message: `El dígito verificador del RFC no coincide (esperado ${d.expected ?? "?"}, obtenido ${d.received ?? "?"}).`,
    });
  }

  const partial =
    !requireFull &&
    !legalName &&
    !taxRegime &&
    !zipCode &&
    !cfdiUse &&
    !email &&
    !street &&
    !exteriorNumber &&
    !interiorNumber &&
    !neighborhood &&
    !municipality &&
    !state &&
    !country &&
    !locality;
  if (partial) {
    return { ok: errors.length === 0, errors, rfcMeta };
  }

  if (requireFull || legalName) {
    if (!legalName || legalName.length < 2) {
      errors.push({
        code: "legal_name_invalid",
        message: "Indica la razón social o nombre del receptor.",
      });
    }
  }

  if (requireFull || taxRegime) {
    if (!TAX_REGIME_RE.test(taxRegime)) {
      errors.push({
        code: "tax_regime_invalid",
        message: "El régimen fiscal debe ser un código de 3 dígitos.",
      });
    }
  }

  if (requireFull || zipCode) {
    if (!/^\d{5}$/.test(zipCode)) {
      errors.push({
        code: "zip_invalid",
        message: "El código postal debe ser de 5 dígitos.",
      });
    }
  }

  if (requireFull || cfdiUse) {
    if (!CFDI_USE_RE.test(cfdiUse)) {
      errors.push({
        code: "cfdi_use_invalid",
        message: "El uso CFDI debe ser una clave válida de 3 caracteres.",
      });
    }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({
      code: "email_invalid",
      message: "El correo electrónico no es válido.",
    });
  }

  if (requireFull) {
    if (street.length < 2 || street.length > 100) {
      errors.push({
        code: "address_street_invalid",
        message: "Indica la calle del domicilio fiscal (entre 2 y 100 caracteres).",
      });
    }
    if (exteriorNumber.length < 1 || exteriorNumber.length > 30) {
      errors.push({
        code: "address_exterior_invalid",
        message: "Indica el número exterior del domicilio fiscal.",
      });
    }
    if (interiorNumber.length > 30) {
      errors.push({
        code: "address_interior_invalid",
        message: "El número interior no puede superar 30 caracteres.",
      });
    }
    if (neighborhood.length < 2 || neighborhood.length > 80) {
      errors.push({
        code: "address_neighborhood_invalid",
        message: "Indica la colonia o fraccionamiento.",
      });
    }
    if (municipality.length < 2 || municipality.length > 100) {
      errors.push({
        code: "address_municipality_invalid",
        message: "Indica el municipio o alcaldía.",
      });
    }
    if (state.length < 2 || state.length > 100) {
      errors.push({
        code: "address_state_invalid",
        message: "Indica el estado.",
      });
    }
    if (country.length < 2 || country.length > 50) {
      errors.push({
        code: "address_country_invalid",
        message: "Indica el país del domicilio fiscal.",
      });
    }
    if (locality.length > 80) {
      errors.push({
        code: "address_locality_invalid",
        message: "La localidad no puede superar 80 caracteres.",
      });
    }

    if (!legalName || !TAX_REGIME_RE.test(taxRegime) || !/^\d{5}$/.test(zipCode) || !CFDI_USE_RE.test(cfdiUse)) {
      if (!errors.some((e) => e.code === "legal_name_invalid")) {
        errors.push({
          code: "receiver_incomplete",
          message:
            "Completa razón social, régimen fiscal, domicilio fiscal, código postal y uso CFDI.",
        });
      }
    } else {
      for (const e of validateRegimeAndCfdiUse(taxRegime, cfdiUse)) {
        errors.push(e);
      }
    }
  }

  return { ok: errors.length === 0, errors, rfcMeta };
}
