const STORAGE_KEY = "invoice-generator-draft-v3";
const STATUS_DURATION_MS = 2600;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const API_BASE =
  window.INVOICEGENNOW_API_BASE ||
  (window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://localhost:8787");
const SUPPORTED_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "INR"]);
const CANADA_REGIONS = new Set([
  "Ontario",
  "British Columbia",
  "Alberta",
  "Quebec",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
]);

const elements = {
  invoiceFeature: document.getElementById("invoiceFeature"),
  contractFeature: document.getElementById("contractFeature"),
  showInvoiceFeatureBtn: document.getElementById("showInvoiceFeatureBtn"),
  showContractFeatureBtn: document.getElementById("showContractFeatureBtn"),
  form: document.getElementById("invoiceForm"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  sections: Array.from(document.querySelectorAll(".form-section")),
  lineItemsHeader: document.getElementById("lineItemsHeader"),
  lineItems: document.getElementById("lineItems"),
  addItemBtn: document.getElementById("addItemBtn"),
  saveBtn: document.getElementById("saveBtn"),
  pdfBtn: document.getElementById("pdfBtn"),
  statusMessage: document.getElementById("statusMessage"),
  taxTypeControl: document.getElementById("taxTypeControl"),
  billingModeControl: document.getElementById("billingModeControl"),
  customFields: document.getElementById("customFields"),
  addCustomFieldBtn: document.getElementById("addCustomFieldBtn"),
  generateInvoiceBtn: document.getElementById("generateInvoiceBtn"),
  selectCustomerBtn: document.getElementById("selectCustomerBtn"),
  paymentMethodsContainer: document.getElementById("paymentMethodsContainer"),
  paymentAddButtons: Array.from(document.querySelectorAll(".payment-add-btn")),
  companyLogoInput: document.getElementById("companyLogoInput"),
  companyLogoDropzone: document.getElementById("companyLogoDropzone"),
  companyLogoPreview: document.getElementById("companyLogoPreview"),
  companyLogoPlaceholder: document.getElementById("companyLogoPlaceholder"),
  companySignatureInput: document.getElementById("companySignatureInput"),
  companySignatureDropzone: document.getElementById("companySignatureDropzone"),
  companySignaturePreview: document.getElementById("companySignaturePreview"),
  companySignaturePlaceholder: document.getElementById("companySignaturePlaceholder"),
  previewCompanyLogo: document.getElementById("previewCompanyLogo"),
  previewSignatureBlock: document.getElementById("previewSignatureBlock"),
  previewSignatureImage: document.getElementById("previewSignatureImage"),
  previewCustomFieldsBlock: document.getElementById("previewCustomFieldsBlock"),
  previewCustomFields: document.getElementById("previewCustomFields"),
  previewPaymentMethods: document.getElementById("previewPaymentMethods"),
  previewEndMessageBlock: document.getElementById("previewEndMessageBlock"),
  previewHeadSecond: document.getElementById("previewHeadSecond"),
  previewHeadThird: document.getElementById("previewHeadThird"),
  contractForm: document.getElementById("contractForm"),
  contractProvince: document.getElementById("contractProvince"),
  contractBusinessName: document.getElementById("contractBusinessName"),
  contractClientName: document.getElementById("contractClientName"),
  contractClientEmail: document.getElementById("contractClientEmail"),
  contractClientPhone: document.getElementById("contractClientPhone"),
  contractServiceType: document.getElementById("contractServiceType"),
  contractStartDate: document.getElementById("contractStartDate"),
  contractProjectFee: document.getElementById("contractProjectFee"),
  contractPaymentDueDays: document.getElementById("contractPaymentDueDays"),
  contractIncludedRevisions: document.getElementById("contractIncludedRevisions"),
  contractScopeNotes: document.getElementById("contractScopeNotes"),
  providerSignerName: document.getElementById("providerSignerName"),
  clientSignerName: document.getElementById("clientSignerName"),
  providerSignModeControl: document.getElementById("providerSignModeControl"),
  clientSignModeControl: document.getElementById("clientSignModeControl"),
  providerTypedWrap: document.getElementById("providerTypedWrap"),
  clientTypedWrap: document.getElementById("clientTypedWrap"),
  providerDrawWrap: document.getElementById("providerDrawWrap"),
  clientDrawWrap: document.getElementById("clientDrawWrap"),
  providerTypedSignature: document.getElementById("providerTypedSignature"),
  clientTypedSignature: document.getElementById("clientTypedSignature"),
  providerSignaturePad: document.getElementById("providerSignaturePad"),
  clientSignaturePad: document.getElementById("clientSignaturePad"),
  providerClearPadBtn: document.getElementById("providerClearPadBtn"),
  clientClearPadBtn: document.getElementById("clientClearPadBtn"),
  providerSignBtn: document.getElementById("providerSignBtn"),
  clientSignBtn: document.getElementById("clientSignBtn"),
  providerSignStatus: document.getElementById("providerSignStatus"),
  clientSignStatus: document.getElementById("clientSignStatus"),
  contractPdfBtn: document.getElementById("contractPdfBtn"),
  exportContractForClientBtn: document.getElementById("exportContractForClientBtn"),
  contractStatusMessage: document.getElementById("contractStatusMessage"),
  contractPreviewDateLine: document.getElementById("contractPreviewDateLine"),
  contractPreviewIntro: document.getElementById("contractPreviewIntro"),
  contractPreviewServiceType: document.getElementById("contractPreviewServiceType"),
  contractPreviewStartDate: document.getElementById("contractPreviewStartDate"),
  contractPreviewProjectFee: document.getElementById("contractPreviewProjectFee"),
  contractPreviewPaymentDue: document.getElementById("contractPreviewPaymentDue"),
  contractPreviewRevisions: document.getElementById("contractPreviewRevisions"),
  contractClausesList: document.getElementById("contractClausesList"),
  contractPreviewProviderSigner: document.getElementById("contractPreviewProviderSigner"),
  contractPreviewClientSigner: document.getElementById("contractPreviewClientSigner"),
  contractPreviewProviderDrawn: document.getElementById("contractPreviewProviderDrawn"),
  contractPreviewClientDrawn: document.getElementById("contractPreviewClientDrawn"),
  contractPreviewProviderTyped: document.getElementById("contractPreviewProviderTyped"),
  contractPreviewClientTyped: document.getElementById("contractPreviewClientTyped"),
  contractPreviewProviderStatus: document.getElementById("contractPreviewProviderStatus"),
  contractPreviewClientStatus: document.getElementById("contractPreviewClientStatus"),
};

const defaultState = createDefaultState();
let state = loadStateFromStorage();
let statusTimer = null;
let contractStatusTimer = null;
let currentFeature = "invoice";
const signaturePads = {
  provider: null,
  client: null,
};

bootstrap();

function bootstrap() {
  bindFeatureSwitcher();
  bindTabs();
  bindFormInputs();
  bindLineItemInteractions();
  bindDynamicCustomFields();
  bindPaymentMethods();
  bindUploads();
  bindContractFeature();
  bindActions();

  populateFormFromState();
  renderLineItems();
  renderCustomFields();
  renderPaymentCards();
  renderUploadPreviews();
  renderPreview();
  renderContractSigningUI();
  renderContractPreview();
  setActiveFeature("invoice");
  refreshIcons();
}

function bindFeatureSwitcher() {
  elements.showInvoiceFeatureBtn.addEventListener("click", () => {
    setActiveFeature("invoice");
  });

  elements.showContractFeatureBtn.addEventListener("click", () => {
    setActiveFeature("contract");
  });
}

function setActiveFeature(feature) {
  const nextFeature = feature === "contract" ? "contract" : "invoice";
  currentFeature = nextFeature;

  const showInvoice = nextFeature === "invoice";
  elements.invoiceFeature.classList.toggle("hidden", !showInvoice);
  elements.contractFeature.classList.toggle("hidden", showInvoice);
  elements.showInvoiceFeatureBtn.classList.toggle("active", showInvoice);
  elements.showContractFeatureBtn.classList.toggle("active", !showInvoice);

  if (!showInvoice) {
    // Canvases are hidden until contract mode is visible, so resize to make drawing work.
    window.setTimeout(() => {
      signaturePads.provider?.resize();
      signaturePads.client?.resize();
    }, 0);
  }
}

function createDefaultState() {
  const issue = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 15);

  return {
    company: {
      name: "Your Company",
      address: "123 Business Ave.",
      email: "contact@company.com",
      phone: "(555) 123-4567",
      logoDataUrl: "",
      signatureDataUrl: "",
    },
    customer: {
      display: "Customer | Company Name",
      identifier: "",
      address: "Customer billing address",
      zip: "",
      phone: "",
      email: "customer@company.com",
    },
    invoice: {
      number: generateInvoiceNumber(),
      issueDate: formatDateISO(issue),
      dueDate: formatDateISO(due),
      currency: "USD",
      termsOfPayment: "Due within 15 days",
      endMessage: "Thanks for your business.",
      customFields: [],
    },
    payment: {
      bank: {
        enabled: false,
        bankName: "",
        branch: "",
        address: "",
        accountName: "",
        accountNumber: "",
        routingNumber: "",
        sortCode: "",
        swiftCode: "",
        iban: "",
      },
      paypal: {
        enabled: false,
        email: "",
      },
      crypto: {
        enabled: false,
        currency: "",
        walletAddress: "",
      },
      custom: [],
    },
    contract: createDefaultContractState(issue),
    products: {
      items: [createEmptyItem({ name: "Product", hours: 1 })],
      billingMode: "hours",
      shippingCost: 0,
      discount: 0,
      taxRate: 0,
      taxType: "percent",
      taxIncluded: false,
    },
  };
}

function createDefaultContractState(todayDate) {
  return {
    province: "Ontario",
    businessName: "Your Company",
    clientName: "Client Name",
    clientEmail: "",
    clientPhone: "",
    serviceType: "Professional services",
    startDate: formatDateISO(todayDate),
    projectFee: 450,
    paymentDueDays: 14,
    includedRevisions: 1,
    scopeNotes: "",
    remoteSigning: {
      token: "",
      signUrl: "",
      expiresAt: "",
      lastSyncedAt: "",
      sentAt: "",
      sentVia: "",
      sentTo: "",
      notifyOwnerEmail: "",
      notifyOwnerPhone: "",
      deliveryChannel: "auto",
    },
    signatures: {
      provider: createDefaultContractSigner(),
      client: createDefaultContractSigner(),
    },
  };
}

function createDefaultContractSigner() {
  return {
    signerName: "",
    mode: "draw",
    typedSignature: "",
    finalType: "",
    finalValue: "",
    signedAt: "",
  };
}

function createEmptyItem(overrides = {}) {
  return {
    name: "",
    sku: "",
    hours: 1,
    rate: 0,
    ...overrides,
  };
}

function createCustomPayment(overrides = {}) {
  return {
    title: "Custom Payment",
    details: "",
    ...overrides,
  };
}

function loadStateFromStorage() {
  let serialized = null;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    return structuredClone(defaultState);
  }

  if (!serialized) {
    return structuredClone(defaultState);
  }

  try {
    const parsed = JSON.parse(serialized);
    return mergeState(parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(saved) {
  const merged = structuredClone(defaultState);

  if (!saved || typeof saved !== "object") {
    return merged;
  }

  if (saved.company && typeof saved.company === "object") {
    merged.company = {
      ...merged.company,
      name: sanitizeText(saved.company.name, merged.company.name),
      address: sanitizeText(saved.company.address, merged.company.address),
      email: sanitizeText(saved.company.email, merged.company.email),
      phone: sanitizeText(saved.company.phone, merged.company.phone),
      logoDataUrl: sanitizeDataUrl(saved.company.logoDataUrl),
      signatureDataUrl: sanitizeDataUrl(saved.company.signatureDataUrl),
    };
  }

  if (saved.customer && typeof saved.customer === "object") {
    const legacyDisplay = [saved.customer.name, saved.customer.company]
      .filter(Boolean)
      .join(" | ");

    merged.customer = {
      ...merged.customer,
      display: sanitizeText(
        saved.customer.display || legacyDisplay,
        merged.customer.display,
      ),
      identifier: sanitizeText(saved.customer.identifier, ""),
      address: sanitizeText(saved.customer.address, merged.customer.address),
      zip: sanitizeText(saved.customer.zip, ""),
      phone: sanitizeText(saved.customer.phone, ""),
      email: sanitizeText(saved.customer.email, merged.customer.email),
    };
  }

  if (saved.invoice && typeof saved.invoice === "object") {
    merged.invoice = {
      ...merged.invoice,
      number: sanitizeText(saved.invoice.number, merged.invoice.number),
      issueDate: sanitizeText(saved.invoice.issueDate, merged.invoice.issueDate),
      dueDate: sanitizeText(saved.invoice.dueDate, merged.invoice.dueDate),
      currency: sanitizeCurrency(saved.invoice.currency),
      termsOfPayment: sanitizeText(
        saved.invoice.termsOfPayment,
        sanitizeText(saved.payment?.terms, merged.invoice.termsOfPayment),
      ),
      endMessage: sanitizeText(
        saved.invoice.endMessage,
        sanitizeText(saved.payment?.notes, merged.invoice.endMessage),
      ),
      customFields: sanitizeCustomFields(saved.invoice.customFields),
    };
  }

  if (saved.payment && typeof saved.payment === "object") {
    merged.payment.bank = {
      ...merged.payment.bank,
      ...sanitizePaymentBlock(saved.payment.bank),
      enabled: Boolean(saved.payment.bank?.enabled),
    };

    merged.payment.paypal = {
      ...merged.payment.paypal,
      ...sanitizePaymentBlock(saved.payment.paypal),
      enabled: Boolean(saved.payment.paypal?.enabled),
    };

    merged.payment.crypto = {
      ...merged.payment.crypto,
      ...sanitizePaymentBlock(saved.payment.crypto),
      enabled: Boolean(saved.payment.crypto?.enabled),
    };

    if (Array.isArray(saved.payment.custom)) {
      merged.payment.custom = saved.payment.custom.map((entry) =>
        createCustomPayment({
          title: sanitizeText(entry?.title, "Custom Payment"),
          details: sanitizeText(entry?.details, ""),
        }),
      );
    }

    if (saved.payment.method && !hasAnyPaymentMethod(merged.payment)) {
      merged.payment.custom.push(
        createCustomPayment({
          title: "Payment Method",
          details: sanitizeText(saved.payment.method, ""),
        }),
      );
    }
  }

  if (saved.contract && typeof saved.contract === "object") {
    merged.contract = {
      ...merged.contract,
      province: sanitizeProvince(saved.contract.province),
      businessName: sanitizeText(saved.contract.businessName, merged.contract.businessName),
      clientName: sanitizeText(saved.contract.clientName, merged.contract.clientName),
      clientEmail: sanitizeText(saved.contract.clientEmail, ""),
      clientPhone: sanitizeText(saved.contract.clientPhone, ""),
      serviceType: sanitizeText(saved.contract.serviceType, merged.contract.serviceType),
      startDate: sanitizeText(saved.contract.startDate, merged.contract.startDate),
      projectFee: sanitizeNumber(saved.contract.projectFee, merged.contract.projectFee),
      paymentDueDays: sanitizeNumber(
        saved.contract.paymentDueDays,
        merged.contract.paymentDueDays,
      ),
      includedRevisions: sanitizeNumber(
        saved.contract.includedRevisions,
        merged.contract.includedRevisions,
      ),
      scopeNotes: sanitizeText(saved.contract.scopeNotes, ""),
      remoteSigning: {
        token: sanitizeText(saved.contract.remoteSigning?.token, ""),
        signUrl: sanitizeText(saved.contract.remoteSigning?.signUrl, ""),
        expiresAt: sanitizeText(saved.contract.remoteSigning?.expiresAt, ""),
        lastSyncedAt: sanitizeText(saved.contract.remoteSigning?.lastSyncedAt, ""),
        sentAt: sanitizeText(saved.contract.remoteSigning?.sentAt, ""),
        sentVia: sanitizeText(saved.contract.remoteSigning?.sentVia, ""),
        sentTo: sanitizeText(saved.contract.remoteSigning?.sentTo, ""),
        notifyOwnerEmail: sanitizeText(saved.contract.remoteSigning?.notifyOwnerEmail, ""),
        notifyOwnerPhone: sanitizeText(saved.contract.remoteSigning?.notifyOwnerPhone, ""),
        deliveryChannel: sanitizeDeliveryChannel(saved.contract.remoteSigning?.deliveryChannel),
      },
      signatures: {
        provider: sanitizeContractSigner(saved.contract.signatures?.provider),
        client: sanitizeContractSigner(saved.contract.signatures?.client),
      },
    };
  }

  if (saved.products && typeof saved.products === "object") {
    merged.products = { ...merged.products, ...saved.products };

    const items = Array.isArray(saved.products.items) ? saved.products.items : [];
    merged.products.items = items.length
      ? items.map((item) => ({
          name: sanitizeText(item?.name, ""),
          sku: sanitizeText(item?.sku, ""),
          hours: sanitizeNumber(item?.hours, 1),
          rate: sanitizeNumber(item?.rate, 0),
        }))
      : [createEmptyItem({ name: "Product", hours: 1 })];

    merged.products.shippingCost = sanitizeNumber(saved.products.shippingCost, 0);
    merged.products.discount = sanitizeNumber(saved.products.discount, 0);
    merged.products.taxRate = sanitizeNumber(saved.products.taxRate, 0);
    merged.products.billingMode = sanitizeBillingMode(saved.products.billingMode);
    merged.products.taxType =
      saved.products.taxType === "fixed" ? "fixed" : "percent";
    merged.products.taxIncluded = Boolean(saved.products.taxIncluded);
  }

  return merged;
}

function bindTabs() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      elements.tabButtons.forEach((btn) =>
        btn.classList.toggle("active", btn === button),
      );
      elements.sections.forEach((section) => {
        section.classList.toggle("active", section.dataset.section === tab);
      });
    });
  });
}

function bindFormInputs() {
  const onFormChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (handleDynamicInputs(target)) {
      persistDraft();
      renderPreview();
      return;
    }

    syncStateFromForm();

    persistDraft();
    renderPreview();
  };

  elements.form.addEventListener("input", onFormChange);
  elements.form.addEventListener("change", onFormChange);

  elements.taxTypeControl.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) {
      return;
    }

    const nextType = button.dataset.value;
    if (nextType !== "percent" && nextType !== "fixed") {
      return;
    }

    state.products.taxType = nextType;
    elements.taxTypeControl
      .querySelectorAll(".seg-btn")
      .forEach((btn) => btn.classList.toggle("active", btn === button));

    persistDraft();
    renderPreview();
  });

  elements.billingModeControl.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) {
      return;
    }

    const nextMode = sanitizeBillingMode(button.dataset.value);
    state.products.billingMode = nextMode;
    elements.billingModeControl
      .querySelectorAll(".seg-btn")
      .forEach((btn) => btn.classList.toggle("active", btn === button));

    persistDraft();
    renderLineItems();
    renderPreview();
    showStatus(
      nextMode === "fixed"
        ? "Invoice mode set to fixed work."
        : "Invoice mode set to hourly work.",
    );
  });
}

function syncStateFromForm() {
  state.products.shippingCost = sanitizeNumber(readValue("shippingCost"), 0);
  state.products.discount = sanitizeNumber(readValue("discount"), 0);
  state.products.taxRate = sanitizeNumber(readValue("taxRate"), 0);
  state.products.taxIncluded = readChecked("taxIncluded");

  state.customer.display = readValue("customerDisplay");
  state.customer.identifier = readValue("customerIdentifier");
  state.customer.address = readValue("customerAddress");
  state.customer.zip = readValue("customerZip");
  state.customer.phone = readValue("customerPhone");
  state.customer.email = readValue("customerEmail");

  state.invoice.number = readValue("invoiceNumber");
  state.invoice.termsOfPayment = readValue("termsOfPayment");
  state.invoice.issueDate = readValue("issueDate");
  state.invoice.dueDate = readValue("dueDate");
  state.invoice.currency = sanitizeCurrency(readValue("currency"));
  state.invoice.endMessage = readValue("endMessage");

  state.company.name = readValue("companyName");
  state.company.address = readValue("companyAddress");
  state.company.email = readValue("companyEmail");
  state.company.phone = readValue("companyPhone");
}

function handleDynamicInputs(target) {
  if (target.dataset.customFieldIndex !== undefined) {
    const index = Number(target.dataset.customFieldIndex);
    const key = target.dataset.customFieldKey;

    if (!Number.isFinite(index) || !state.invoice.customFields[index]) {
      return false;
    }

    if (key !== "label" && key !== "value") {
      return false;
    }

    state.invoice.customFields[index][key] = target.value;
    return true;
  }

  if (target.dataset.paymentSection !== undefined) {
    const section = target.dataset.paymentSection;
    const field = target.dataset.paymentField;

    if (!field) {
      return false;
    }

    if (section === "bank" && state.payment.bank.enabled) {
      state.payment.bank[field] = target.value;
      return true;
    }

    if (section === "paypal" && state.payment.paypal.enabled) {
      state.payment.paypal[field] = target.value;
      return true;
    }

    if (section === "crypto" && state.payment.crypto.enabled) {
      state.payment.crypto[field] = target.value;
      return true;
    }

    if (section === "custom") {
      const index = Number(target.dataset.customIndex);
      if (!Number.isFinite(index) || !state.payment.custom[index]) {
        return false;
      }
      state.payment.custom[index][field] = target.value;
      return true;
    }
  }

  return false;
}

function bindLineItemInteractions() {
  elements.lineItems.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest(".line-item-row");
    if (!row) {
      return;
    }

    const index = Number(row.dataset.index);
    const field = target.dataset.field;

    if (!Number.isFinite(index) || !field || !state.products.items[index]) {
      return;
    }

    if (field === "hours" || field === "rate") {
      state.products.items[index][field] = sanitizeNumber(target.value, 0);
    } else {
      state.products.items[index][field] = target.value;
    }

    persistDraft();
    renderPreview();
  });

  elements.lineItems.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-item");
    if (!button) {
      return;
    }

    const row = button.closest(".line-item-row");
    if (!row) {
      return;
    }

    const index = Number(row.dataset.index);
    if (!Number.isFinite(index)) {
      return;
    }

    state.products.items.splice(index, 1);
    if (!state.products.items.length) {
      state.products.items.push(createEmptyItem({ hours: 1 }));
    }

    persistDraft();
    renderLineItems();
    renderPreview();
  });
}

function bindDynamicCustomFields() {
  elements.addCustomFieldBtn.addEventListener("click", () => {
    state.invoice.customFields.push({ label: "", value: "" });
    persistDraft();
    renderCustomFields();
    renderPreview();
  });

  elements.customFields.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-custom-field");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.removeCustomField);
    if (!Number.isFinite(index)) {
      return;
    }

    state.invoice.customFields.splice(index, 1);
    persistDraft();
    renderCustomFields();
    renderPreview();
  });
}

function bindPaymentMethods() {
  elements.paymentAddButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const method = button.dataset.method;
      if (method === "bank") {
        if (state.payment.bank.enabled) {
          showStatus("Bank details are already added.");
          return;
        }
        state.payment.bank.enabled = true;
      } else if (method === "paypal") {
        if (state.payment.paypal.enabled) {
          showStatus("PayPal details are already added.");
          return;
        }
        state.payment.paypal.enabled = true;
      } else if (method === "crypto") {
        if (state.payment.crypto.enabled) {
          showStatus("Crypto details are already added.");
          return;
        }
        state.payment.crypto.enabled = true;
      } else if (method === "custom") {
        state.payment.custom.push(createCustomPayment());
      }

      persistDraft();
      renderPaymentCards();
      renderPreview();
    });
  });

  elements.paymentMethodsContainer.addEventListener("click", (event) => {
    const removeMethodButton = event.target.closest("[data-remove-method]");
    if (removeMethodButton) {
      const method = removeMethodButton.dataset.removeMethod;
      if (method === "bank") {
        state.payment.bank = { ...defaultState.payment.bank };
      } else if (method === "paypal") {
        state.payment.paypal = { ...defaultState.payment.paypal };
      } else if (method === "crypto") {
        state.payment.crypto = { ...defaultState.payment.crypto };
      }

      persistDraft();
      renderPaymentCards();
      renderPreview();
      return;
    }

    const removeCustomButton = event.target.closest("[data-remove-custom-payment]");
    if (!removeCustomButton) {
      return;
    }

    const index = Number(removeCustomButton.dataset.removeCustomPayment);
    if (!Number.isFinite(index)) {
      return;
    }

    state.payment.custom.splice(index, 1);
    persistDraft();
    renderPaymentCards();
    renderPreview();
  });
}

function bindUploads() {
  elements.companyLogoDropzone.addEventListener("click", () => {
    elements.companyLogoInput.click();
  });

  elements.companySignatureDropzone.addEventListener("click", () => {
    elements.companySignatureInput.click();
  });

  elements.companyLogoInput.addEventListener("change", () => {
    handleUploadSelection(elements.companyLogoInput.files?.[0], "logoDataUrl");
  });

  elements.companySignatureInput.addEventListener("change", () => {
    handleUploadSelection(
      elements.companySignatureInput.files?.[0],
      "signatureDataUrl",
    );
  });
}

function bindContractFeature() {
  initializeSignaturePads();

  const onContractInput = () => {
    syncContractStateFromForm();
    persistDraft();
    renderContractSigningUI();
    renderContractPreview();
  };

  elements.contractForm.addEventListener("input", onContractInput);
  elements.contractForm.addEventListener("change", onContractInput);

  elements.providerSignModeControl.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) {
      return;
    }
    state.contract.signatures.provider.mode = sanitizeSignerMode(button.dataset.mode);
    persistDraft();
    renderContractSigningUI();
    renderContractPreview();
  });

  elements.clientSignModeControl.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) {
      return;
    }
    state.contract.signatures.client.mode = sanitizeSignerMode(button.dataset.mode);
    persistDraft();
    renderContractSigningUI();
    renderContractPreview();
  });

  elements.providerClearPadBtn.addEventListener("click", () => {
    clearContractSignerPad("provider");
  });

  elements.clientClearPadBtn.addEventListener("click", () => {
    clearContractSignerPad("client");
  });

  elements.providerSignBtn.addEventListener("click", () => {
    signContractParty("provider");
  });

  elements.clientSignBtn.addEventListener("click", () => {
    signContractParty("client");
  });

  elements.contractPdfBtn.addEventListener("click", downloadContractPdf);

  elements.exportContractForClientBtn.addEventListener("click", () => {
    downloadContractPdf({ forClient: true });
  });
}

function initializeSignaturePads() {
  signaturePads.provider = createSignaturePad(elements.providerSignaturePad);
  signaturePads.client = createSignaturePad(elements.clientSignaturePad);
}

function createSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let hasStroke = false;
  let lastX = 0;
  let lastY = 0;
  let activePointerId = null;

  const setStyle = () => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#0f172a";
  };

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    setStyle();
    if (!hasStroke) {
      clear();
    }
  };

  const getPos = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    drawing = true;
    activePointerId = event.pointerId;
    const point = getPos(event);
    lastX = point.x;
    lastY = point.y;
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event) => {
    if (activePointerId !== null && event.pointerId !== activePointerId) {
      return;
    }
    if (!drawing) {
      return;
    }
    event.preventDefault();
    const point = getPos(event);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastX = point.x;
    lastY = point.y;
    hasStroke = true;
  };

  const onPointerUp = (event) => {
    if (activePointerId !== null && event?.pointerId !== activePointerId) {
      return;
    }
    drawing = false;
    activePointerId = null;
  };

  const clear = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
    setStyle();
  };

  const onMouseDown = (event) => {
    onPointerDown({
      ...event,
      pointerId: -1,
      preventDefault: () => event.preventDefault(),
    });
  };
  const onMouseMove = (event) => {
    onPointerMove({
      ...event,
      pointerId: -1,
      preventDefault: () => event.preventDefault(),
    });
  };
  const onMouseUp = (event) => {
    onPointerUp({ pointerId: -1 });
    event.preventDefault();
  };

  const touchToLikePointer = (touchEvent) => {
    const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
    return {
      clientX: touch?.clientX ?? 0,
      clientY: touch?.clientY ?? 0,
      pointerId: -2,
      preventDefault: () => touchEvent.preventDefault(),
    };
  };

  const onTouchStart = (event) => onPointerDown(touchToLikePointer(event));
  const onTouchMove = (event) => onPointerMove(touchToLikePointer(event));
  const onTouchEnd = (event) => {
    event.preventDefault();
    onPointerUp({ pointerId: -2 });
  };

  if ("PointerEvent" in window) {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
  } else {
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
  }
  window.addEventListener("resize", resize);

  resize();
  clear();

  return {
    clear,
    isEmpty: () => !hasStroke,
    toDataURL: () => canvas.toDataURL("image/png"),
    resize,
  };
}

function syncContractStateFromForm() {
  state.contract.province = sanitizeProvince(elements.contractProvince.value);
  state.contract.businessName = sanitizeText(elements.contractBusinessName.value, "");
  state.contract.clientName = sanitizeText(elements.contractClientName.value, "");
  state.contract.clientEmail = sanitizeText(elements.contractClientEmail.value, "");
  state.contract.clientPhone = sanitizeText(elements.contractClientPhone.value, "");
  state.contract.serviceType = sanitizeText(elements.contractServiceType.value, "");
  state.contract.startDate = sanitizeText(elements.contractStartDate.value, "");
  state.contract.projectFee = Math.max(0, sanitizeNumber(elements.contractProjectFee.value, 0));
  state.contract.paymentDueDays = Math.max(
    0,
    Math.round(sanitizeNumber(elements.contractPaymentDueDays.value, 0)),
  );
  state.contract.includedRevisions = Math.max(
    0,
    Math.round(sanitizeNumber(elements.contractIncludedRevisions.value, 0)),
  );
  state.contract.scopeNotes = sanitizeText(elements.contractScopeNotes.value, "");

  state.contract.signatures.provider.signerName = sanitizeText(
    elements.providerSignerName.value,
    "",
  );
  state.contract.signatures.client.signerName = sanitizeText(
    elements.clientSignerName.value,
    "",
  );
  state.contract.signatures.provider.typedSignature = sanitizeText(
    elements.providerTypedSignature.value,
    "",
  );
  state.contract.signatures.client.typedSignature = sanitizeText(
    elements.clientTypedSignature.value,
    "",
  );
}

function signContractParty(role) {
  syncContractStateFromForm();
  const signer = state.contract.signatures[role];
  const roleLabel = role === "provider" ? "Provider" : "Client";
  const suggestedName =
    role === "provider"
      ? (state.contract.businessName || "").trim()
      : (state.contract.clientName || "").trim();

  if (!signer.signerName.trim()) {
    if (suggestedName) {
      signer.signerName = suggestedName;
      if (role === "provider") {
        setValue("providerSignerName", suggestedName);
      } else {
        setValue("clientSignerName", suggestedName);
      }
    } else {
      showContractStatus(`${roleLabel} signer name is required before signing.`, true);
      return;
    }
  }

  if (signer.mode === "type") {
    if (!signer.typedSignature.trim()) {
      showContractStatus(`Type a ${roleLabel.toLowerCase()} signature first.`, true);
      return;
    }
    signer.finalType = "type";
    signer.finalValue = signer.typedSignature.trim();
  } else {
    const pad = signaturePads[role];
    if (!pad || pad.isEmpty()) {
      showContractStatus(`Draw a ${roleLabel.toLowerCase()} signature first.`, true);
      return;
    }
    signer.finalType = "draw";
    signer.finalValue = pad.toDataURL();
  }

  signer.signedAt = new Date().toISOString();
  persistDraft();
  renderContractSigningUI();
  renderContractPreview();
  showContractStatus(`${roleLabel} signed successfully.`);
}

function clearContractSignerPad(role) {
  const pad = signaturePads[role];
  const signer = state.contract.signatures[role];
  const roleLabel = role === "provider" ? "Provider" : "Client";
  pad?.clear();

  // Clearing the drawn pad invalidates the drawn final signature.
  if (signer.finalType === "draw") {
    signer.finalType = "";
    signer.finalValue = "";
    signer.signedAt = "";
    persistDraft();
    renderContractSigningUI();
    renderContractPreview();
    showContractStatus(`${roleLabel} drawn signature cleared.`);
    return;
  }

  showContractStatus(`${roleLabel} signature pad cleared.`);
}

async function createClientSignatureLink(options = {}) {
  syncContractStateFromForm();

  if (!state.contract.clientName.trim()) {
    showContractStatus("Client name is required before creating a signature link.", true);
    return;
  }
  if (!state.contract.businessName.trim()) {
    showContractStatus("Business name is required before sending.", true);
    return;
  }
  if (
    !state.contract.signatures.provider.signedAt ||
    !state.contract.signatures.provider.finalType ||
    !state.contract.signatures.provider.finalValue
  ) {
    showContractStatus("Sign as provider first before sending to client.", true);
    return;
  }

  const recipientEmail = sanitizeText(state.contract.clientEmail, "").trim();
  const recipientPhone = sanitizeText(state.contract.clientPhone, "").trim();
  const ownerEmail = sanitizeText(state.contract.remoteSigning.notifyOwnerEmail, "").trim();
  const ownerPhone = sanitizeText(state.contract.remoteSigning.notifyOwnerPhone, "").trim();
  const deliveryChannel = options.delivery?.channel
    ? sanitizeDeliveryChannel(options.delivery.channel)
    : sanitizeDeliveryChannel(state.contract.remoteSigning.deliveryChannel);

  if (!recipientEmail && !recipientPhone) {
    showContractStatus("Add client email or phone before sending a signature link.", true);
    return;
  }
  if (!ownerEmail && !ownerPhone) {
    showContractStatus("Add owner email or phone for signed-copy notifications.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/sign-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contract: state.contract,
        expiresInDays: 30,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Could not create signature link.");
    }

    const payload = await response.json();
    state.contract.remoteSigning.token = payload.token || "";
    state.contract.remoteSigning.signUrl = payload.signUrl || "";
    state.contract.remoteSigning.expiresAt = payload.expiresAt || "";
    state.contract.remoteSigning.lastSyncedAt = new Date().toISOString();
    const token = state.contract.remoteSigning.token;

    const sendResponse = await fetch(
      `${API_BASE}/api/sign-links/${encodeURIComponent(token)}/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: deliveryChannel,
          email: recipientEmail,
          phone: recipientPhone,
          ownerEmail,
          ownerPhone,
        }),
      },
    );

    if (!sendResponse.ok) {
      const errorPayload = await sendResponse.json().catch(() => ({}));
      const reason = errorPayload.error || "Could not send signature message.";
      if (state.contract.remoteSigning.signUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(state.contract.remoteSigning.signUrl).catch(() => {});
      }
      persistDraft();
      renderContractPreview();
      showContractStatus(`Link created, but delivery failed: ${reason}`, true);
      return;
    }

    const sendPayload = await sendResponse.json();
    state.contract.remoteSigning.sentAt =
      sendPayload.delivery?.sentAt || new Date().toISOString();
    state.contract.remoteSigning.sentVia = sendPayload.delivery?.channel || "";
    state.contract.remoteSigning.sentTo = sendPayload.delivery?.recipient || "";

    persistDraft();
    renderContractPreview();
    showContractStatus(
      `Signature link sent via ${state.contract.remoteSigning.sentVia.toUpperCase()} to ${state.contract.remoteSigning.sentTo}.`,
    );
  } catch (error) {
    showContractStatus(
      `Could not create signature link. Start backend server at ${API_BASE}.`,
      true,
    );
  }
}

async function refreshClientSignatureFromServer() {
  const token = state.contract.remoteSigning?.token;
  if (!token) {
    showContractStatus("No signature link token found. Create a link first.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/sign-links/${encodeURIComponent(token)}/full-contract`);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Could not refresh signature.");
    }

    const payload = await response.json();
    const remoteClientSigner = sanitizeContractSigner(
      payload.contract?.signatures?.client,
    );
    state.contract.signatures.client = remoteClientSigner;
    state.contract.remoteSigning.lastSyncedAt = new Date().toISOString();
    persistDraft();
    renderContractSigningUI();
    renderContractPreview();
    showContractStatus("Client signature refreshed from server.");
  } catch {
    showContractStatus("Could not refresh client signature from server.", true);
  }
}

function bindActions() {
  elements.addItemBtn.addEventListener("click", () => {
    state.products.items.push(createEmptyItem({ hours: 1 }));
    persistDraft();
    renderLineItems();
    renderPreview();
  });

  elements.saveBtn.addEventListener("click", () => {
    persistDraft();
    showStatus("Invoice draft saved to this browser.");
  });

  elements.generateInvoiceBtn.addEventListener("click", () => {
    state.invoice.number = generateInvoiceNumber();
    setValue("invoiceNumber", state.invoice.number);
    persistDraft();
    renderPreview();
  });

  elements.selectCustomerBtn.addEventListener("click", () => {
    showStatus("Enter customer details manually in the fields below.");
  });

  elements.pdfBtn.addEventListener("click", downloadPdf);
}

function renderLineItems() {
  renderLineItemsHeader();
  elements.lineItems.innerHTML = "";
  const billingMode = sanitizeBillingMode(state.products.billingMode);

  state.products.items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className =
      billingMode === "fixed" ? "line-item-row fixed-mode" : "line-item-row";
    row.dataset.index = String(index);

    if (billingMode === "fixed") {
      row.innerHTML = `
        <input
          type="text"
          data-field="name"
          placeholder="Service name"
          value="${escapeHtml(item.name)}"
        />
        <input
          type="text"
          data-field="sku"
          placeholder="Model/SKU"
          value="${escapeHtml(item.sku)}"
        />
        <input
          type="number"
          data-field="rate"
          min="0"
          step="0.01"
          inputmode="decimal"
          placeholder="Fixed amount"
          value="${formatEditableNumber(item.rate)}"
        />
        <button class="btn btn-danger remove-item" type="button" aria-label="Remove item">
          Remove
        </button>
      `;
    } else {
      row.innerHTML = `
        <input
          type="text"
          data-field="name"
          placeholder="Service name"
          value="${escapeHtml(item.name)}"
        />
        <input
          type="text"
          data-field="sku"
          placeholder="Model/SKU"
          value="${escapeHtml(item.sku)}"
        />
        <input
          type="number"
          data-field="hours"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${formatEditableNumber(item.hours)}"
        />
        <input
          type="number"
          data-field="rate"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${formatEditableNumber(item.rate)}"
        />
        <button class="btn btn-danger remove-item" type="button" aria-label="Remove item">
          Remove
        </button>
      `;
    }

    elements.lineItems.appendChild(row);
  });
}

function renderLineItemsHeader() {
  const billingMode = sanitizeBillingMode(state.products.billingMode);
  elements.lineItemsHeader.classList.toggle("fixed-mode", billingMode === "fixed");

  if (billingMode === "fixed") {
    elements.lineItemsHeader.innerHTML = `
      <span>Name</span>
      <span>Model/SKU</span>
      <span>Fixed Amount</span>
      <span></span>
    `;
    return;
  }

  elements.lineItemsHeader.innerHTML = `
    <span>Name</span>
    <span>Model/SKU</span>
    <span>Hours</span>
    <span>Rate (/Hour)</span>
    <span></span>
  `;
}

function renderCustomFields() {
  elements.customFields.innerHTML = "";

  if (!state.invoice.customFields.length) {
    const hint = document.createElement("p");
    hint.className = "helper";
    hint.textContent = "No custom fields added yet.";
    elements.customFields.appendChild(hint);
    return;
  }

  state.invoice.customFields.forEach((field, index) => {
    const row = document.createElement("div");
    row.className = "dynamic-row";
    row.innerHTML = `
      <div class="dynamic-row-grid">
        <label>
          Label
          <input
            type="text"
            placeholder="Field label"
            data-custom-field-index="${index}"
            data-custom-field-key="label"
            value="${escapeHtml(field.label)}"
          />
        </label>
        <label>
          Value
          <input
            type="text"
            placeholder="Field value"
            data-custom-field-index="${index}"
            data-custom-field-key="value"
            value="${escapeHtml(field.value)}"
          />
        </label>
        <button
          class="btn btn-danger remove-custom-field"
          type="button"
          data-remove-custom-field="${index}"
        >
          Remove
        </button>
      </div>
    `;
    elements.customFields.appendChild(row);
  });
}

function renderPaymentCards() {
  elements.paymentMethodsContainer.innerHTML = "";

  if (state.payment.bank.enabled) {
    elements.paymentMethodsContainer.appendChild(createBankCard());
  }

  if (state.payment.crypto.enabled) {
    elements.paymentMethodsContainer.appendChild(createCryptoCard());
  }

  if (state.payment.paypal.enabled) {
    elements.paymentMethodsContainer.appendChild(createPaypalCard());
  }

  state.payment.custom.forEach((entry, index) => {
    elements.paymentMethodsContainer.appendChild(createCustomPaymentCard(entry, index));
  });

  if (
    !state.payment.bank.enabled &&
    !state.payment.crypto.enabled &&
    !state.payment.paypal.enabled &&
    state.payment.custom.length === 0
  ) {
    const hint = document.createElement("p");
    hint.className = "helper";
    hint.textContent = "No payment method added yet.";
    elements.paymentMethodsContainer.appendChild(hint);
  }

  updatePaymentAddButtons();
  refreshIcons();
}

function updatePaymentAddButtons() {
  elements.paymentAddButtons.forEach((button) => {
    const method = button.dataset.method;
    const isActive =
      (method === "bank" && state.payment.bank.enabled) ||
      (method === "paypal" && state.payment.paypal.enabled) ||
      (method === "crypto" && state.payment.crypto.enabled);
    button.classList.toggle("is-active", isActive);
  });
}

function createBankCard() {
  const card = document.createElement("div");
  card.className = "payment-card";
  card.innerHTML = `
    <h4>Bank</h4>
    <div class="payment-card-grid">
      <input type="text" placeholder="Bank Name" data-payment-section="bank" data-payment-field="bankName" value="${escapeHtml(state.payment.bank.bankName)}" />
      <input type="text" placeholder="Branch" data-payment-section="bank" data-payment-field="branch" value="${escapeHtml(state.payment.bank.branch)}" />
      <input type="text" placeholder="Address" data-payment-section="bank" data-payment-field="address" value="${escapeHtml(state.payment.bank.address)}" />
      <input type="text" placeholder="Account Name" data-payment-section="bank" data-payment-field="accountName" value="${escapeHtml(state.payment.bank.accountName)}" />
      <input type="text" placeholder="Account Number" data-payment-section="bank" data-payment-field="accountNumber" value="${escapeHtml(state.payment.bank.accountNumber)}" />
      <input type="text" placeholder="Routing Number" data-payment-section="bank" data-payment-field="routingNumber" value="${escapeHtml(state.payment.bank.routingNumber)}" />
      <input type="text" placeholder="Sort Code" data-payment-section="bank" data-payment-field="sortCode" value="${escapeHtml(state.payment.bank.sortCode)}" />
      <input type="text" placeholder="SWIFT Code" data-payment-section="bank" data-payment-field="swiftCode" value="${escapeHtml(state.payment.bank.swiftCode)}" />
      <input type="text" placeholder="IBAN" data-payment-section="bank" data-payment-field="iban" value="${escapeHtml(state.payment.bank.iban)}" />
    </div>
    <button class="btn btn-danger" type="button" data-remove-method="bank">Remove</button>
  `;
  return card;
}

function createCryptoCard() {
  const card = document.createElement("div");
  card.className = "payment-card";
  card.innerHTML = `
    <h4>Crypto</h4>
    <div class="payment-card-grid">
      <input type="text" placeholder="Crypto Currency (e.g. BTC)" data-payment-section="crypto" data-payment-field="currency" value="${escapeHtml(state.payment.crypto.currency)}" />
      <input type="text" placeholder="Wallet Address" data-payment-section="crypto" data-payment-field="walletAddress" value="${escapeHtml(state.payment.crypto.walletAddress)}" />
    </div>
    <button class="btn btn-danger" type="button" data-remove-method="crypto">Remove</button>
  `;
  return card;
}

function createPaypalCard() {
  const card = document.createElement("div");
  card.className = "payment-card";
  card.innerHTML = `
    <h4>PayPal</h4>
    <div class="payment-card-grid single">
      <input type="email" placeholder="PayPal Email" data-payment-section="paypal" data-payment-field="email" value="${escapeHtml(state.payment.paypal.email)}" />
    </div>
    <button class="btn btn-danger" type="button" data-remove-method="paypal">Remove</button>
  `;
  return card;
}

function createCustomPaymentCard(entry, index) {
  const card = document.createElement("div");
  card.className = "payment-card";
  card.innerHTML = `
    <h4>${escapeHtml(entry.title || "Custom Payment")}</h4>
    <div class="payment-card-grid single">
      <input type="text" placeholder="Custom payment title" data-payment-section="custom" data-payment-field="title" data-custom-index="${index}" value="${escapeHtml(entry.title)}" />
      <textarea rows="3" placeholder="Details" data-payment-section="custom" data-payment-field="details" data-custom-index="${index}">${escapeHtml(entry.details)}</textarea>
    </div>
    <button class="btn btn-danger" type="button" data-remove-custom-payment="${index}">Remove</button>
  `;
  return card;
}

function renderUploadPreviews() {
  renderUploadPreview(
    elements.companyLogoPreview,
    elements.companyLogoPlaceholder,
    state.company.logoDataUrl,
  );

  renderUploadPreview(
    elements.companySignaturePreview,
    elements.companySignaturePlaceholder,
    state.company.signatureDataUrl,
  );

  toggleImage(elements.previewCompanyLogo, state.company.logoDataUrl);
  toggleImage(elements.previewSignatureImage, state.company.signatureDataUrl);
  elements.previewSignatureBlock.classList.toggle(
    "hidden",
    !state.company.signatureDataUrl,
  );
}

function renderUploadPreview(previewNode, placeholderNode, dataUrl) {
  if (dataUrl) {
    previewNode.src = dataUrl;
    previewNode.classList.remove("hidden");
    placeholderNode.classList.add("hidden");
  } else {
    previewNode.src = "";
    previewNode.classList.add("hidden");
    placeholderNode.classList.remove("hidden");
  }
}

function toggleImage(imageNode, dataUrl) {
  if (dataUrl) {
    imageNode.src = dataUrl;
    imageNode.classList.remove("hidden");
  } else {
    imageNode.src = "";
    imageNode.classList.add("hidden");
  }
}

function handleUploadSelection(file, targetField) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showStatus("Please upload an image file.", true);
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    showStatus("Image size must be 2MB or smaller.", true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = sanitizeDataUrl(reader.result);
    if (!dataUrl) {
      showStatus("Image upload failed.", true);
      return;
    }

    state.company[targetField] = dataUrl;
    persistDraft();
    renderUploadPreviews();
    renderPreview();
  };

  reader.readAsDataURL(file);
}

function populateFormFromState() {
  setValue("shippingCost", state.products.shippingCost);
  setValue("discount", state.products.discount);
  setValue("taxRate", state.products.taxRate);
  setChecked("taxIncluded", state.products.taxIncluded);

  setValue("customerDisplay", state.customer.display);
  setValue("customerIdentifier", state.customer.identifier);
  setValue("customerAddress", state.customer.address);
  setValue("customerZip", state.customer.zip);
  setValue("customerPhone", state.customer.phone);
  setValue("customerEmail", state.customer.email);

  setValue("invoiceNumber", state.invoice.number);
  setValue("termsOfPayment", state.invoice.termsOfPayment);
  setValue("issueDate", state.invoice.issueDate);
  setValue("dueDate", state.invoice.dueDate);
  setValue("currency", sanitizeCurrency(state.invoice.currency));
  setValue("endMessage", state.invoice.endMessage);

  setValue("companyName", state.company.name);
  setValue("companyAddress", state.company.address);
  setValue("companyEmail", state.company.email);
  setValue("companyPhone", state.company.phone);

  setValue("contractProvince", state.contract.province);
  setValue("contractBusinessName", state.contract.businessName);
  setValue("contractClientName", state.contract.clientName);
  setValue("contractClientEmail", state.contract.clientEmail);
  setValue("contractClientPhone", state.contract.clientPhone);
  setValue("contractServiceType", state.contract.serviceType);
  setValue("contractStartDate", state.contract.startDate);
  setValue("contractProjectFee", state.contract.projectFee);
  setValue("contractPaymentDueDays", state.contract.paymentDueDays);
  setValue("contractIncludedRevisions", state.contract.includedRevisions);
  setValue("contractScopeNotes", state.contract.scopeNotes);
  setValue("providerSignerName", state.contract.signatures.provider.signerName);
  setValue("clientSignerName", state.contract.signatures.client.signerName);
  setValue(
    "providerTypedSignature",
    state.contract.signatures.provider.typedSignature,
  );
  setValue("clientTypedSignature", state.contract.signatures.client.typedSignature);

  const typeButton = elements.taxTypeControl.querySelector(
    `.seg-btn[data-value="${state.products.taxType}"]`,
  );
  elements.taxTypeControl
    .querySelectorAll(".seg-btn")
    .forEach((button) => button.classList.toggle("active", button === typeButton));

  const billingModeButton = elements.billingModeControl.querySelector(
    `.seg-btn[data-value="${sanitizeBillingMode(state.products.billingMode)}"]`,
  );
  elements.billingModeControl
    .querySelectorAll(".seg-btn")
    .forEach((button) => button.classList.toggle("active", button === billingModeButton));

  applySignerModeControlState("provider");
  applySignerModeControlState("client");
}

function renderPreview() {
  setText("previewCompanyName", state.company.name || "Your Company");
  setText("previewCompanyAddress", state.company.address || "-");
  setText("previewCompanyEmail", state.company.email || "-");
  setText("previewCompanyPhone", state.company.phone || "-");

  setText("previewInvoiceNumber", state.invoice.number || "-");
  setText("previewIssueDate", formatDateHuman(state.invoice.issueDate));
  setText("previewDueDate", formatDateHuman(state.invoice.dueDate));

  const parsedCustomer = parseCustomerDisplay(state.customer.display);
  setText("previewCustomerName", parsedCustomer.name || "Customer");
  setText("previewCustomerCompany", parsedCustomer.company || "Company Name");
  setText(
    "previewCustomerIdentifier",
    `ID: ${state.customer.identifier || "-"}`,
  );
  setText("previewCustomerEmail", state.customer.email || "-");
  setText("previewCustomerPhone", `Phone: ${state.customer.phone || "-"}`);
  setText("previewCustomerAddress", state.customer.address || "-");
  setText("previewCustomerZip", `Zip: ${state.customer.zip || "-"}`);

  setText(
    "previewTermsOfPayment",
    state.invoice.termsOfPayment || "No payment terms set.",
  );

  renderPreviewItems();
  renderPreviewCustomFields();
  renderPreviewPaymentMethods();
  renderPreviewEndMessage();

  const totals = calculateTotals();
  setText("previewSubtotal", formatCurrency(totals.subtotal));
  setText("previewTax", formatCurrency(totals.tax));
  setText("previewShipping", formatCurrency(totals.shipping));
  setText("previewDiscount", `-${formatCurrency(totals.discount)}`);
  setText("previewTotal", formatCurrency(totals.total));

  const taxLabel =
    state.products.taxType === "percent"
      ? `Tax (${trimTrailingZeros(state.products.taxRate)}%):`
      : "Tax (fixed):";
  setText("previewTaxLabel", taxLabel);

  renderUploadPreviews();
}

function renderPreviewItems() {
  renderPreviewTableHeader();
  const previewItems = document.getElementById("previewItems");
  previewItems.innerHTML = "";
  const billingMode = sanitizeBillingMode(state.products.billingMode);

  state.products.items.forEach((item) => {
    const row = document.createElement("tr");
    const lineAmount = calculateLineAmount(item);
    const secondCol = billingMode === "fixed" ? "Fixed" : trimTrailingZeros(item.hours);

    row.innerHTML = `
      <td>${escapeHtml(item.name || "Service")}</td>
      <td>${secondCol}</td>
      <td>${formatCurrency(item.rate)}</td>
      <td>${formatCurrency(lineAmount)}</td>
    `;

    previewItems.appendChild(row);
  });
}

function renderPreviewTableHeader() {
  const billingMode = sanitizeBillingMode(state.products.billingMode);
  setText("previewHeadSecond", billingMode === "fixed" ? "Type" : "Hours");
  setText("previewHeadThird", billingMode === "fixed" ? "Fixed Price" : "Rate (/Hour)");
}

function renderPreviewCustomFields() {
  elements.previewCustomFields.innerHTML = "";

  const fieldsToShow = state.invoice.customFields.filter(
    (field) => field.label.trim() || field.value.trim(),
  );

  elements.previewCustomFieldsBlock.classList.toggle(
    "hidden",
    fieldsToShow.length === 0,
  );

  fieldsToShow.forEach((field) => {
    const row = document.createElement("div");
    row.className = "cf-row";

    const dt = document.createElement("dt");
    dt.textContent = field.label || "Field";

    const dd = document.createElement("dd");
    dd.textContent = field.value || "-";

    row.appendChild(dt);
    row.appendChild(dd);
    elements.previewCustomFields.appendChild(row);
  });
}

function renderPreviewPaymentMethods() {
  elements.previewPaymentMethods.innerHTML = "";

  const cards = [];

  if (state.payment.bank.enabled) {
    cards.push({
      title: "Bank",
      lines: [
        pairText("Bank", state.payment.bank.bankName),
        pairText("Branch", state.payment.bank.branch),
        pairText("Account", state.payment.bank.accountName),
        pairText("Account #", state.payment.bank.accountNumber),
        pairText("Routing", state.payment.bank.routingNumber),
        pairText("SWIFT", state.payment.bank.swiftCode),
        pairText("IBAN", state.payment.bank.iban),
      ],
    });
  }

  if (state.payment.crypto.enabled) {
    cards.push({
      title: "Crypto",
      lines: [
        pairText("Currency", state.payment.crypto.currency),
        pairText("Wallet", state.payment.crypto.walletAddress),
      ],
    });
  }

  if (state.payment.paypal.enabled) {
    cards.push({
      title: "PayPal",
      lines: [pairText("Email", state.payment.paypal.email)],
    });
  }

  state.payment.custom.forEach((entry) => {
    cards.push({
      title: entry.title || "Custom Payment",
      lines: [entry.details || "-"],
    });
  });

  if (!cards.length) {
    const fallback = document.createElement("p");
    fallback.className = "muted";
    fallback.textContent = "No payment method added.";
    elements.previewPaymentMethods.appendChild(fallback);
    return;
  }

  cards.forEach((cardData) => {
    const card = document.createElement("div");
    card.className = "preview-payment-card";

    const title = document.createElement("h5");
    title.textContent = cardData.title;
    card.appendChild(title);

    cardData.lines
      .filter(Boolean)
      .forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        card.appendChild(p);
      });

    elements.previewPaymentMethods.appendChild(card);
  });
}

function renderPreviewEndMessage() {
  const message = state.invoice.endMessage.trim();
  elements.previewEndMessageBlock.classList.toggle("hidden", !message);
  if (message) {
    setText("previewEndMessage", message);
  }
}

function renderContractSigningUI() {
  applySignerModeControlState("provider");
  applySignerModeControlState("client");

  applySignerStatusNode(elements.providerSignStatus, "provider");
  applySignerStatusNode(elements.clientSignStatus, "client");
}

function applySignerModeControlState(role) {
  const signer = state.contract.signatures[role];
  const control =
    role === "provider" ? elements.providerSignModeControl : elements.clientSignModeControl;
  const typedWrap = role === "provider" ? elements.providerTypedWrap : elements.clientTypedWrap;
  const drawWrap = role === "provider" ? elements.providerDrawWrap : elements.clientDrawWrap;

  control.querySelectorAll(".seg-btn").forEach((button) => {
    const isActive = button.dataset.mode === signer.mode;
    button.classList.toggle("active", isActive);
  });

  typedWrap.classList.toggle("hidden", signer.mode !== "type");
  drawWrap.classList.toggle("hidden", signer.mode !== "draw");
}

function renderContractPreview() {
  const contract = state.contract;
  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(addDaysToDateISO(contract.startDate, contract.paymentDueDays));

  elements.contractPreviewDateLine.textContent = `Date: ${startDate} | Province: ${contract.province}`;
  elements.contractPreviewIntro.textContent =
    `This Service Agreement is between ${contract.businessName || "Business"} and ${contract.clientName || "Client"}.`;
  elements.contractPreviewServiceType.textContent = contract.serviceType || "-";
  elements.contractPreviewStartDate.textContent = startDate;
  elements.contractPreviewProjectFee.textContent = formatContractCurrency(contract.projectFee);
  elements.contractPreviewPaymentDue.textContent =
    `${contract.paymentDueDays} day${contract.paymentDueDays === 1 ? "" : "s"} (by ${dueDate})`;
  elements.contractPreviewRevisions.textContent = `${contract.includedRevisions}`;

  renderContractClausesList();
  renderRemoteSigningStatus();

  renderContractSignerPreview("provider");
  renderContractSignerPreview("client");
}

function renderRemoteSigningStatus() {
  if (!elements.remoteSigningLink) {
    return;
  }
  const link = state.contract.remoteSigning?.signUrl || "";
  if (!link) {
    elements.remoteSigningLink.textContent = "";
    return;
  }

  const expiresAt = state.contract.remoteSigning.expiresAt
    ? formatDateTimeHuman(state.contract.remoteSigning.expiresAt)
    : "-";
  const syncedAt = state.contract.remoteSigning.lastSyncedAt
    ? formatDateTimeHuman(state.contract.remoteSigning.lastSyncedAt)
    : "Not yet";
  const sentAt = state.contract.remoteSigning.sentAt
    ? formatDateTimeHuman(state.contract.remoteSigning.sentAt)
    : "Not sent";
  const sentVia = state.contract.remoteSigning.sentVia || "-";
  const sentTo = state.contract.remoteSigning.sentTo || "-";
  const ownerEmail = state.contract.remoteSigning.notifyOwnerEmail || "-";
  const ownerPhone = state.contract.remoteSigning.notifyOwnerPhone || "-";

  elements.remoteSigningLink.textContent = "";
  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = "Open client signing link";
  elements.remoteSigningLink.appendChild(anchor);
  elements.remoteSigningLink.appendChild(
    document.createTextNode(
      ` | Expires: ${expiresAt} | Last sync: ${syncedAt} | Sent: ${sentVia} to ${sentTo} (${sentAt}) | Owner notify: ${ownerEmail} / ${ownerPhone}`,
    ),
  );
}

function renderContractClausesList() {
  const clauses = getContractClauses(state.contract);
  elements.contractClausesList.innerHTML = "";
  clauses.forEach((clause) => {
    const li = document.createElement("li");
    li.textContent = clause;
    elements.contractClausesList.appendChild(li);
  });
}

function renderContractSignerPreview(role) {
  const signer = state.contract.signatures[role];
  const signerNameNode =
    role === "provider"
      ? elements.contractPreviewProviderSigner
      : elements.contractPreviewClientSigner;
  const drawnNode =
    role === "provider"
      ? elements.contractPreviewProviderDrawn
      : elements.contractPreviewClientDrawn;
  const typedNode =
    role === "provider"
      ? elements.contractPreviewProviderTyped
      : elements.contractPreviewClientTyped;
  const statusNode =
    role === "provider"
      ? elements.contractPreviewProviderStatus
      : elements.contractPreviewClientStatus;

  signerNameNode.textContent = `Signer: ${signer.signerName || "-"}`;
  applySignerStatusNode(statusNode, role);

  if (signer.finalType === "draw" && signer.finalValue) {
    drawnNode.src = signer.finalValue;
    drawnNode.classList.remove("hidden");
    typedNode.classList.add("hidden");
    typedNode.textContent = "";
    return;
  }

  if (signer.finalType === "type" && signer.finalValue) {
    typedNode.textContent = signer.finalValue;
    typedNode.classList.remove("hidden");
    drawnNode.classList.add("hidden");
    drawnNode.src = "";
    return;
  }

  drawnNode.classList.add("hidden");
  drawnNode.src = "";
  typedNode.classList.add("hidden");
  typedNode.textContent = "";
}

function getContractSignerStatusText(role) {
  const signer = state.contract.signatures[role];
  if (!signer.signedAt) {
    return "Status: Pending signature";
  }
  return `Status: Signed on ${formatDateTimeHuman(signer.signedAt)}`;
}

function applySignerStatusNode(node, role) {
  const signer = state.contract.signatures[role];
  const signed = Boolean(signer.signedAt);
  node.textContent = getContractSignerStatusText(role);
  node.classList.toggle("sign-status-signed", signed);
  node.classList.toggle("sign-status-unsigned", !signed);
}

function getContractClauses(contract) {
  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(addDaysToDateISO(contract.startDate, contract.paymentDueDays));
  const notes = contract.scopeNotes.trim() || "No additional notes were provided.";
  const serviceText = contract.serviceType || "the listed professional services";
  const feeText = formatContractCurrency(contract.projectFee);

  return [
    `Scope of Work: The Service Provider will deliver ${serviceText} for the Client in a professional and timely manner as agreed in writing.`,
    `Fees and Payment: The Client will pay ${feeText}. Payment is due within ${contract.paymentDueDays} day${contract.paymentDueDays === 1 ? "" : "s"} from ${startDate} (due by ${dueDate}).`,
    `Revisions and Change Requests: The fee includes ${contract.includedRevisions} revision${contract.includedRevisions === 1 ? "" : "s"}. Additional changes may require a written change order and additional fees.`,
    `Independent Contractor: The Service Provider acts as an independent contractor and not as an employee, partner, or agent of the Client.`,
    `Confidentiality: Each party will keep confidential information private and use it only for performing this agreement.`,
    `Intellectual Property: Upon full payment, final deliverables transfer to the Client unless otherwise stated in writing. Provider retains ownership of pre-existing tools, templates, and know-how.`,
    `Limitation and Liability: Each party is responsible for direct damages caused by its own breach. To the maximum extent permitted by law, neither party is liable for indirect or consequential damages.`,
    `Termination: Either party may terminate for material breach with written notice and a reasonable cure period. Services completed up to termination remain payable.`,
    getGoverningLawClause(contract.province),
    `Additional Notes: ${notes}`,
  ];
}

function getGoverningLawClause(province) {
  if (province === "Quebec") {
    return "Governing Law: This agreement is governed by the laws of Quebec and applicable federal laws of Canada, including the Civil Code of Quebec where relevant.";
  }
  return `Governing Law: This agreement is governed by the laws of ${province}, Canada, and the applicable federal laws of Canada.`;
}

function calculateTotals() {
  const itemsTotal = state.products.items.reduce((sum, item) => {
    return sum + calculateLineAmount(item);
  }, 0);

  const shipping = Math.max(0, sanitizeNumber(state.products.shippingCost, 0));
  const discount = Math.max(0, sanitizeNumber(state.products.discount, 0));
  const taxRate = Math.max(0, sanitizeNumber(state.products.taxRate, 0));

  const taxableBase = Math.max(0, itemsTotal + shipping - discount);
  let subtotal = taxableBase;
  let tax = 0;
  let total = taxableBase;

  if (state.products.taxType === "percent") {
    if (state.products.taxIncluded) {
      if (taxRate > 0) {
        subtotal = taxableBase / (1 + taxRate / 100);
        tax = taxableBase - subtotal;
      }
      total = taxableBase;
    } else {
      tax = taxableBase * (taxRate / 100);
      total = taxableBase + tax;
    }
  } else if (state.products.taxIncluded) {
    tax = Math.min(taxRate, taxableBase);
    subtotal = taxableBase - tax;
    total = taxableBase;
  } else {
    tax = taxRate;
    total = taxableBase + tax;
  }

  return {
    itemsTotal,
    shipping,
    discount,
    subtotal,
    tax,
    total,
  };
}

function downloadPdf() {
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) {
    showStatus("PDF library did not load. Refresh and try again.", true);
    return;
  }

  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const totals = calculateTotals();
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - margin;

  doc.setFillColor(18, 24, 34);
  doc.rect(0, 0, pageWidth, 130, "F");

  let companyY = 44;
  if (state.company.logoDataUrl) {
    const logoHeight = 36;
    const logoWidth = 95;
    doc.addImage(
      state.company.logoDataUrl,
      getImageFormatFromDataUrl(state.company.logoDataUrl),
      margin,
      34,
      logoWidth,
      logoHeight,
    );
    companyY = 84;
  }

  doc.setTextColor(237, 244, 250);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(state.company.name || "Your Company", margin, companyY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(state.company.address || "-", margin, companyY + 17);
  doc.text(state.company.email || "-", margin, companyY + 33);
  doc.text(state.company.phone || "-", margin, companyY + 49);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("INVOICE", rightX, 58, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Invoice #: ${state.invoice.number || "-"}`, rightX, 80, { align: "right" });
  doc.text(`Issue Date: ${formatDateHuman(state.invoice.issueDate)}`, rightX, 97, {
    align: "right",
  });
  doc.text(`Due Date: ${formatDateHuman(state.invoice.dueDate)}`, rightX, 114, {
    align: "right",
  });

  doc.setTextColor(28, 35, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  let y = 158;
  doc.text("Issued To", margin, y);

  const customer = parseCustomerDisplay(state.customer.display);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  y += 17;
  doc.text(`${customer.name || "Customer"} | ${customer.company || "Company Name"}`, margin, y);
  y += 15;
  doc.text(`ID: ${state.customer.identifier || "-"}`, margin, y);
  y += 15;
  doc.text(`Email: ${state.customer.email || "-"}`, margin, y);
  y += 15;
  doc.text(`Phone: ${state.customer.phone || "-"}`, margin, y);
  y += 15;
  doc.text(state.customer.address || "-", margin, y);
  y += 15;
  doc.text(`Zip: ${state.customer.zip || "-"}`, margin, y);

  const tableRows = state.products.items.map((item) => {
    const billingMode = sanitizeBillingMode(state.products.billingMode);
    const rate = sanitizeNumber(item.rate, 0);
    return [
      item.name || "Service",
      billingMode === "fixed" ? "Fixed" : trimTrailingZeros(item.hours),
      formatCurrency(rate),
      formatCurrency(calculateLineAmount(item)),
    ];
  });

  const tableHead =
    sanitizeBillingMode(state.products.billingMode) === "fixed"
      ? ["Service", "Type", "Fixed Price", "Amount"]
      : ["Service", "Hours", "Rate", "Amount"];

  const tableStartY = y + 18;
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: tableStartY,
      head: [tableHead],
      body: tableRows,
      theme: "grid",
      styles: {
        fontSize: 9.5,
        cellPadding: 7,
        textColor: [28, 35, 45],
      },
      headStyles: {
        fillColor: [30, 37, 50],
        textColor: [238, 244, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
  }

  const finalTableY = doc.lastAutoTable?.finalY ?? tableStartY + tableRows.length * 22;

  let totalsY = finalTableY + 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  drawAmountLine(doc, "Subtotal:", formatCurrency(totals.subtotal), rightX, totalsY);
  totalsY += 16;

  const taxLabel =
    state.products.taxType === "percent"
      ? `Tax (${trimTrailingZeros(state.products.taxRate)}%):`
      : "Tax (fixed):";
  drawAmountLine(doc, taxLabel, formatCurrency(totals.tax), rightX, totalsY);
  totalsY += 16;

  drawAmountLine(doc, "Shipping:", formatCurrency(totals.shipping), rightX, totalsY);
  totalsY += 16;

  drawAmountLine(doc, "Discount:", `-${formatCurrency(totals.discount)}`, rightX, totalsY);
  totalsY += 22;

  doc.setFontSize(15);
  drawAmountLine(doc, "Total:", formatCurrency(totals.total), rightX, totalsY);

  let metaY = totalsY + 28;

  metaY = drawWrappedBlock(doc, "Terms of Payment", state.invoice.termsOfPayment || "-", margin, metaY);

  const customFieldsToShow = state.invoice.customFields.filter(
    (field) => field.label.trim() || field.value.trim(),
  );

  if (customFieldsToShow.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Custom Fields", margin, metaY);
    metaY += 15;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    customFieldsToShow.forEach((field) => {
      const line = `${field.label || "Field"}: ${field.value || "-"}`;
      const lines = doc.splitTextToSize(line, 310);
      doc.text(lines, margin, metaY);
      metaY += 13 * lines.length;
    });

    metaY += 6;
  }

  metaY = drawWrappedBlock(doc, "Payment Details", buildPaymentSummaryText(), margin, metaY);

  if (state.invoice.endMessage.trim()) {
    metaY = drawWrappedBlock(doc, "End Message", state.invoice.endMessage, margin, metaY);
  }

  if (state.company.signatureDataUrl) {
    const signatureY = Math.min(metaY + 14, doc.internal.pageSize.getHeight() - 90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Authorized Signature", margin, signatureY);
    doc.addImage(
      state.company.signatureDataUrl,
      getImageFormatFromDataUrl(state.company.signatureDataUrl),
      margin,
      signatureY + 8,
      150,
      48,
    );
  }

  const safeNumber = (state.invoice.number || "invoice")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  doc.save(`${safeNumber}.pdf`);
  showStatus("PDF downloaded.");
}

function downloadContractPdf(options = {}) {
  const { forClient = false } = options;
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) {
    showContractStatus("PDF library did not load. Refresh and try again.", true);
    return;
  }

  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 46;
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - margin;

  doc.setFillColor(18, 24, 34);
  doc.rect(0, 0, pageWidth, 95, "F");
  doc.setTextColor(240, 245, 250);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("SERVICE AGREEMENT", margin, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated by InvoiceGenNow`, rightX, 58, { align: "right" });
  doc.text(formatDateTimeHuman(new Date().toISOString()), rightX, 74, { align: "right" });

  const contract = state.contract;
  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(addDaysToDateISO(contract.startDate, contract.paymentDueDays));
  const clauses = getContractClauses(contract);

  let y = 126;
  doc.setTextColor(25, 33, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Province: ${contract.province}`, margin, y);
  y += 16;
  doc.text(`Business: ${contract.businessName || "-"}`, margin, y);
  y += 16;
  doc.text(`Client: ${contract.clientName || "-"}`, margin, y);
  y += 16;
  doc.text(`Service: ${contract.serviceType || "-"}`, margin, y);
  y += 16;
  doc.text(`Start Date: ${startDate}`, margin, y);
  y += 16;
  doc.text(`Project Fee: ${formatContractCurrency(contract.projectFee)}`, margin, y);
  y += 16;
  doc.text(`Payment Due: ${contract.paymentDueDays} day(s) by ${dueDate}`, margin, y);
  y += 16;
  doc.text(`Included Revisions: ${contract.includedRevisions}`, margin, y);
  y += 24;

  clauses.forEach((clause, index) => {
    const numbered = `${index + 1}. ${clause}`;
    const lines = doc.splitTextToSize(numbered, 500);
    doc.text(lines, margin, y);
    y += 14 * lines.length + 4;
  });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Signatures", margin, y);
  y += 16;

  y = drawContractSignatureBlock(doc, "Service Provider", "provider", margin, y);
  y += 12;
  y = drawContractSignatureBlock(doc, "Client", "client", margin, y);

  const baseFile = `${sanitizeText(contract.businessName, "contract")}-${sanitizeText(
    contract.clientName,
    "client",
  )}`
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");

  const suffix = forClient ? "-client-copy" : "";
  doc.save(`${baseFile || "contract"}${suffix}.pdf`);
  showContractStatus(forClient ? "Client PDF exported." : "Contract PDF downloaded.");
}

function drawContractSignatureBlock(doc, title, role, x, y) {
  const signer = state.contract.signatures[role];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(title, x, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Signer: ${signer.signerName || "-"}`, x, y);
  y += 14;
  doc.text(getContractSignerStatusText(role), x, y);
  y += 8;

  if (signer.finalType === "draw" && signer.finalValue) {
    doc.addImage(
      signer.finalValue,
      getImageFormatFromDataUrl(signer.finalValue),
      x,
      y,
      180,
      50,
    );
    y += 54;
  } else if (signer.finalType === "type" && signer.finalValue) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(16);
    doc.text(signer.finalValue, x, y + 20);
    y += 34;
  } else {
    y += 20;
  }

  doc.setDrawColor(65, 73, 88);
  doc.line(x, y, x + 190, y);
  return y + 8;
}

function drawWrappedBlock(doc, title, content, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, x, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(content || "-", 500);
  doc.text(lines, x, y + 14);

  return y + 16 + lines.length * 12;
}

function buildPaymentSummaryText() {
  const chunks = [];

  if (state.payment.bank.enabled) {
    chunks.push(
      [
        "Bank",
        pairText("Bank", state.payment.bank.bankName),
        pairText("Account", state.payment.bank.accountName),
        pairText("Account #", state.payment.bank.accountNumber),
        pairText("Routing", state.payment.bank.routingNumber),
        pairText("SWIFT", state.payment.bank.swiftCode),
        pairText("IBAN", state.payment.bank.iban),
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  if (state.payment.paypal.enabled) {
    chunks.push(["PayPal", pairText("Email", state.payment.paypal.email)].filter(Boolean).join(" | "));
  }

  if (state.payment.crypto.enabled) {
    chunks.push(
      [
        "Crypto",
        pairText("Currency", state.payment.crypto.currency),
        pairText("Wallet", state.payment.crypto.walletAddress),
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  state.payment.custom.forEach((entry) => {
    if (entry.title.trim() || entry.details.trim()) {
      chunks.push(
        [entry.title || "Custom Payment", entry.details || "-"].join(": "),
      );
    }
  });

  if (!chunks.length) {
    return "No payment method added.";
  }

  return chunks.join("\n");
}

function drawAmountLine(doc, label, amount, rightX, y) {
  doc.text(label, rightX - 160, y, { align: "right" });
  doc.text(amount, rightX, y, { align: "right" });
}

function persistDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showStatus("Could not save draft in this browser session.", true);
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function readValue(id) {
  const input = document.getElementById(id);
  if (
    input instanceof HTMLInputElement ||
    input instanceof HTMLTextAreaElement ||
    input instanceof HTMLSelectElement
  ) {
    return input.value;
  }
  return "";
}

function readChecked(id) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) {
    return input.checked;
  }
  return false;
}

function setValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = value;
  }
}

function setChecked(id, value) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) {
    input.checked = Boolean(value);
  }
}

function sanitizeNumber(input, fallback = 0) {
  const parsed = Number.parseFloat(String(input));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

function sanitizeDataUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (!value.startsWith("data:image/")) {
    return "";
  }
  return value;
}

function sanitizeCustomFields(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((field) => ({
    label: sanitizeText(field?.label, ""),
    value: sanitizeText(field?.value, ""),
  }));
}

function sanitizeContractSigner(input) {
  const finalType = input?.finalType === "draw" || input?.finalType === "type" ? input.finalType : "";
  const finalValueRaw = typeof input?.finalValue === "string" ? input.finalValue : "";
  const finalValue =
    finalType === "draw" ? sanitizeDataUrl(finalValueRaw) : sanitizeText(finalValueRaw, "");

  return {
    signerName: sanitizeText(input?.signerName, ""),
    mode: sanitizeSignerMode(input?.mode),
    typedSignature: sanitizeText(input?.typedSignature, ""),
    finalType,
    finalValue,
    signedAt: sanitizeText(input?.signedAt, ""),
  };
}

function sanitizePaymentBlock(input) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const sanitized = {};
  Object.entries(input).forEach(([key, value]) => {
    if (key === "enabled") {
      return;
    }
    sanitized[key] = sanitizeText(value, "");
  });
  return sanitized;
}

function sanitizeProvince(value) {
  if (CANADA_REGIONS.has(value)) {
    return value;
  }
  return "Ontario";
}

function sanitizeSignerMode(value) {
  return value === "type" ? "type" : "draw";
}

function sanitizeDeliveryChannel(value) {
  if (value === "email" || value === "sms" || value === "auto") {
    return value;
  }
  return "auto";
}

function hasAnyPaymentMethod(paymentState) {
  return (
    paymentState.bank.enabled ||
    paymentState.paypal.enabled ||
    paymentState.crypto.enabled ||
    paymentState.custom.length > 0
  );
}

function formatEditableNumber(value) {
  const numeric = sanitizeNumber(value, 0);
  return Number.isInteger(numeric) ? String(numeric) : String(numeric);
}

function trimTrailingZeros(value) {
  const numeric = sanitizeNumber(value, 0);
  return numeric.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatCurrency(value) {
  const amount = sanitizeNumber(value, 0);
  const currency = sanitizeCurrency(state.invoice.currency);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
}

function formatContractCurrency(value) {
  const amount = sanitizeNumber(value, 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function sanitizeBillingMode(value) {
  return value === "fixed" ? "fixed" : "hours";
}

function calculateLineAmount(item) {
  const billingMode = sanitizeBillingMode(state.products.billingMode);
  if (billingMode === "fixed") {
    return sanitizeNumber(item.rate, 0);
  }
  return sanitizeNumber(item.hours, 0) * sanitizeNumber(item.rate, 0);
}

function sanitizeCurrency(value) {
  if (SUPPORTED_CURRENCIES.has(value)) {
    return value;
  }
  return "USD";
}

function parseCustomerDisplay(displayValue) {
  const raw = sanitizeText(displayValue, "").trim();
  if (!raw) {
    return { name: "", company: "" };
  }

  if (!raw.includes("|")) {
    return { name: raw, company: "" };
  }

  const [name, company] = raw.split("|");
  return {
    name: name.trim(),
    company: (company || "").trim(),
  };
}

function pairText(label, value) {
  const text = sanitizeText(value, "").trim();
  if (!text) {
    return "";
  }
  return `${label}: ${text}`;
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateHuman(dateValue) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTimeHuman(dateValue) {
  if (!dateValue) {
    return "-";
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function addDaysToDateISO(dateValue, dayCount) {
  if (!dateValue) {
    return "";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + Math.max(0, Math.round(sanitizeNumber(dayCount, 0))));
  return formatDateISO(date);
}

function generateInvoiceNumber() {
  const seed = Date.now().toString().slice(-6);
  const suffix = Math.floor(100 + Math.random() * 900);
  return `INV-${seed}-${suffix}`;
}

function getImageFormatFromDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return "PNG";
  }
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return "JPEG";
  }
  return "PNG";
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? "#ff9a9a" : "#7fe2ad";

  if (statusTimer) {
    window.clearTimeout(statusTimer);
  }

  statusTimer = window.setTimeout(() => {
    elements.statusMessage.textContent = "";
  }, STATUS_DURATION_MS);
}

function showContractStatus(message, isError = false) {
  elements.contractStatusMessage.textContent = message;
  elements.contractStatusMessage.style.color = isError ? "#ff9a9a" : "#7fe2ad";

  if (contractStatusTimer) {
    window.clearTimeout(contractStatusTimer);
  }

  contractStatusTimer = window.setTimeout(() => {
    elements.contractStatusMessage.textContent = "";
  }, STATUS_DURATION_MS);
}
