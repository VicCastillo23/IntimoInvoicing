/** Compartido entre `app.js` (admin) y `client-app.js` (vista cliente / QR). */

export function formatValidationErrors(data) {
  if (data?.errors?.length) {
    return data.errors.map((e) => e.message).join(" · ");
  }
  return data?.message || data?.error || "Solicitud inválida.";
}

export function formatStampOrApiErrors(data, options = {}) {
  const shortHints = options.shortHints === true;
  const ms = data?.details?.ModelState;
  if (ms && typeof ms === "object") {
    const msgs = [];
    for (const key of Object.keys(ms)) {
      const arr = ms[key];
      if (Array.isArray(arr)) {
        for (const m of arr) {
          if (typeof m === "string") msgs.push(m);
        }
      }
    }
    if (msgs.length) {
      return msgs.join(" ");
    }
  }
  const detailMsg = data?.details?.Message;
  if (typeof detailMsg === "string" && detailMsg && detailMsg !== data?.message) {
    return `${data?.message || "Error al timbrar"} — ${detailMsg}`;
  }
  const base = formatValidationErrors(data);
  const msg = data?.message || base;
  if (/CSD|certificado|sellos/i.test(msg)) {
    return shortHints
      ? `${msg} Si el problema persiste, contacta al establecimiento.`
      : `${msg} Sube el CSD a Facturama: en la carpeta del proyecto ejecuta «npm run facturama:upload-csd» (con el .env relleno) o cárgalo en el panel de Facturama.`;
  }
  if (/Nombre del receptor|nombre asociado al RFC|campo Nombre del receptor/i.test(msg)) {
    return shortHints
      ? `${msg} Copia el nombre exactamente como figura en tu constancia de situación fiscal o en la consulta de RFC del SAT.`
      : `${msg} Copia el nombre exactamente como figura en tu constancia de situación fiscal o en la consulta de RFC del SAT (incluye acentos, Ñ y orden de nombres/apellidos). Luego guarda de nuevo el receptor.`;
  }
  if (/DomicilioFiscalReceptor|LugarExpedicion/i.test(msg)) {
    return shortHints
      ? `${msg} Con RFC genérico (XAXX/XEXX) el código postal debe coincidir con el del emisor; revisa el CP o pide ayuda en mostrador.`
      : `${msg} Con RFC genérico (XAXX/XEXX) el CP del receptor debe coincidir con el lugar de expedición del emisor; al timbrar ya se alinean automáticamente. Si ves esto con otro RFC, iguala el código postal del receptor a FACTURAMA_EXPEDITION_PLACE en .env o ajústalo en el formulario.`;
  }
  if (/72\s*horas|fecha de generaci/i.test(msg)) {
    return shortHints
      ? `${msg} La fecha de emisión debe estar dentro del plazo que permite el SAT. Si acabas de consumir, intenta de nuevo; si no, acude al establecimiento.`
      : `${msg} La fecha de emisión del CFDI debe estar dentro del plazo que permite el SAT (típicamente no mayor a 72 h respecto al timbrado). Ya enviamos la hora en zona México; si persiste, revisa la hora del sistema del servidor y que no estés reutilizando borradores viejos.`;
  }
  return base;
}
