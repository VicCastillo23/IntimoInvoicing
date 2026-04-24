import { formatValidationErrors, formatStampOrApiErrors } from "./invoice-errors.js";
import { validateReceiverAddress } from "./receiver-address.js";
import { createPostalCatalogUi } from "./postal-catalog-ui.js";

const API_BASE = "";

/** @type {Record<string, unknown> | null} */
let selectedOrder = null;

const el = {
  alert: document.getElementById("client-alert"),
  lookup: document.getElementById("client-lookup"),
  lookupInput: document.getElementById("client-order-number-input"),
  lookupBtn: document.getElementById("client-lookup-btn"),
  flow: document.getElementById("client-flow"),
  orderCard: document.getElementById("client-order-card"),
  invoicedOnly: document.getElementById("client-invoiced-only"),
  invoiceBox: document.getElementById("client-invoice-box"),
  downloadRow: document.getElementById("client-download-row"),
  dlXml: document.getElementById("client-dl-xml"),
  dlPdf: document.getElementById("client-dl-pdf"),
  rfc: document.getElementById("client-invoice-rfc"),
  validateRfc: document.getElementById("client-validate-rfc"),
  precargado: document.getElementById("client-precargado"),
  form: document.getElementById("client-receiver-form"),
  legalName: document.getElementById("client-legal-name"),
  taxRegime: document.getElementById("client-tax-regime"),
  street: document.getElementById("client-street"),
  exteriorNumber: document.getElementById("client-exterior-number"),
  interiorNumber: document.getElementById("client-interior-number"),
  neighborhood: document.getElementById("client-neighborhood"),
  zip: document.getElementById("client-zip"),
  locality: document.getElementById("client-locality"),
  municipality: document.getElementById("client-municipality"),
  state: document.getElementById("client-state"),
  country: document.getElementById("client-country"),
  cfdiUse: document.getElementById("client-cfdi-use"),
  email: document.getElementById("client-email"),
  saveClient: document.getElementById("client-save-client"),
  restartWrap: document.getElementById("client-restart-wrap"),
  restartBtn: document.getElementById("client-restart-btn"),
};

const clientPostalUi = createPostalCatalogUi({
  apiBase: API_BASE,
  zipInput: el.zip,
  stateInput: el.state,
  municipalityInput: el.municipality,
  neighborhoodSelect: el.neighborhood,
  neighborhoodCustom: document.getElementById("client-neighborhood-custom"),
  hintEl: document.getElementById("client-postal-hint"),
});

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
  }).format(Number(amount));
}

function formatLineQty(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toFixed(2);
}

function renderOrderLinesHtml(order) {
  const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
  if (!lines.length) return "";
  const cur = order.currency || "MXN";
  const body = lines
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description)}</td>
        <td class="num">${escapeHtml(formatLineQty(it.qty))}</td>
        <td class="num">${escapeHtml(formatMoney(it.unitPrice, cur))}</td>
        <td class="num">${escapeHtml(formatMoney(it.lineTotal, cur))}</td>
      </tr>`
    )
    .join("");
  return `<div class="client-order-lines-wrap">
    <p class="client-order-lines__title">Detalle del consumo</p>
    <table class="client-order-lines" aria-label="Conceptos consumidos">
      <thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Importe</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function showAlert(type, message) {
  el.alert.textContent = message;
  el.alert.classList.remove("is-hidden", "alert--error", "alert--success");
  if (type === "error") el.alert.classList.add("alert--error");
  else if (type === "success") el.alert.classList.add("alert--success");
  else el.alert.classList.add("is-hidden");
}

function showDownloads(urls) {
  if (!urls?.xml || !urls?.pdf) {
    el.downloadRow.classList.add("is-hidden");
    return;
  }
  const base = API_BASE || "";
  el.dlXml.href = urls.xml.startsWith("http") ? urls.xml : `${base}${urls.xml}`;
  el.dlPdf.href = urls.pdf.startsWith("http") ? urls.pdf : `${base}${urls.pdf}`;
  el.downloadRow.classList.remove("is-hidden");
}

function resetInvoiceUi() {
  showAlert(null, "");
  el.downloadRow.classList.add("is-hidden");
  el.precargado.classList.add("is-hidden");
  el.form.classList.add("is-hidden");
  el.rfc.value = "";
  el.form.reset();
  clientPostalUi.reset();
  el.cfdiUse.value = "G03";
  el.saveClient.checked = false;
}

async function fetchPublicOrder(params) {
  const q = new URLSearchParams();
  if (params.publicToken) q.set("token", params.publicToken);
  else {
    if (params.orderId) q.set("orderId", params.orderId);
    if (params.orderNumber) q.set("orderNumber", params.orderNumber);
  }
  const res = await fetch(`${API_BASE}/api/public/billable-order?${q}`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "order_not_found");
    err.status = res.status;
    throw err;
  }
  return data.order;
}

function renderOrderCard(order) {
  el.orderCard.innerHTML = `
    <p class="client-order-card__eyebrow">Tu consumo</p>
    <p class="client-order-card__title">Orden <strong>${escapeHtml(String(order.orderNumber))}</strong></p>
    <p class="client-order-card__meta">${escapeHtml(order.tableName || "")} · ${formatDate(order.date)}</p>
    <p class="client-order-card__amount">${formatMoney(order.total, order.currency)}</p>
    ${renderOrderLinesHtml(order)}
    <p class="client-order-card__desc">${escapeHtml(order.description || "")}</p>
  `;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function showFlowWithOrder(order) {
  showAlert(null, "");
  selectedOrder = order;
  el.flow.classList.remove("is-hidden");
  el.invoicedOnly.classList.add("is-hidden");
  el.invoiceBox.classList.add("is-hidden");
  renderOrderCard(order);

  if (order.status === "invoiced") {
    el.invoicedOnly.classList.remove("is-hidden");
    el.invoicedOnly.innerHTML =
      '<p class="client-invoiced-msg__text">Esta orden <strong>ya tiene factura generada</strong>. Si necesitas duplicado o ayuda, pregunta en mostrador.</p>';
    el.restartWrap.classList.remove("is-hidden");
    return;
  }

  el.invoiceBox.classList.remove("is-hidden");
  resetInvoiceUi();
  el.restartWrap.classList.add("is-hidden");
}

async function loadOrderFromQuery() {
  const p = new URLSearchParams(window.location.search);
  const publicToken = (p.get("t") || p.get("token") || "").trim();
  const orderId = (p.get("orderId") || p.get("id") || "").trim();
  const orderNumber = (
    p.get("orderNumber") ||
    p.get("n") ||
    p.get("orden") ||
    ""
  ).trim();

  if (!publicToken && !orderId && !orderNumber) return false;

  el.lookup.classList.add("is-hidden");
  try {
    const order = await fetchPublicOrder({
      publicToken: publicToken || undefined,
      orderId: orderId || undefined,
      orderNumber: orderNumber || undefined,
    });
    showFlowWithOrder(order);
  } catch {
    el.lookup.classList.remove("is-hidden");
    el.flow.classList.add("is-hidden");
    showAlert(
      "error",
      "No encontramos esa orden con el enlace. Ingresa el número de orden a mano o pide ayuda en mostrador."
    );
  }
  return true;
}

function fillReceiver(data) {
  el.legalName.value = data.legalName || "";
  el.taxRegime.value = data.taxRegime || "";
  el.street.value = data.street || "";
  el.exteriorNumber.value = data.exteriorNumber || "";
  el.interiorNumber.value = data.interiorNumber || "";
  el.zip.value = data.zipCode || "";
  el.locality.value = data.locality || "";
  el.municipality.value = data.municipality || "";
  el.state.value = data.state || "";
  el.country.value = data.country || "México";
  el.cfdiUse.value = data.cfdiUse || "G03";
  el.email.value = data.email || "";
}

async function onValidateRfc() {
  const rfc = el.rfc.value.trim();
  if (!rfc) {
    showAlert("error", "Ingresa tu RFC.");
    return;
  }
  showAlert(null, "");
  el.validateRfc.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/clients/lookup?${new URLSearchParams({ rfc })}`);
    const data = await res.json();
    if (res.status === 422 || !data.ok) {
      showAlert("error", formatValidationErrors(data));
      return;
    }
    el.precargado.classList.toggle("is-hidden", !data.found);
    el.form.classList.remove("is-hidden");
    if (data.found && data.client) {
      fillReceiver(data.client);
      await clientPostalUi.applySavedAddress(data.client);
    } else {
      fillReceiver({
        cfdiUse: "G03",
        country: "México",
      });
      clientPostalUi.reset();
    }
  } catch {
    showAlert("error", "Error de red. Intenta de nuevo.");
  } finally {
    el.validateRfc.disabled = false;
  }
}

async function onSubmitInvoice(ev) {
  ev.preventDefault();
  if (!selectedOrder) return;

  const receiverFields = {
    street: el.street.value,
    exteriorNumber: el.exteriorNumber.value,
    interiorNumber: el.interiorNumber.value,
    neighborhood: clientPostalUi.getNeighborhoodValue(),
    zipCode: el.zip.value,
    locality: el.locality.value,
    municipality: el.municipality.value,
    state: el.state.value,
    country: el.country.value,
  };
  const addrErr = validateReceiverAddress(receiverFields);
  if (addrErr) {
    showAlert("error", addrErr);
    return;
  }

  const payload = {
    orderId: selectedOrder.id,
    saveClient: el.saveClient.checked,
    receiver: {
      rfc: el.rfc.value.trim(),
      legalName: el.legalName.value.trim(),
      taxRegime: el.taxRegime.value,
      zipCode: el.zip.value.trim(),
      cfdiUse: el.cfdiUse.value,
      email: el.email.value.trim(),
      street: el.street.value.trim(),
      exteriorNumber: el.exteriorNumber.value.trim(),
      interiorNumber: el.interiorNumber.value.trim(),
      neighborhood: clientPostalUi.getNeighborhoodValue(),
      locality: el.locality.value.trim(),
      municipality: el.municipality.value.trim(),
      state: el.state.value.trim(),
      country: el.country.value.trim() || "México",
    },
  };

  showAlert(null, "");
  try {
    const res = await fetch(`${API_BASE}/api/invoices/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      const msg =
        data?.error === "facturama_stamp_failed" || data?.details
          ? formatStampOrApiErrors(data, { shortHints: true })
          : formatValidationErrors(data);
      showAlert("error", msg);
      return;
    }

    const refLine =
      data.stampSource === "facturama" && data.facturama?.uuid
        ? `UUID: ${data.facturama.uuid}`
        : `Referencia: ${data.reference}`;
    let emailNote = "";
    const em = data.email;
    if (em && data.stampSource === "facturama") {
      if (em.sent) emailNote = " Te enviamos el XML y PDF por correo.";
      else if (em.error) emailNote = ` No pudimos enviar el correo: ${em.error}`;
    }
    showAlert("success", `${data.message} ${refLine}.${emailNote}`);
    showDownloads(data.downloadUrls || null);
    el.form.classList.add("is-hidden");
    el.precargado.classList.add("is-hidden");
    el.restartWrap.classList.remove("is-hidden");
  } catch {
    showAlert("error", "Error de red al enviar la factura.");
  }
}

async function onLookupClick() {
  const num = el.lookupInput.value.trim();
  if (!num) {
    showAlert("error", "Escribe el número de orden.");
    return;
  }
  showAlert(null, "");
  el.lookupBtn.disabled = true;
  try {
    const order = await fetchPublicOrder({ orderNumber: num });
    el.lookup.classList.add("is-hidden");
    showFlowWithOrder(order);
  } catch {
    showAlert("error", "No encontramos una orden pendiente de factura con ese número.");
  } finally {
    el.lookupBtn.disabled = false;
  }
}

function onRestart() {
  selectedOrder = null;
  el.flow.classList.add("is-hidden");
  el.lookup.classList.remove("is-hidden");
  el.lookupInput.value = "";
  el.orderCard.innerHTML = "";
  resetInvoiceUi();
  showAlert(null, "");
  el.restartWrap.classList.add("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

el.lookupBtn.addEventListener("click", onLookupClick);
el.lookupInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    onLookupClick();
  }
});
el.validateRfc.addEventListener("click", onValidateRfc);
el.rfc.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    onValidateRfc();
  }
});
el.form.addEventListener("submit", onSubmitInvoice);
el.restartBtn.addEventListener("click", onRestart);

(async function init() {
  const loaded = await loadOrderFromQuery();
  if (!loaded) {
    el.flow.classList.add("is-hidden");
  }
})();
