/**
 * Arma el JSON de CFDI 4.0 multiemisor para POST /api-lite/3/cfdis (Facturama).
 */
import { getCfdiLineItemProfile, getEmisorCfdiProfile } from "../config.js";
import { formatCfdiEmissionDateMexico } from "../mexicoCfdiDate.js";
import { normalizeRfc } from "../rfc.js";
import { isRfcExemptFromCheckDigit } from "../rfcSat.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Domicilio del receptor (Addressv40 Facturama). Si faltan datos, no se envía Address.
 * @param {object} receiver
 * @param {string} taxZipCode
 */
function buildFacturamaReceiverAddress(receiver, taxZipCode) {
  const street = String(receiver.street || "").trim();
  const exteriorNumber = String(receiver.exteriorNumber || "").trim();
  const neighborhood = String(receiver.neighborhood || "").trim();
  const municipality = String(receiver.municipality || "").trim();
  const state = String(receiver.state || "").trim();
  const country = String(receiver.country || "").trim() || "México";
  if (
    street.length < 2 ||
    exteriorNumber.length < 1 ||
    neighborhood.length < 2 ||
    municipality.length < 2 ||
    state.length < 2
  ) {
    return null;
  }
  /** @type {Record<string, string>} */
  const addr = {
    Street: street.slice(0, 100),
    ExteriorNumber: exteriorNumber.slice(0, 30),
    Neighborhood: neighborhood.slice(0, 80),
    ZipCode: taxZipCode,
    Municipality: municipality.slice(0, 100),
    State: state.slice(0, 100),
    Country: country.slice(0, 50),
  };
  const int = String(receiver.interiorNumber || "").trim();
  if (int) addr.InteriorNumber = int.slice(0, 30);
  const loc = String(receiver.locality || "").trim();
  if (loc) addr.Locality = loc.slice(0, 80);
  return addr;
}

/**
 * @param {object} order — mock u orden POS (total, orderNumber, description, …)
 * @param {object} receiver — legalName, rfc, taxRegime, zipCode, cfdiUse
 */
export function buildCfdi4MultiemisorPayload(order, receiver) {
  const emisor = getEmisorCfdiProfile();
  const line = getCfdiLineItemProfile();
  const total = round2(order.total);
  const subtotal = round2(total / 1.16);
  const iva = round2(total - subtotal);

  const baseFolio = String(order.orderNumber || "1").replace(/[^\w-]/g, "");
  const folio = `${baseFolio}-${Date.now().toString(36)}`.slice(0, 40);
  const itemDesc = String(line.itemDescription || "Consumo de alimentos").slice(
    0,
    1000
  );

  const dateStr = formatCfdiEmissionDateMexico();

  const rfcRec = normalizeRfc(receiver.rfc);
  /** RFC genérico (público en general / extranjero): el SAT exige TaxZipCode = LugarExpedicion. */
  const taxZipCode = isRfcExemptFromCheckDigit(rfcRec)
    ? emisor.expeditionPlace
    : String(receiver.zipCode || "").trim();

  /** @type {Record<string, unknown>} */
  const receiverBlock = {
    Rfc: receiver.rfc,
    Name: receiver.legalName,
    CfdiUse: receiver.cfdiUse,
    FiscalRegime: receiver.taxRegime,
    TaxZipCode: taxZipCode,
  };

  const facturamaAddress = buildFacturamaReceiverAddress(receiver, taxZipCode);
  if (facturamaAddress) {
    receiverBlock.Address = facturamaAddress;
  }

  return {
    NameId: 1,
    Date: dateStr,
    Serie: emisor.serie,
    Folio: folio,
    CfdiType: "I",
    Currency: "MXN",
    PaymentForm: line.paymentForm,
    PaymentMethod: "PUE",
    Exportation: "01",
    ExpeditionPlace: emisor.expeditionPlace,
    OrderNumber: `INT-${order.id || order.orderNumber}`,
    Observations: `Pedido ${order.orderNumber || ""}`.trim(),
    Issuer: {
      Rfc: emisor.rfc,
      Name: emisor.name,
      FiscalRegime: emisor.fiscalRegime,
    },
    Receiver: receiverBlock,
    Items: [
      {
        ProductCode: line.productCode,
        IdentificationNumber: String(order.orderNumber || ""),
        Description: itemDesc,
        Unit: line.unitLabel,
        UnitCode: line.unitCode,
        UnitPrice: subtotal,
        Quantity: 1,
        Subtotal: subtotal,
        TaxObject: "02",
        Taxes: [
          {
            Total: iva,
            Name: "IVA",
            Base: subtotal,
            Rate: 0.16,
            IsRetention: false,
          },
        ],
        Total: total,
      },
    ],
  };
}
