/**
 * Fecha/hora de emisión para CFDI en zona America/Mexico_City (ISO 8601 con offset).
 * Evita desajustes al interpretar solo UTC (`Z`) frente a reglas del PAC / ventana de 72 h.
 */
const TZ = "America/Mexico_City";

/**
 * @param {Date} [d]
 * @returns {string} ej. 2026-04-01T17:30:00-06:00
 */
export function formatCfdiEmissionDateMexico(d = new Date()) {
  const wall = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
  const wallIso = wall.replace(" ", "T");

  const f = new Intl.DateTimeFormat("en", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  });
  const tzPart = f.formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "";
  const m = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetIso = m ? `${m[1]}${m[2]}:${m[3]}` : "-06:00";

  return `${wallIso}${offsetIso}`;
}
