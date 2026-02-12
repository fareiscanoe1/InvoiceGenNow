const API_BASE =
  window.INVOICEGENNOW_API_BASE ||
  (window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://localhost:8787");

const elements = {
  contractMeta: document.getElementById("contractMeta"),
  viewBusiness: document.getElementById("viewBusiness"),
  viewClient: document.getElementById("viewClient"),
  viewService: document.getElementById("viewService"),
  viewStartDate: document.getElementById("viewStartDate"),
  viewFee: document.getElementById("viewFee"),
  viewDue: document.getElementById("viewDue"),
  viewRevisions: document.getElementById("viewRevisions"),
  viewProvince: document.getElementById("viewProvince"),
  viewClauses: document.getElementById("viewClauses"),
  signerName: document.getElementById("signerName"),
  signModeControl: document.getElementById("signModeControl"),
  typedWrap: document.getElementById("typedWrap"),
  typedSignature: document.getElementById("typedSignature"),
  drawWrap: document.getElementById("drawWrap"),
  signaturePad: document.getElementById("signaturePad"),
  clearPadBtn: document.getElementById("clearPadBtn"),
  signBtn: document.getElementById("signBtn"),
  signedState: document.getElementById("signedState"),
  statusMessage: document.getElementById("statusMessage"),
};

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

const state = {
  token: "",
  signMode: "type",
  contract: null,
  meta: null,
};

let signaturePad = null;

bootstrap();

async function bootstrap() {
  state.token = resolveTokenFromLocation();
  if (!state.token) {
    showStatus("Invalid signing link. Missing token.", true);
    return;
  }

  signaturePad = createSignaturePad(elements.signaturePad);
  bindControls();
  renderSignMode();
  await loadContract();
}

function resolveTokenFromLocation() {
  const pathPart = window.location.pathname.split("/").filter(Boolean);
  const fromPath = decodeURIComponent(pathPart[pathPart.length - 1] || "");
  if (fromPath && fromPath !== "sign") {
    return fromPath;
  }
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  return sanitizeText(fromQuery, "");
}

function bindControls() {
  elements.signModeControl.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) {
      return;
    }

    const nextMode = button.dataset.mode === "type" ? "type" : "draw";
    state.signMode = nextMode;
    renderSignMode();
  });

  elements.clearPadBtn.addEventListener("click", () => {
    signaturePad?.clear();
    showStatus("Signature pad cleared.");
  });

  elements.signBtn.addEventListener("click", () => {
    void submitSignature();
  });
}

async function loadContract() {
  try {
    const response = await fetch(
      `${API_BASE}/api/sign-links/${encodeURIComponent(state.token)}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Could not load contract.");
    }

    const payload = await response.json();
    state.contract = payload.contract || null;
    state.meta = payload.meta || null;
    hydrateFromServer();
    renderContract();
    showStatus("Contract loaded.");
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Could not load contract.",
      true,
    );
  }
}

function hydrateFromServer() {
  const clientSigner = state.contract?.signatures?.client;
  if (!clientSigner || typeof clientSigner !== "object") {
    return;
  }

  const signerName = sanitizeText(clientSigner.signerName, "");
  const typedSignature = sanitizeText(clientSigner.typedSignature, "");
  const fallbackSigner = sanitizeText(state.contract?.clientName, "");
  elements.signerName.value = signerName || fallbackSigner;
  if (typedSignature) {
    elements.typedSignature.value = typedSignature;
  }
}

function renderContract() {
  const contract = state.contract;
  if (!contract) {
    return;
  }

  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(
    addDaysToDateISO(contract.startDate, sanitizeInteger(contract.paymentDueDays, 0)),
  );

  setText(elements.viewBusiness, contract.businessName || "-");
  setText(elements.viewClient, contract.clientName || "-");
  setText(elements.viewService, contract.serviceType || "-");
  setText(elements.viewStartDate, startDate);
  setText(elements.viewFee, formatContractCurrency(contract.projectFee));
  setText(
    elements.viewDue,
    `${sanitizeInteger(contract.paymentDueDays, 0)} day(s) by ${dueDate}`,
  );
  setText(elements.viewRevisions, String(sanitizeInteger(contract.includedRevisions, 0)));
  setText(elements.viewProvince, sanitizeProvince(contract.province));

  elements.viewClauses.innerHTML = "";
  getContractClauses(contract).forEach((clause) => {
    const li = document.createElement("li");
    li.textContent = clause;
    elements.viewClauses.appendChild(li);
  });

  const expiresAt = state.meta?.expiresAt
    ? formatDateTimeHuman(state.meta.expiresAt)
    : "-";
  setText(
    elements.contractMeta,
    `Link expires: ${expiresAt} | Status: ${state.meta?.status || "PENDING"}`,
  );

  renderSignState();
}

function renderSignMode() {
  elements.signModeControl.querySelectorAll(".seg-btn").forEach((button) => {
    const isActive = button.dataset.mode === state.signMode;
    button.classList.toggle("active", isActive);
  });

  const isType = state.signMode === "type";
  elements.typedWrap.classList.toggle("hidden", !isType);
  elements.drawWrap.classList.toggle("hidden", isType);
}

function renderSignState() {
  const signer = state.contract?.signatures?.client || {};
  const isSigned = Boolean(sanitizeText(signer.signedAt, ""));
  if (!isSigned) {
    elements.signedState.textContent = "Status: Pending signature";
    elements.signedState.classList.remove("signed");
    elements.signedState.classList.add("pending");
    return;
  }

  elements.signedState.textContent = `Status: Signed on ${formatDateTimeHuman(
    signer.signedAt,
  )}`;
  elements.signedState.classList.remove("pending");
  elements.signedState.classList.add("signed");
}

async function submitSignature() {
  const signerName = sanitizeText(elements.signerName.value, "").trim();
  if (!signerName) {
    showStatus("Signer name is required.", true);
    return;
  }

  let signValue = "";
  if (state.signMode === "type") {
    signValue = sanitizeText(elements.typedSignature.value, "").trim();
    if (!signValue) {
      showStatus("Typed signature is required.", true);
      return;
    }
  } else {
    if (!signaturePad || signaturePad.isEmpty()) {
      showStatus("Please draw your signature first.", true);
      return;
    }
    signValue = signaturePad.toDataURL();
  }

  elements.signBtn.disabled = true;
  try {
    const response = await fetch(
      `${API_BASE}/api/sign-links/${encodeURIComponent(state.token)}/sign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerName,
          signType: state.signMode,
          signValue,
        }),
      },
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Could not save signature.");
    }

    const payload = await response.json();
    state.contract = payload.contract || state.contract;
    state.meta = payload.meta || state.meta;
    renderContract();
    showStatus("Signature saved. Timestamp updated.");
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Could not save signature.",
      true,
    );
  } finally {
    elements.signBtn.disabled = false;
  }
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

  const clear = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
    setStyle();
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

  if ("PointerEvent" in window) {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
  } else {
    canvas.addEventListener("mousedown", (event) => {
      onPointerDown({
        ...event,
        pointerId: -1,
        preventDefault: () => event.preventDefault(),
      });
    });
    canvas.addEventListener("mousemove", (event) => {
      onPointerMove({
        ...event,
        pointerId: -1,
        preventDefault: () => event.preventDefault(),
      });
    });
    canvas.addEventListener("mouseup", (event) => {
      event.preventDefault();
      onPointerUp({ pointerId: -1 });
    });
    canvas.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0] || event.changedTouches[0];
        onPointerDown({
          clientX: touch?.clientX ?? 0,
          clientY: touch?.clientY ?? 0,
          pointerId: -2,
          preventDefault: () => event.preventDefault(),
        });
      },
      { passive: false },
    );
    canvas.addEventListener(
      "touchmove",
      (event) => {
        const touch = event.touches[0] || event.changedTouches[0];
        onPointerMove({
          clientX: touch?.clientX ?? 0,
          clientY: touch?.clientY ?? 0,
          pointerId: -2,
          preventDefault: () => event.preventDefault(),
        });
      },
      { passive: false },
    );
    canvas.addEventListener(
      "touchend",
      (event) => {
        event.preventDefault();
        onPointerUp({ pointerId: -2 });
      },
      { passive: false },
    );
  }

  window.addEventListener("resize", resize);
  resize();
  clear();

  return {
    clear,
    isEmpty: () => !hasStroke,
    toDataURL: () => canvas.toDataURL("image/png"),
  };
}

function getContractClauses(contract) {
  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(
    addDaysToDateISO(contract.startDate, sanitizeInteger(contract.paymentDueDays, 0)),
  );
  const feeText = formatContractCurrency(contract.projectFee);
  const notes = sanitizeText(contract.scopeNotes, "").trim() || "No additional notes were provided.";
  const serviceText = sanitizeText(contract.serviceType, "").trim() || "the listed professional services";
  const revisions = sanitizeInteger(contract.includedRevisions, 0);
  const paymentDueDays = sanitizeInteger(contract.paymentDueDays, 0);

  return [
    `Scope of Work: The Service Provider will deliver ${serviceText} for the Client in a professional and timely manner as agreed in writing.`,
    `Fees and Payment: The Client will pay ${feeText}. Payment is due within ${paymentDueDays} day${paymentDueDays === 1 ? "" : "s"} from ${startDate} (due by ${dueDate}).`,
    `Revisions and Change Requests: The fee includes ${revisions} revision${revisions === 1 ? "" : "s"}. Additional changes may require a written change order and additional fees.`,
    "Independent Contractor: The Service Provider acts as an independent contractor and not as an employee, partner, or agent of the Client.",
    "Confidentiality: Each party will keep confidential information private and use it only for performing this agreement.",
    "Intellectual Property: Upon full payment, final deliverables transfer to the Client unless otherwise stated in writing. Provider retains ownership of pre-existing tools, templates, and know-how.",
    "Limitation and Liability: Each party is responsible for direct damages caused by its own breach. To the maximum extent permitted by law, neither party is liable for indirect or consequential damages.",
    "Termination: Either party may terminate for material breach with written notice and a reasonable cure period. Services completed up to termination remain payable.",
    getGoverningLawClause(contract.province),
    `Additional Notes: ${notes}`,
  ];
}

function getGoverningLawClause(province) {
  if (province === "Quebec") {
    return "Governing Law: This agreement is governed by the laws of Quebec and applicable federal laws of Canada, including the Civil Code of Quebec where relevant.";
  }
  return `Governing Law: This agreement is governed by the laws of ${sanitizeProvince(
    province,
  )}, Canada, and the applicable federal laws of Canada.`;
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

function sanitizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
}

function sanitizeNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sanitizeProvince(value) {
  if (CANADA_REGIONS.has(value)) {
    return value;
  }
  return "Ontario";
}

function formatContractCurrency(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(sanitizeNumber(value, 0));
}

function formatDateHuman(dateValue) {
  if (!dateValue) {
    return "-";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
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
  date.setDate(date.getDate() + Math.max(0, dayCount));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? "#ffb7b7" : "#8be6b0";
}
