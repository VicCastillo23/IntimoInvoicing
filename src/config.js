/**
 * Configuración desde process.env (Facturama + CSD).
 * Los secretos no deben loguearse ni enviarse al cliente.
 */

/** Nombre fiscal por defecto para el RFC de pruebas SAT usado en ejemplos Facturama. */
const DEFAULT_EMISOR_NAME_BY_RFC = {
  EKU9003173C9: "ESCUELA KEMPER URGATE",
};

export function isFacturamaAuthConfigured() {
  return Boolean(
    process.env.FACTURAMA_USER?.trim() && process.env.FACTURAMA_PASSWORD?.trim()
  );
}

/** CSD listo para enviar a POST /api-lite/csds (todos los campos rellenos). */
export function isCsdConfigured() {
  const rfc = process.env.FACTURAMA_EMISOR_RFC?.trim();
  const cert = process.env.FACTURAMA_CSD_CERTIFICATE_BASE64?.trim();
  const key = process.env.FACTURAMA_CSD_PRIVATE_KEY_BASE64?.trim();
  const pass = process.env.FACTURAMA_CSD_PRIVATE_KEY_PASSWORD?.trim();
  return Boolean(rfc && cert && key && pass);
}

/**
 * Perfil del emisor para CFDI 4.0 (multiemisor). Debe coincidir con el CSD cargado en Facturama.
 */
export function getEmisorCfdiProfile() {
  const rfc = process.env.FACTURAMA_EMISOR_RFC?.trim().toUpperCase() || "";
  const nameFromEnv = process.env.FACTURAMA_EMISOR_NAME?.trim();
  const name =
    nameFromEnv ||
    DEFAULT_EMISOR_NAME_BY_RFC[rfc] ||
    "";

  return {
    rfc,
    name,
    fiscalRegime: process.env.FACTURAMA_EMISOR_FISCAL_REGIME?.trim() || "601",
    expeditionPlace: process.env.FACTURAMA_EXPEDITION_PLACE?.trim() || "42501",
    serie: process.env.FACTURAMA_CFDI_SERIE?.trim() || "INT",
    /** Clave SAT producto/servicio (ej. factura productiva cafetería: 90101500). */
    productCode: process.env.FACTURAMA_PRODUCT_CODE?.trim() || "90101500",
  };
}

/**
 * Concepto y forma de pago del renglón CFDI (alineado a factura productiva de referencia).
 */
export function getCfdiLineItemProfile() {
  const emisor = getEmisorCfdiProfile();
  return {
    productCode: emisor.productCode,
    itemDescription:
      process.env.FACTURAMA_CFDI_ITEM_DESCRIPTION?.trim() ||
      "Consumo de alimentos",
    unitLabel:
      process.env.FACTURAMA_CFDI_UNIT_LABEL?.trim() || "Unidad de servicio",
    unitCode: process.env.FACTURAMA_CFDI_UNIT_CODE?.trim() || "E48",
    /** SAT forma de pago: 28 = Tarjeta de débito (ejemplo productivo). */
    paymentForm: process.env.FACTURAMA_PAYMENT_FORM?.trim() || "28",
  };
}

/**
 * Envío de CFDI por correo propio (SMTP).
 * Mínimo: SMTP_HOST + SMTP_FROM.
 * Gmail exige además SMTP_USER + SMTP_PASS (contraseña de aplicación).
 */
export function isSmtpConfigured() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return false;
  if (/smtp\.gmail\.com/i.test(host)) {
    return Boolean(
      process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
    );
  }
  return true;
}

/**
 * Timbrado real en Facturama (sandbox o prod): credenciales + datos del emisor en .env.
 * El CSD debe estar cargado en la cuenta Facturama (panel o POST /api-lite/csds).
 */
export function canStampWithFacturama() {
  if (!isFacturamaAuthConfigured()) return false;
  const p = getEmisorCfdiProfile();
  return Boolean(p.rfc && p.name && /^\d{5}$/.test(p.expeditionPlace));
}
