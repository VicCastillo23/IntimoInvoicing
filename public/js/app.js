import { formatValidationErrors, formatStampOrApiErrors } from "./invoice-errors.js";
import { validateReceiverAddress } from "./receiver-address.js";
import { createPostalCatalogUi } from "./postal-catalog-ui.js";

const API_BASE = "";

let debounceTimer;
let currentStatus = "all";
/** @type {Array<Record<string, unknown>>} */
let cachedOrders = [];
/** @type {Record<string, unknown> | null} */
let selectedOrder = null;

const el = {
  input: document.getElementById("search-input"),
  tbody: document.getElementById("orders-body"),
  meta: document.getElementById("result-meta"),
  chips: document.querySelectorAll(".chip"),
  invoicePanel: document.getElementById("invoice-panel"),
  invoiceClose: document.getElementById("invoice-close"),
  invoiceSummary: document.getElementById("invoice-order-summary"),
  invoiceRfc: document.getElementById("invoice-rfc"),
  invoiceValidateRfc: document.getElementById("invoice-validate-rfc"),
  invoicePrecargado: document.getElementById("invoice-precargado"),
  invoiceAlert: document.getElementById("invoice-alert"),
  receiverForm: document.getElementById("receiver-form"),
  receiverLegalName: document.getElementById("receiver-legal-name"),
  receiverTaxRegime: document.getElementById("receiver-tax-regime"),
  receiverStreet: document.getElementById("receiver-street"),
  receiverExteriorNumber: document.getElementById("receiver-exterior-number"),
  receiverInteriorNumber: document.getElementById("receiver-interior-number"),
  receiverNeighborhood: document.getElementById("receiver-neighborhood"),
  receiverZip: document.getElementById("receiver-zip"),
  receiverLocality: document.getElementById("receiver-locality"),
  receiverMunicipality: document.getElementById("receiver-municipality"),
  receiverState: document.getElementById("receiver-state"),
  receiverCountry: document.getElementById("receiver-country"),
  receiverCfdiUse: document.getElementById("receiver-cfdi-use"),
  receiverEmail: document.getElementById("receiver-email"),
  receiverSaveClient: document.getElementById("receiver-save-client"),
  invoicesBody: document.getElementById("invoices-body"),
  invoicesMeta: document.getElementById("invoices-meta"),
  invoiceDownloadRow: document.getElementById("invoice-download-row"),
  invoiceDlXml: document.getElementById("invoice-dl-xml"),
  invoiceDlPdf: document.getElementById("invoice-dl-pdf"),
};

const postalUi = createPostalCatalogUi({
  apiBase: API_BASE,
  zipInput: el.receiverZip,
  stateInput: el.receiverState,
  municipalityInput: el.receiverMunicipality,
  neighborhoodSelect: el.receiverNeighborhood,
  neighborhoodCustom: document.getElementById("receiver-neighborhood-custom"),
  hintEl: document.getElementById("receiver-postal-hint"),
});

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return String(iso);
  }
}

function formatMoney(amount, currency) {
  const n = Number(amount);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
  }).format(n);
}

function statusBadge(status) {
  if (status === "invoiced") {
    return '<span class="badge badge--success">Facturada</span>';
  }
  return '<span class="badge badge--warning">Pendiente factura</span>';
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderRows(orders) {
  cachedOrders = orders;

  if (!orders.length) {
    el.tbody.innerHTML =
      '<tr><td colspan="6" class="data-table__empty">No hay resultados para esta búsqueda.</td></tr>';
    return;
  }

  el.tbody.innerHTML = orders
    .map((o) => {
      const pending = o.status === "pending_invoice";
      const clientLink = o.publicInvoiceUrl
        ? `<a href="${escapeHtml(o.publicInvoiceUrl)}" class="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer" title="Enlace seguro para el cliente (QR)">Cliente</a>`
        : "";
      const invoiceBtn = `<button type="button" class="btn btn--primary btn--sm" data-action="invoice" data-order-id="${escapeHtml(o.id)}">Facturar</button>`;
      let action;
      if (pending) {
        action = clientLink ? `${clientLink} ${invoiceBtn}` : invoiceBtn;
      } else {
        action = clientLink || `<span class="meta-muted">—</span>`;
      }
      return `
    <tr>
      <td class="meta-muted">${formatDate(o.date)}</td>
      <td><strong>${escapeHtml(o.orderNumber)}</strong> <span class="meta-muted">· ${escapeHtml(o.tableName)}</span></td>
      <td class="amount">${formatMoney(o.total, o.currency)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${escapeHtml(o.description)}</td>
      <td class="data-table__col-action">${action}</td>
    </tr>`;
    })
    .join("");
}

function showInvoiceAlert(type, message) {
  el.invoiceAlert.textContent = message;
  el.invoiceAlert.classList.remove("is-hidden", "alert--error", "alert--success");
  if (type === "error") el.invoiceAlert.classList.add("alert--error");
  else if (type === "success") el.invoiceAlert.classList.add("alert--success");
  else el.invoiceAlert.classList.add("is-hidden");
}

function resetInvoiceFlow() {
  el.invoiceRfc.value = "";
  el.receiverForm.reset();
  postalUi.reset();
  el.receiverSaveClient.checked = true;
  el.invoicePrecargado.classList.add("is-hidden");
  el.receiverForm.classList.add("is-hidden");
  el.invoiceDownloadRow.classList.add("is-hidden");
  showInvoiceAlert(null, "");
}

/** @param {{ xml?: string; pdf?: string } | null | undefined} urls */
function showInvoiceDownloadRow(urls) {
  if (!urls?.xml || !urls?.pdf) {
    el.invoiceDownloadRow.classList.add("is-hidden");
    return;
  }
  const base = API_BASE || "";
  el.invoiceDlXml.href = urls.xml.startsWith("http")
    ? urls.xml
    : `${base}${urls.xml}`;
  el.invoiceDlPdf.href = urls.pdf.startsWith("http")
    ? urls.pdf
    : `${base}${urls.pdf}`;
  el.invoiceDownloadRow.classList.remove("is-hidden");
}

function openInvoicePanel(order) {
  selectedOrder = order;
  resetInvoiceFlow();
  el.invoicePanel.classList.remove("is-hidden");
  el.invoiceSummary.textContent = `Orden ${order.orderNumber} · ${formatMoney(order.total, order.currency)} · ${order.tableName} · ${formatDate(order.date)}`;
  el.invoicePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => el.invoiceRfc.focus(), 200);
}

function closeInvoicePanel() {
  el.invoicePanel.classList.add("is-hidden");
  selectedOrder = null;
  resetInvoiceFlow();
}

function fillReceiverForm(data) {
  el.receiverLegalName.value = data.legalName || "";
  el.receiverTaxRegime.value = data.taxRegime || "";
  el.receiverStreet.value = data.street || "";
  el.receiverExteriorNumber.value = data.exteriorNumber || "";
  el.receiverInteriorNumber.value = data.interiorNumber || "";
  el.receiverZip.value = data.zipCode || "";
  el.receiverLocality.value = data.locality || "";
  el.receiverMunicipality.value = data.municipality || "";
  el.receiverState.value = data.state || "";
  el.receiverCountry.value = data.country || "México";
  /** Por defecto G03 (Gastos en general), alineado a factura productiva de consumo en cafetería. */
  el.receiverCfdiUse.value = data.cfdiUse || "G03";
  el.receiverEmail.value = data.email || "";
}

async function validateRfc() {
  const rfc = el.invoiceRfc.value.trim();
  if (!rfc) {
    showInvoiceAlert("error", "Ingresa un RFC.");
    return;
  }

  showInvoiceAlert(null, "");
  el.invoiceValidateRfc.disabled = true;

  try {
    const url = `${API_BASE}/api/clients/lookup?${new URLSearchParams({ rfc })}`;
    const res = await fetch(url);
    const data = await res.json();

    if (res.status === 422 || !data.ok) {
      showInvoiceAlert("error", formatValidationErrors(data));
      return;
    }

    el.invoicePrecargado.classList.toggle("is-hidden", !data.found);
    el.receiverForm.classList.remove("is-hidden");

    if (data.found && data.client) {
      fillReceiverForm(data.client);
      await postalUi.applySavedAddress(data.client);
    } else {
      fillReceiverForm({
        legalName: "",
        taxRegime: "",
        street: "",
        exteriorNumber: "",
        interiorNumber: "",
        zipCode: "",
        locality: "",
        municipality: "",
        state: "",
        country: "México",
        cfdiUse: "G03",
        email: "",
      });
      postalUi.reset();
    }
  } catch {
    showInvoiceAlert("error", "Error de red al validar el RFC.");
  } finally {
    el.invoiceValidateRfc.disabled = false;
  }
}

async function submitInvoice(ev) {
  ev.preventDefault();
  if (!selectedOrder) return;

  const rfc = el.invoiceRfc.value.trim();
  const receiverFields = {
    street: el.receiverStreet.value,
    exteriorNumber: el.receiverExteriorNumber.value,
    interiorNumber: el.receiverInteriorNumber.value,
    neighborhood: postalUi.getNeighborhoodValue(),
    zipCode: el.receiverZip.value,
    locality: el.receiverLocality.value,
    municipality: el.receiverMunicipality.value,
    state: el.receiverState.value,
    country: el.receiverCountry.value,
  };
  const addrErr = validateReceiverAddress(receiverFields);
  if (addrErr) {
    showInvoiceAlert("error", addrErr);
    return;
  }

  const payload = {
    orderId: selectedOrder.id,
    saveClient: el.receiverSaveClient.checked,
    receiver: {
      rfc,
      legalName: el.receiverLegalName.value.trim(),
      taxRegime: el.receiverTaxRegime.value,
      zipCode: el.receiverZip.value.trim(),
      cfdiUse: el.receiverCfdiUse.value,
      email: el.receiverEmail.value.trim(),
      street: el.receiverStreet.value.trim(),
      exteriorNumber: el.receiverExteriorNumber.value.trim(),
      interiorNumber: el.receiverInteriorNumber.value.trim(),
      neighborhood: postalUi.getNeighborhoodValue(),
      locality: el.receiverLocality.value.trim(),
      municipality: el.receiverMunicipality.value.trim(),
      state: el.receiverState.value.trim(),
      country: el.receiverCountry.value.trim() || "México",
    },
  };

  showInvoiceAlert(null, "");

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
          ? formatStampOrApiErrors(data)
          : formatValidationErrors(data);
      showInvoiceAlert("error", msg);
      return;
    }

    const refLine =
      data.stampSource === "facturama" && data.facturama?.uuid
        ? `UUID: ${data.facturama.uuid}`
        : `Referencia: ${data.reference}`;
    const persistNote =
      data.persisted === false
        ? " (No se pudo guardar en disco; revisa permisos de data/invoices.json)."
        : "";
    const em = data.email;
    let emailNote = "";
    if (em && data.stampSource === "facturama") {
      if (em.sent) {
        emailNote = " Correo enviado con XML y PDF adjuntos.";
      } else if (em.error) {
        emailNote = ` No se pudo enviar el correo: ${em.error}`;
      } else if (em.reason === "no_recipient_email") {
        emailNote = " No se envió correo (sin correo del receptor).";
      } else if (em.reason === "smtp_not_configured") {
        emailNote =
          " No se envió correo: configura SMTP en el servidor (SMTP_HOST, SMTP_FROM).";
      }
    }
    showInvoiceAlert(
      "success",
      `${data.message} ${refLine}.${persistNote}${emailNote}`
    );
    showInvoiceDownloadRow(data.downloadUrls || null);
    el.receiverForm.classList.add("is-hidden");
    el.invoicePrecargado.classList.add("is-hidden");
    await load();
  } catch {
    showInvoiceAlert("error", "Error de red al enviar la factura.");
  }
}

async function fetchOrders(q) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (currentStatus !== "all") params.set("status", currentStatus);

  const url = `${API_BASE}/api/billable-orders?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderIssuedInvoices(invoices) {
  const list = Array.isArray(invoices) ? invoices : [];
  if (!list.length) {
    el.invoicesBody.innerHTML =
      '<tr><td colspan="6" class="data-table__empty">Aún no hay facturas en este registro. Timbrar una orden las mostrará aquí.</td></tr>';
    return;
  }

  el.invoicesBody.innerHTML = list
    .map((inv) => {
      const uuid = inv.uuid || "";
      const ref = inv.reference || "—";
      const label = uuid ? String(uuid).slice(0, 13) + "…" : escapeHtml(ref);
      const fullId = uuid || ref;
      const canDl =
        inv.stampSource === "facturama" && inv.facturamaId && uuid;
      const base = API_BASE || "";
      const xmlHref = canDl
        ? `${base}/api/invoices/${encodeURIComponent(fullId)}/download?format=xml`
        : "#";
      const pdfHref = canDl
        ? `${base}/api/invoices/${encodeURIComponent(fullId)}/download?format=pdf`
        : "#";
      const dl =
        canDl && fullId
          ? `<a class="invoice-inline-link" href="${escapeHtml(xmlHref)}">XML</a> · <a class="invoice-inline-link" href="${escapeHtml(pdfHref)}">PDF</a>`
          : `<span class="meta-muted">—</span>`;
      const ord = inv.order || {};
      const rcv = inv.receiver || {};
      return `
    <tr>
      <td class="meta-muted">${formatDate(inv.storedAt)}</td>
      <td><strong>${escapeHtml(String(ord.orderNumber || "—"))}</strong></td>
      <td>${escapeHtml(String(rcv.rfc || "—"))}</td>
      <td class="invoice-uuid-cell" title="${escapeHtml(uuid || ref)}">${label}</td>
      <td>${inv.stampSource === "facturama" ? '<span class="badge badge--success">Facturama</span>' : '<span class="badge badge--warning">Simulación</span>'}</td>
      <td class="data-table__col-action">${dl}</td>
    </tr>`;
    })
    .join("");
}

async function loadInvoices() {
  el.invoicesMeta.textContent = "Cargando…";
  try {
    const res = await fetch(`${API_BASE}/api/invoices`);
    const data = await res.json();
    const invoices = data.invoices || [];
    renderIssuedInvoices(invoices);
    el.invoicesMeta.textContent = `${invoices.length} factura(s) en registro local`;
  } catch {
    el.invoicesBody.innerHTML =
      '<tr><td colspan="6" class="data-table__empty">No se pudo cargar el listado de facturas.</td></tr>';
    el.invoicesMeta.textContent = "Error de red";
  }
}

async function load() {
  const q = el.input.value.trim();
  el.tbody.innerHTML =
    '<tr><td colspan="6" class="data-table__empty">Cargando…</td></tr>';

  try {
    const data = await fetchOrders(q);
    renderRows(data.orders || []);
    el.meta.textContent = `${data.count ?? 0} orden(es) · filtro: ${
      data.statusFilter === "all"
        ? "todas"
        : data.statusFilter === "pending_invoice"
          ? "pendiente factura"
          : "facturada"
    }`;
    await loadInvoices();
  } catch (e) {
    el.tbody.innerHTML = `<tr><td colspan="6" class="data-table__empty">Error al cargar. ¿El servidor está en marcha?</td></tr>`;
    el.meta.textContent = String(e.message);
    await loadInvoices();
  }
}

el.tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='invoice']");
  if (!btn) return;
  const id = btn.getAttribute("data-order-id");
  const order = cachedOrders.find((o) => o.id === id);
  if (order) openInvoicePanel(order);
});

el.invoiceClose.addEventListener("click", closeInvoicePanel);
el.invoiceValidateRfc.addEventListener("click", validateRfc);
el.receiverForm.addEventListener("submit", submitInvoice);

el.invoiceRfc.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    validateRfc();
  }
});

el.input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 280);
});

el.chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    el.chips.forEach((c) => c.classList.remove("chip--selected"));
    chip.classList.add("chip--selected");
    currentStatus = chip.dataset.status || "all";
    load();
  });
});

load();
