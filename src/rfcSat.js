/**
 * Validación del dígito verificador del RFC (reglas SAT, módulo 11).
 * Referencia: algoritmo ampliamente documentado (homoclave / verificación).
 */
import { normalizeRfc } from "./rfc.js";

/** Valores oficiales por carácter (tabla SAT). */
const CHAR_VALUE = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 18,
  J: 19,
  K: 20,
  L: 21,
  M: 22,
  N: 23,
  "&": 24,
  O: 25,
  P: 26,
  Q: 27,
  R: 28,
  S: 29,
  T: 30,
  U: 31,
  V: 32,
  W: 33,
  X: 34,
  Y: 35,
  Z: 36,
  " ": 37,
  Ñ: 38,
};

/** RFC genéricos del SAT que no aplican homoclave estándar (público en general, extranjero). */
export const RFC_EXEMPT_CHECK_DIGIT = new Set([
  "XAXX010101000",
  "XEXX010101000",
]);

export function isRfcExemptFromCheckDigit(rfc) {
  return RFC_EXEMPT_CHECK_DIGIT.has(normalizeRfc(rfc));
}

/**
 * @returns {{ ok: boolean, expected?: string, received?: string }}
 */
export function verifyRfcCheckDigit(rfc) {
  const raw = normalizeRfc(rfc);
  if (raw.length !== 12 && raw.length !== 13) {
    return { ok: false };
  }

  let padded = raw;
  if (raw.length === 12) {
    padded = ` ${raw}`;
  }

  if (padded.length !== 13) {
    return { ok: false };
  }

  const received = padded.slice(12);
  const body = padded.slice(0, 12);

  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const val = CHAR_VALUE[ch];
    if (val === undefined) {
      return { ok: false };
    }
    sum += val * (13 - i);
  }

  const rem = sum % 11;
  let expected;
  if (rem === 0) expected = "0";
  else if (rem === 1) expected = "A";
  else expected = String(11 - rem);

  return {
    ok: received === expected,
    expected,
    received,
  };
}

export function isRfcGenuino(rfc) {
  const n = normalizeRfc(rfc);
  if (isRfcExemptFromCheckDigit(n)) {
    return true;
  }
  return verifyRfcCheckDigit(n).ok;
}
