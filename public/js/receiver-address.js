/**
 * Validación de domicilio fiscal (alineada a receiverValidation en servidor).
 * Devuelve mensaje de error o null si todo es válido.
 * @param {Record<string, string | undefined>} a
 */
export function validateReceiverAddress(a) {
  const street = String(a.street || "").trim();
  const exteriorNumber = String(a.exteriorNumber || "").trim();
  const interiorNumber = String(a.interiorNumber || "").trim();
  const neighborhood = String(a.neighborhood || "").trim();
  const municipality = String(a.municipality || "").trim();
  const state = String(a.state || "").trim();
  let country = String(a.country || "").trim();
  if (!country) country = "México";
  const zipCode = String(a.zipCode || "").trim();

  if (street.length < 2 || street.length > 100) {
    return "Indica la calle del domicilio fiscal (entre 2 y 100 caracteres).";
  }
  if (exteriorNumber.length < 1 || exteriorNumber.length > 30) {
    return "Indica el número exterior (ej. 12, S/N).";
  }
  if (interiorNumber.length > 30) {
    return "El número interior no puede superar 30 caracteres.";
  }
  if (neighborhood.length < 2 || neighborhood.length > 80) {
    return "Indica la colonia o fraccionamiento.";
  }
  if (!/^\d{5}$/.test(zipCode)) {
    return "El código postal debe ser de 5 dígitos.";
  }
  if (municipality.length < 2 || municipality.length > 100) {
    return "Indica el municipio o alcaldía.";
  }
  if (state.length < 2 || state.length > 100) {
    return "Indica el estado.";
  }
  if (country.length < 2 || country.length > 50) {
    return "Indica el país.";
  }
  const locality = String(a.locality || "").trim();
  if (locality.length > 80) {
    return "La localidad no puede superar 80 caracteres.";
  }
  return null;
}
