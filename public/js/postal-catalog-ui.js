/**
 * CP → listas (colonias) y autollenado estado/municipio vía GET /api/catalogs/postal-code/:cp
 */
const MANUAL = "__manual__";

/**
 * @param {object} opts
 * @param {string} [opts.apiBase]
 * @param {HTMLInputElement} opts.zipInput
 * @param {HTMLInputElement} opts.stateInput
 * @param {HTMLInputElement} opts.municipalityInput
 * @param {HTMLSelectElement} opts.neighborhoodSelect
 * @param {HTMLInputElement} opts.neighborhoodCustom
 * @param {HTMLElement | null} [opts.hintEl]
 */
export function createPostalCatalogUi(opts) {
  const {
    apiBase = "",
    zipInput,
    stateInput,
    municipalityInput,
    neighborhoodSelect,
    neighborhoodCustom,
    hintEl,
  } = opts;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let debounceId = null;

  function setHint(text) {
    if (hintEl) hintEl.textContent = text;
  }

  function clearCatalogReadonly() {
    stateInput.readOnly = false;
    municipalityInput.readOnly = false;
    stateInput.classList.remove("text-input--catalog");
    municipalityInput.classList.remove("text-input--catalog");
  }

  function reset() {
    clearCatalogReadonly();
    neighborhoodSelect.innerHTML = "";
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— Primero el código postal —";
    neighborhoodSelect.appendChild(o);
    neighborhoodSelect.required = true;
    neighborhoodSelect.value = "";
    neighborhoodCustom.classList.add("is-hidden");
    neighborhoodCustom.value = "";
    neighborhoodCustom.required = false;
    setHint(
      "Ingresa 5 dígitos para cargar colonia, municipio y estado (catálogo SAT vía Facturama)."
    );
  }

  function applyManualOnlyMode(message) {
    clearCatalogReadonly();
    neighborhoodSelect.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Selecciona —";
    neighborhoodSelect.appendChild(o0);
    const oM = document.createElement("option");
    oM.value = MANUAL;
    oM.textContent = "Escribir colonia";
    oM.selected = true;
    neighborhoodSelect.appendChild(oM);
    neighborhoodSelect.required = false;
    neighborhoodCustom.classList.remove("is-hidden");
    neighborhoodCustom.required = true;
    setHint(message || "Completa colonia, municipio y estado a mano.");
  }

  /**
   * @param {Record<string, unknown>} data
   */
  function applyCatalogData(data) {
    if (!data.ok) {
      applyManualOnlyMode(
        typeof data.message === "string" ? data.message : ""
      );
      return;
    }

    if (data.stateName) {
      stateInput.value = String(data.stateName);
      stateInput.readOnly = true;
      stateInput.classList.add("text-input--catalog");
    } else {
      stateInput.readOnly = false;
      stateInput.classList.remove("text-input--catalog");
    }

    if (data.municipalityName) {
      municipalityInput.value = String(data.municipalityName);
      municipalityInput.readOnly = true;
      municipalityInput.classList.add("text-input--catalog");
    } else {
      municipalityInput.readOnly = false;
      municipalityInput.classList.remove("text-input--catalog");
    }

    neighborhoodSelect.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Selecciona colonia —";
    neighborhoodSelect.appendChild(o0);

    const list = Array.isArray(data.neighborhoods) ? data.neighborhoods : [];
    for (const n of list) {
      const opt = document.createElement("option");
      opt.value = n.name;
      opt.textContent = n.name;
      neighborhoodSelect.appendChild(opt);
    }

    const oM = document.createElement("option");
    oM.value = MANUAL;
    oM.textContent = "Otra colonia (escribir)";
    neighborhoodSelect.appendChild(oM);

    neighborhoodSelect.required = true;
    neighborhoodSelect.value = "";
    neighborhoodCustom.classList.add("is-hidden");
    neighborhoodCustom.value = "";
    neighborhoodCustom.required = false;

    if (list.length === 0) {
      neighborhoodSelect.value = MANUAL;
      neighborhoodSelect.required = false;
      neighborhoodCustom.classList.remove("is-hidden");
      neighborhoodCustom.required = true;
      setHint(
        "No hay colonias en catálogo para este CP; escribe la colonia o revisa el código."
      );
    } else {
      setHint("Colonias según catálogo SAT para este código postal.");
    }
  }

  function onNeighborhoodChange() {
    const v = neighborhoodSelect.value;
    if (v === MANUAL) {
      neighborhoodCustom.classList.remove("is-hidden");
      neighborhoodCustom.required = true;
      neighborhoodSelect.required = false;
    } else {
      neighborhoodCustom.classList.add("is-hidden");
      neighborhoodCustom.required = false;
      neighborhoodCustom.value = "";
      neighborhoodSelect.required = true;
    }
  }

  async function fetchCatalog(zip) {
    const res = await fetch(
      `${apiBase}/api/catalogs/postal-code/${encodeURIComponent(zip)}`
    );
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = { ok: false, message: `HTTP ${res.status}` };
    }
    if (!res.ok && data.ok !== false) {
      return {
        ok: false,
        message: data.message || `Error HTTP ${res.status}`,
      };
    }
    return data;
  }

  function onZipInput() {
    const z = zipInput.value.trim();
    if (debounceId) clearTimeout(debounceId);
    if (!/^\d{5}$/.test(z)) {
      if (z.length < 5) {
        reset();
      }
      return;
    }
    debounceId = setTimeout(async () => {
      debounceId = null;
      try {
        const data = await fetchCatalog(z);
        applyCatalogData(data);
      } catch {
        applyManualOnlyMode("No se pudo consultar el catálogo. Intenta de nuevo o completa a mano.");
      }
    }, 380);
  }

  neighborhoodSelect.addEventListener("change", onNeighborhoodChange);
  zipInput.addEventListener("input", onZipInput);

  function getNeighborhoodValue() {
    if (neighborhoodSelect.value === MANUAL) {
      return neighborhoodCustom.value.trim();
    }
    return neighborhoodSelect.value.trim();
  }

  /**
   * Tras precargar cliente: aplica CP y selecciona colonia guardada si coincide.
   * @param {Record<string, unknown>} data
   */
  async function applySavedAddress(data) {
    const z = String(data.zipCode || "").trim();
    if (!/^\d{5}$/.test(z)) return;
    zipInput.value = z;
    const want = String(data.neighborhood || "").trim();
    try {
      const data = await fetchCatalog(z);
      if (!data.ok) {
        applyManualOnlyMode(
          typeof data.message === "string" ? data.message : ""
        );
        if (want) {
          neighborhoodSelect.value = MANUAL;
          onNeighborhoodChange();
          neighborhoodCustom.value = want;
        }
        return;
      }
      applyCatalogData(data);
      if (!want) return;

      const hasOption = [...neighborhoodSelect.options].some(
        (o) => o.value === want && o.value !== MANUAL
      );
      if (hasOption) {
        neighborhoodSelect.value = want;
        onNeighborhoodChange();
      } else {
        neighborhoodSelect.value = MANUAL;
        onNeighborhoodChange();
        neighborhoodCustom.value = want;
      }
    } catch {
      applyManualOnlyMode("");
      if (want) {
        neighborhoodSelect.value = MANUAL;
        onNeighborhoodChange();
        neighborhoodCustom.value = want;
      }
    }
  }

  reset();

  return {
    getNeighborhoodValue,
    applySavedAddress,
    reset,
  };
}
