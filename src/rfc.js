/**
 * Normalización y validación básica de RFC (México) para flujo de facturación.
 * No sustituye la validación oficial del SAT; sirve para UX y rechazo temprano.
 */
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function normalizeRfc(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isValidRfcFormat(rfc) {
  const r = normalizeRfc(rfc);
  if (r.length !== 12 && r.length !== 13) return false;
  return RFC_RE.test(r);
}
