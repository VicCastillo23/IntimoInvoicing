/**
 * Registro de receptor CFDI propio de Intimo (independiente del PAC).
 * Cualquier integración (Facturama u otro) mapea desde/hacia este modelo.
 *
 * @typedef {object} ClientRecord
 * @property {string} rfc Normalizado
 * @property {string} legalName
 * @property {string} taxRegime c_RegimenFiscal
 * @property {string} zipCode CP fiscal (5 dígitos)
 * @property {string} street
 * @property {string} exteriorNumber
 * @property {string} [interiorNumber]
 * @property {string} neighborhood
 * @property {string} [locality]
 * @property {string} municipality
 * @property {string} state
 * @property {string} country
 * @property {string} cfdiUse c_UsoCFDI
 * @property {string} email
 * @property {string} updatedAt ISO
 */

export {};
