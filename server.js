const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const APP_ROOT = __dirname;
const DATA_DIR = path.join(APP_ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "invoicegennow.db");
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const SMTP_HOST = sanitizeText(process.env.SMTP_HOST, "");
const SMTP_PORT = clampInteger(process.env.SMTP_PORT, 1, 65535, 587);
const SMTP_USER = sanitizeText(process.env.SMTP_USER, "");
const SMTP_PASS = sanitizeText(process.env.SMTP_PASS, "");
const SMTP_FROM = sanitizeText(process.env.SMTP_FROM, "");
const SMTP_SECURE = sanitizeText(process.env.SMTP_SECURE, "").toLowerCase() === "true";
const TWILIO_ACCOUNT_SID = sanitizeText(process.env.TWILIO_ACCOUNT_SID, "");
const TWILIO_AUTH_TOKEN = sanitizeText(process.env.TWILIO_AUTH_TOKEN, "");
const TWILIO_FROM_NUMBER = sanitizeText(process.env.TWILIO_FROM_NUMBER, "");
const API_RATE_LIMIT_WINDOW_MS = clampInteger(
  process.env.API_RATE_LIMIT_WINDOW_MS,
  1_000,
  3_600_000,
  60_000,
);
const API_RATE_LIMIT_MAX = clampInteger(process.env.API_RATE_LIMIT_MAX, 20, 10_000, 240);
const RETENTION_DAYS = clampInteger(
  process.env.SIGN_REQUEST_RETENTION_DAYS,
  7,
  3_650,
  180,
);
const CLEANUP_INTERVAL_MS = clampInteger(
  process.env.CLEANUP_INTERVAL_MS,
  60_000,
  86_400_000,
  21_600_000,
);
const SHUTDOWN_GRACE_MS = clampInteger(
  process.env.SHUTDOWN_GRACE_MS,
  1_000,
  60_000,
  10_000,
);

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

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
configureDatabase(db);
const sql = prepareStatements(db);
let mailTransporter = null;
const apiRateState = new Map();
let cleanupTimer = null;
let server = null;
let shuttingDown = false;

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "8mb" }));
app.use(enforceApiRateLimit);

app.get("/health", (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.post("/api/sign-links", (req, res) => {
  try {
    const contract = sanitizeContract(req.body?.contract);
    const expiresInDays = clampInteger(req.body?.expiresInDays, 1, 90, 30);

    const createdAt = nowIso();
    const expiresAt = plusDaysIso(createdAt, expiresInDays);
    const token = generateToken();
    const signUrl = `${trimTrailingSlash(PUBLIC_BASE_URL)}/sign/${encodeURIComponent(token)}`;
    const contractToStore = {
      ...contract,
      remoteSigning: {
        ...createDefaultRemoteSigning(),
        ...contract.remoteSigning,
        token,
        signUrl,
        expiresAt,
      },
    };

    const tx = db.transaction(() => {
      sql.insertSignRequest.run({
        token,
        contract_json: JSON.stringify(contractToStore),
        status: "PENDING",
        sign_count: 0,
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: expiresAt,
      });

      sql.insertSignEvent.run({
        token,
        event_type: "LINK_CREATED",
        event_json: JSON.stringify({ expiresInDays }),
        ip: getRequestIp(req),
        user_agent: sanitizeText(req.headers["user-agent"], ""),
        created_at: createdAt,
      });
    });

    tx();

    res.status(201).json({
      ok: true,
      token,
      signUrl,
      expiresAt,
      createdAt,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not create sign link.",
    });
  }
});

app.get("/api/sign-links/:token", (req, res) => {
  const row = sql.findSignRequestByToken.get(req.params.token);
  const active = ensureRowIsActiveOrRespond(res, row);
  if (!active) {
    return;
  }

  res.json(serializeSignRequest(row));
});

app.get("/api/sign-links/:token/full-contract", (req, res) => {
  const row = sql.findSignRequestByToken.get(req.params.token);
  const active = ensureRowIsActiveOrRespond(res, row);
  if (!active) {
    return;
  }

  res.json(serializeSignRequest(row));
});

app.post("/api/sign-links/:token/send", async (req, res) => {
  const token = req.params.token;
  const row = sql.findSignRequestByToken.get(token);
  const active = ensureRowIsActiveOrRespond(res, row);
  if (!active) {
    return;
  }

  try {
    const contract = parseStoredContract(row.contract_json);
    if (
      !contract.signatures?.provider?.signedAt ||
      !contract.signatures?.provider?.finalType ||
      !contract.signatures?.provider?.finalValue
    ) {
      throw new Error("Provider must sign before sending this contract to client.");
    }
    const signUrl = `${trimTrailingSlash(PUBLIC_BASE_URL)}/sign/${encodeURIComponent(token)}`;
    const requestedChannel = sanitizeDeliveryChannel(req.body?.channel);
    const email = sanitizeEmail(req.body?.email || contract.clientEmail);
    const phone = sanitizePhone(req.body?.phone || contract.clientPhone);
    const ownerEmail = sanitizeEmail(
      req.body?.ownerEmail || contract.remoteSigning?.notifyOwnerEmail,
    );
    const ownerPhone = sanitizePhone(
      req.body?.ownerPhone || contract.remoteSigning?.notifyOwnerPhone,
    );

    if (!ownerEmail && !ownerPhone) {
      throw new Error("Owner email or phone is required for signed-copy notifications.");
    }

    const delivery = await deliverSignLink({
      requestedChannel,
      email,
      phone,
      signUrl,
      contract,
    });

    const sentAt = nowIso();
    const nextContract = {
      ...contract,
      clientEmail: email || contract.clientEmail,
      clientPhone: phone || contract.clientPhone,
      remoteSigning: {
        ...createDefaultRemoteSigning(),
        ...contract.remoteSigning,
        token,
        signUrl,
        expiresAt: row.expires_at,
        sentAt,
        sentVia: delivery.channel,
        sentTo: delivery.recipient,
        notifyOwnerEmail: ownerEmail,
        notifyOwnerPhone: ownerPhone,
        deliveryChannel: requestedChannel,
      },
    };

    const tx = db.transaction(() => {
      sql.updateContractJson.run({
        token,
        contract_json: JSON.stringify(nextContract),
        updated_at: sentAt,
      });
      sql.insertSignEvent.run({
        token,
        event_type: "LINK_SENT",
        event_json: JSON.stringify({
          channel: delivery.channel,
          recipient: delivery.recipient,
        }),
        ip: getRequestIp(req),
        user_agent: sanitizeText(req.headers["user-agent"], ""),
        created_at: sentAt,
      });
    });
    tx();

    res.json({
      ok: true,
      delivery: {
        channel: delivery.channel,
        recipient: maskRecipient(delivery.channel, delivery.recipient),
        sentAt,
      },
      notifications: {
        ownerEmail: maskRecipient("email", ownerEmail || ""),
        ownerPhone: maskRecipient("sms", ownerPhone || ""),
      },
      signUrl,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not send signature link.",
    });
  }
});

app.post("/api/sign-links/:token/sign", async (req, res) => {
  const token = req.params.token;
  const row = sql.findSignRequestByToken.get(token);
  const active = ensureRowIsActiveOrRespond(res, row);
  if (!active) {
    return;
  }

  try {
    const signerName = sanitizeRequiredText(req.body?.signerName, "Signer name is required.");
    const signType = sanitizeSignType(req.body?.signType);
    const signValue = sanitizeSignValue(signType, req.body?.signValue);

    const nextContract = parseStoredContract(row.contract_json);

    const signedAt = nowIso();
    nextContract.signatures.client = {
      ...createDefaultContractSigner(),
      ...nextContract.signatures.client,
      signerName,
      mode: signType === "type" ? "type" : "draw",
      typedSignature: signType === "type" ? signValue : "",
      finalType: signType,
      finalValue: signValue,
      signedAt,
    };

    const nextSignCount = (row.sign_count || 0) + 1;

    const tx = db.transaction(() => {
      sql.updateSignedContract.run({
        token,
        contract_json: JSON.stringify(nextContract),
        status: "SIGNED",
        sign_count: nextSignCount,
        last_signed_at: signedAt,
        signed_by_ip: getRequestIp(req),
        signed_user_agent: sanitizeText(req.headers["user-agent"], ""),
        updated_at: signedAt,
      });

      sql.insertSignEvent.run({
        token,
        event_type: "CLIENT_SIGNED",
        event_json: JSON.stringify({ signType, signerName, signCount: nextSignCount }),
        ip: getRequestIp(req),
        user_agent: sanitizeText(req.headers["user-agent"], ""),
        created_at: signedAt,
      });
    });

    tx();

    const updatedRow = sql.findSignRequestByToken.get(token);
    const updatedPayload = serializeSignRequest(updatedRow);

    let notification = {
      sent: false,
      sentCount: 0,
      sentAt: "",
    };
    try {
      const signedCopyUrl = `${trimTrailingSlash(PUBLIC_BASE_URL)}/signed/${encodeURIComponent(token)}`;
      const notifyResult = await sendSignedCopyNotifications({
        token,
        contract: sanitizeContract(updatedPayload.contract),
        signedCopyUrl,
      });

      if (notifyResult.sentCount > 0) {
        const eventAt = nowIso();
        sql.insertSignEvent.run({
          token,
          event_type: "SIGNED_COPY_SENT",
          event_json: JSON.stringify(notifyResult),
          ip: getRequestIp(req),
          user_agent: sanitizeText(req.headers["user-agent"], ""),
          created_at: eventAt,
        });
        notification = {
          sent: true,
          sentCount: notifyResult.sentCount,
          sentAt: eventAt,
        };
      }
    } catch (notifyError) {
      const eventAt = nowIso();
      sql.insertSignEvent.run({
        token,
        event_type: "SIGNED_COPY_SEND_FAILED",
        event_json: JSON.stringify({
          message:
            notifyError instanceof Error
              ? notifyError.message
              : "Signed-copy notification failed.",
        }),
        ip: getRequestIp(req),
        user_agent: sanitizeText(req.headers["user-agent"], ""),
        created_at: eventAt,
      });
    }

    res.json({
      ok: true,
      ...updatedPayload,
      notification,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not save signature.",
    });
  }
});

app.get("/sign/:token", (req, res) => {
  res.sendFile(path.join(APP_ROOT, "client-sign.html"));
});

app.get("/signed/:token", (req, res) => {
  const row = sql.findSignRequestByToken.get(req.params.token);
  if (!row) {
    res.status(404).send("Signed copy not found.");
    return;
  }
  const payload = serializeSignRequest(row);
  const contract = payload.contract;
  res.type("html").send(renderSignedCopyHtml(contract, payload.meta));
});

app.use(express.static(APP_ROOT));
app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error);
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "Internal server error." });
});

server = app.listen(PORT, () => {
  console.log(`InvoiceGenNow server running at ${trimTrailingSlash(PUBLIC_BASE_URL)}`);
  console.log(`SQLite DB: ${DB_PATH}`);
  startMaintenanceJobs();
  setupProcessHandlers();
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

function configureDatabase(database) {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  database.exec(`
    CREATE TABLE IF NOT EXISTS sign_requests (
      token TEXT PRIMARY KEY,
      contract_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      sign_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_signed_at TEXT,
      signed_by_ip TEXT,
      signed_user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS sign_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_json TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(token) REFERENCES sign_requests(token)
    );

    CREATE INDEX IF NOT EXISTS idx_sign_events_token_created
      ON sign_events(token, created_at);

    CREATE INDEX IF NOT EXISTS idx_sign_requests_expires_at
      ON sign_requests(expires_at);
  `);
}

function prepareStatements(database) {
  return {
    insertSignRequest: database.prepare(`
      INSERT INTO sign_requests (
        token,
        contract_json,
        status,
        sign_count,
        created_at,
        updated_at,
        expires_at
      ) VALUES (
        @token,
        @contract_json,
        @status,
        @sign_count,
        @created_at,
        @updated_at,
        @expires_at
      )
    `),
    findSignRequestByToken: database.prepare(`
      SELECT *
      FROM sign_requests
      WHERE token = ?
      LIMIT 1
    `),
    updateSignedContract: database.prepare(`
      UPDATE sign_requests
      SET
        contract_json = @contract_json,
        status = @status,
        sign_count = @sign_count,
        last_signed_at = @last_signed_at,
        signed_by_ip = @signed_by_ip,
        signed_user_agent = @signed_user_agent,
        updated_at = @updated_at
      WHERE token = @token
    `),
    insertSignEvent: database.prepare(`
      INSERT INTO sign_events (
        token,
        event_type,
        event_json,
        ip,
        user_agent,
        created_at
      ) VALUES (
        @token,
        @event_type,
        @event_json,
        @ip,
        @user_agent,
        @created_at
      )
    `),
    updateContractJson: database.prepare(`
      UPDATE sign_requests
      SET
        contract_json = @contract_json,
        updated_at = @updated_at
      WHERE token = @token
    `),
    deleteEventsForExpiredRequests: database.prepare(`
      DELETE FROM sign_events
      WHERE token IN (
        SELECT token
        FROM sign_requests
        WHERE expires_at < @cutoff_iso
      )
    `),
    deleteExpiredRequests: database.prepare(`
      DELETE FROM sign_requests
      WHERE expires_at < @cutoff_iso
    `),
  };
}

function serializeSignRequest(row) {
  const contract = parseStoredContract(row.contract_json);
  return {
    contract,
    meta: {
      token: row.token,
      status: row.status,
      signCount: row.sign_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      lastSignedAt: row.last_signed_at,
    },
  };
}

function parseStoredContract(contractJson) {
  try {
    const parsed = JSON.parse(contractJson);
    return sanitizeContract(parsed);
  } catch {
    return sanitizeContract({});
  }
}

function enforceApiRateLimit(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  const now = Date.now();
  const key = getRequestIp(req) || "unknown";
  let bucket = apiRateState.get(key);

  if (!bucket || now - bucket.windowStart >= API_RATE_LIMIT_WINDOW_MS) {
    bucket = {
      windowStart: now,
      count: 0,
    };
  }

  bucket.count += 1;
  apiRateState.set(key, bucket);

  if (bucket.count > API_RATE_LIMIT_MAX) {
    res.status(429).json({
      error: "Too many requests. Please retry shortly.",
    });
    return;
  }

  next();
}

function startMaintenanceJobs() {
  runMaintenanceCleanup();
  cleanupTimer = setInterval(() => {
    runMaintenanceCleanup();
    pruneRateState(Date.now());
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

function stopMaintenanceJobs() {
  if (!cleanupTimer) {
    return;
  }
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

function runMaintenanceCleanup() {
  const cutoffIso = daysAgoIso(RETENTION_DAYS);
  try {
    const result = db.transaction(() => {
      const deletedEvents = sql.deleteEventsForExpiredRequests.run({
        cutoff_iso: cutoffIso,
      }).changes;
      const deletedRequests = sql.deleteExpiredRequests.run({
        cutoff_iso: cutoffIso,
      }).changes;
      return { deletedEvents, deletedRequests };
    })();

    if (result.deletedEvents || result.deletedRequests) {
      console.log(
        `Maintenance cleanup removed ${result.deletedRequests} requests and ${result.deletedEvents} events.`,
      );
    }
  } catch (error) {
    console.error("Maintenance cleanup failed:", error);
  }
}

function pruneRateState(nowMs) {
  const staleAfter = API_RATE_LIMIT_WINDOW_MS * 2;
  for (const [key, bucket] of apiRateState.entries()) {
    if (nowMs - bucket.windowStart > staleAfter) {
      apiRateState.delete(key);
    }
  }
}

function daysAgoIso(dayCount) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, Math.round(dayCount)));
  return date.toISOString();
}

function setupProcessHandlers() {
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    gracefulShutdown("uncaughtException", 1);
  });
}

function gracefulShutdown(reason, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Shutting down (${reason})...`);

  stopMaintenanceJobs();

  const forceExitTimer = setTimeout(() => {
    console.error("Forced shutdown timeout reached.");
    try {
      db.close();
    } catch {}
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExitTimer.unref();

  if (!server) {
    try {
      db.close();
    } catch {}
    process.exit(exitCode);
    return;
  }

  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error("DB close error:", error);
    }
    process.exit(exitCode);
  });
}

function ensureRowIsActiveOrRespond(res, row) {
  if (!row) {
    res.status(404).json({ error: "Signature request not found." });
    return false;
  }

  if (isExpired(row.expires_at)) {
    res.status(410).json({ error: "Signature link has expired." });
    return false;
  }

  return true;
}

function sanitizeContract(input) {
  const now = new Date();
  const base = {
    province: "Ontario",
    businessName: "Your Company",
    clientName: "Client Name",
    clientEmail: "",
    clientPhone: "",
    serviceType: "Professional services",
    startDate: formatDateISO(now),
    projectFee: 0,
    paymentDueDays: 14,
    includedRevisions: 1,
    scopeNotes: "",
    remoteSigning: createDefaultRemoteSigning(),
    signatures: {
      provider: createDefaultContractSigner(),
      client: createDefaultContractSigner(),
    },
  };

  if (!input || typeof input !== "object") {
    return base;
  }

  return {
    province: sanitizeProvince(input.province),
    businessName: sanitizeText(input.businessName, base.businessName),
    clientName: sanitizeText(input.clientName, base.clientName),
    clientEmail: sanitizeEmail(input.clientEmail),
    clientPhone: sanitizePhone(input.clientPhone),
    serviceType: sanitizeText(input.serviceType, base.serviceType),
    startDate: sanitizeDateISO(input.startDate, base.startDate),
    projectFee: clampNumber(input.projectFee, 0, 10_000_000, base.projectFee),
    paymentDueDays: clampInteger(input.paymentDueDays, 0, 365, base.paymentDueDays),
    includedRevisions: clampInteger(input.includedRevisions, 0, 200, base.includedRevisions),
    scopeNotes: sanitizeText(input.scopeNotes, ""),
    remoteSigning: sanitizeRemoteSigning(input.remoteSigning),
    signatures: {
      provider: sanitizeContractSigner(input.signatures?.provider),
      client: sanitizeContractSigner(input.signatures?.client),
    },
  };
}

function createDefaultRemoteSigning() {
  return {
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
  };
}

function sanitizeRemoteSigning(input) {
  return {
    token: sanitizeText(input?.token, ""),
    signUrl: sanitizeText(input?.signUrl, ""),
    expiresAt: sanitizeText(input?.expiresAt, ""),
    lastSyncedAt: sanitizeText(input?.lastSyncedAt, ""),
    sentAt: sanitizeText(input?.sentAt, ""),
    sentVia: sanitizeText(input?.sentVia, ""),
    sentTo: sanitizeText(input?.sentTo, ""),
    notifyOwnerEmail: sanitizeEmail(input?.notifyOwnerEmail),
    notifyOwnerPhone: sanitizePhone(input?.notifyOwnerPhone),
    deliveryChannel: sanitizeDeliveryChannel(input?.deliveryChannel),
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

function sanitizeContractSigner(input) {
  const finalType = input?.finalType === "draw" || input?.finalType === "type" ? input.finalType : "";
  const rawFinalValue = sanitizeText(input?.finalValue, "");

  return {
    signerName: sanitizeText(input?.signerName, ""),
    mode: input?.mode === "type" ? "type" : "draw",
    typedSignature: sanitizeText(input?.typedSignature, ""),
    finalType,
    finalValue: finalType === "draw" ? sanitizeImageDataUrl(rawFinalValue) : rawFinalValue,
    signedAt: sanitizeText(input?.signedAt, ""),
  };
}

function sanitizeSignType(value) {
  if (value === "draw" || value === "type") {
    return value;
  }
  throw new Error("Invalid signature type.");
}

function sanitizeDeliveryChannel(value) {
  if (value === "email" || value === "sms" || value === "auto") {
    return value;
  }
  return "auto";
}

function sanitizeEmail(value) {
  const text = sanitizeText(value, "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return text;
  }
  return "";
}

function sanitizePhone(value) {
  const raw = sanitizeText(value, "").trim();
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (raw.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length >= 8) {
    return `+${digits}`;
  }
  return "";
}

async function deliverSignLink(input) {
  const { requestedChannel, email, phone, signUrl, contract } = input;

  if (!email && !phone) {
    throw new Error("Client email or phone is required.");
  }

  const canEmail = isEmailDeliveryConfigured() && Boolean(email);
  const canSms = isSmsDeliveryConfigured() && Boolean(phone);

  if (requestedChannel === "email") {
    if (!email) {
      throw new Error("A valid client email is required.");
    }
    if (!isEmailDeliveryConfigured()) {
      throw new Error("Email delivery is not configured on server.");
    }
    await sendEmailSignLink({ to: email, signUrl, contract });
    return { channel: "email", recipient: email };
  }

  if (requestedChannel === "sms") {
    if (!phone) {
      throw new Error("A valid client phone is required.");
    }
    if (!isSmsDeliveryConfigured()) {
      throw new Error("SMS delivery is not configured on server.");
    }
    await sendSmsSignLink({ to: phone, signUrl, contract });
    return { channel: "sms", recipient: phone };
  }

  if (canEmail) {
    await sendEmailSignLink({ to: email, signUrl, contract });
    return { channel: "email", recipient: email };
  }

  if (canSms) {
    await sendSmsSignLink({ to: phone, signUrl, contract });
    return { channel: "sms", recipient: phone };
  }

  if (email || phone) {
    throw new Error(
      "Delivery provider is not configured. Set SMTP_* (email) and/or TWILIO_* (sms) environment variables.",
    );
  }

  throw new Error("No valid client contact found.");
}

function isEmailDeliveryConfigured() {
  return Boolean(SMTP_HOST && SMTP_FROM);
}

function isSmsDeliveryConfigured() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

function getMailTransporter() {
  if (!isEmailDeliveryConfigured()) {
    throw new Error("Email delivery is not configured.");
  }

  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth:
        SMTP_USER && SMTP_PASS
          ? {
              user: SMTP_USER,
              pass: SMTP_PASS,
            }
          : undefined,
    });
  }
  return mailTransporter;
}

async function sendEmailSignLink(input) {
  const { to, signUrl, contract } = input;
  const transporter = getMailTransporter();
  const subject = `${contract.businessName || "Service Provider"} sent a contract for your signature`;
  const paymentDueDate = formatDateHuman(
    addDaysToDateISO(contract.startDate, clampInteger(contract.paymentDueDays, 0, 365, 0)),
  );
  const fee = formatCadCurrency(contract.projectFee);
  const providerSigner = sanitizeText(contract.signatures?.provider?.signerName, "") || contract.businessName;
  const providerSignedAt = formatDateTimeHuman(contract.signatures?.provider?.signedAt);
  const text = [
    `Hello ${contract.clientName || "Client"},`,
    "",
    `${contract.businessName || "A business"} has requested your signature on a service agreement.`,
    `Provider signed by: ${providerSigner} on ${providerSignedAt}`,
    `Service: ${contract.serviceType || "-"}`,
    `Project fee: ${fee}`,
    `Payment due: ${contract.paymentDueDays} day(s) by ${paymentDueDate}`,
    "",
    `Sign here: ${signUrl}`,
    "",
    "This secure link opens your signer-only page where contract terms are locked and only your signature can be submitted.",
  ].join("\n");

  const html = [
    `<p>Hello ${escapeHtml(contract.clientName || "Client")},</p>`,
    `<p><strong>${escapeHtml(contract.businessName || "A business")}</strong> has requested your signature on a service agreement.</p>`,
    `<p><strong>Provider signed by:</strong> ${escapeHtml(providerSigner)} on ${escapeHtml(providerSignedAt)}</p>`,
    "<ul>",
    `<li>Service: ${escapeHtml(contract.serviceType || "-")}</li>`,
    `<li>Project fee: ${escapeHtml(fee)}</li>`,
    `<li>Payment due: ${escapeHtml(String(contract.paymentDueDays))} day(s) by ${escapeHtml(paymentDueDate)}</li>`,
    "</ul>",
    `<p><a href="${escapeHtml(signUrl)}">Click here to review and sign</a></p>`,
    "<p>This secure link opens your signer-only page where contract terms are locked and only your signature can be submitted.</p>",
  ].join("");

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

async function sendSmsSignLink(input) {
  const { to, signUrl, contract } = input;
  const businessName = contract.businessName || "Service Provider";
  const service = contract.serviceType || "professional services";
  const providerSigner = sanitizeText(contract.signatures?.provider?.signerName, "") || businessName;
  const body =
    `${businessName} sent your contract for signature (signed by ${providerSigner}). Service: ${service}. ` +
    `Sign here: ${signUrl}`;

  const encoded = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encoded,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const msg = sanitizeText(payload?.message, "Twilio SMS send failed.");
    throw new Error(msg);
  }
}

async function sendSignedCopyNotifications(input) {
  const { token, contract, signedCopyUrl } = input;
  const remote = sanitizeRemoteSigning(contract.remoteSigning);
  const ownerEmail = sanitizeEmail(remote.notifyOwnerEmail);
  const ownerPhone = sanitizePhone(remote.notifyOwnerPhone);
  const clientEmail = sanitizeEmail(contract.clientEmail);
  const clientPhone = sanitizePhone(contract.clientPhone);
  const sentTargets = [];

  const emailTargets = uniqueList([clientEmail, ownerEmail].filter(Boolean));
  const smsTargets = uniqueList([clientPhone, ownerPhone].filter(Boolean));

  for (const email of emailTargets) {
    if (!isEmailDeliveryConfigured()) {
      break;
    }
    await sendEmailSignedCopy({
      to: email,
      signedCopyUrl,
      contract,
      token,
    });
    sentTargets.push({ channel: "email", recipient: email });
  }

  for (const phone of smsTargets) {
    if (!isSmsDeliveryConfigured()) {
      break;
    }
    await sendSmsSignedCopy({
      to: phone,
      signedCopyUrl,
      contract,
    });
    sentTargets.push({ channel: "sms", recipient: phone });
  }

  return {
    sentCount: sentTargets.length,
    targets: sentTargets.map((target) => ({
      channel: target.channel,
      recipient: maskRecipient(target.channel, target.recipient),
    })),
    signedCopyUrl,
  };
}

async function sendEmailSignedCopy(input) {
  const { to, signedCopyUrl, contract } = input;
  const transporter = getMailTransporter();
  const signedAt = formatDateTimeHuman(contract.signatures?.client?.signedAt);
  const subject = `Signed contract copy: ${contract.businessName || "Service Agreement"}`;
  const fee = formatCadCurrency(contract.projectFee);
  const text = [
    `Signed contract copy`,
    "",
    `Business: ${contract.businessName || "-"}`,
    `Client: ${contract.clientName || "-"}`,
    `Service: ${contract.serviceType || "-"}`,
    `Project fee: ${fee}`,
    `Client signed at: ${signedAt}`,
    "",
    `View signed copy: ${signedCopyUrl}`,
  ].join("\n");

  const html = [
    `<p><strong>Signed contract copy</strong></p>`,
    "<ul>",
    `<li>Business: ${escapeHtml(contract.businessName || "-")}</li>`,
    `<li>Client: ${escapeHtml(contract.clientName || "-")}</li>`,
    `<li>Service: ${escapeHtml(contract.serviceType || "-")}</li>`,
    `<li>Project fee: ${escapeHtml(fee)}</li>`,
    `<li>Client signed at: ${escapeHtml(signedAt)}</li>`,
    "</ul>",
    `<p><a href="${escapeHtml(signedCopyUrl)}">Open signed copy</a></p>`,
  ].join("");

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

async function sendSmsSignedCopy(input) {
  const { to, signedCopyUrl, contract } = input;
  const businessName = contract.businessName || "Service Provider";
  const body = `Signed contract copy from ${businessName}: ${signedCopyUrl}`;

  const encoded = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encoded,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const msg = sanitizeText(payload?.message, "Twilio SMS send failed.");
    throw new Error(msg);
  }
}

function uniqueList(items) {
  return [...new Set(items)];
}

function maskRecipient(channel, recipient) {
  if (!recipient) {
    return "";
  }
  if (channel === "email") {
    const [local, domain] = recipient.split("@");
    if (!local || !domain) {
      return recipient;
    }
    if (local.length <= 2) {
      return `**@${domain}`;
    }
    return `${local.slice(0, 2)}***@${domain}`;
  }

  const digits = recipient.replace(/\D/g, "");
  if (digits.length < 4) {
    return recipient;
  }
  return `***${digits.slice(-4)}`;
}

function renderSignedCopyHtml(contract, meta) {
  const clauses = getContractClauses(contract);
  const providerSignature = renderSignatureBlockHtml(contract.signatures?.provider);
  const clientSignature = renderSignatureBlockHtml(contract.signatures?.client);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Signed Contract Copy</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f4f6fb; color: #111827; }
      .shell { width: min(980px, 94vw); margin: 0 auto; padding: 1rem 0 1.6rem; }
      .panel { background: #fff; border: 1px solid #d4d9e3; padding: 1rem; }
      h1,h2,h3 { margin: 0; }
      .muted { color: #52607a; }
      .summary { margin-top: 0.8rem; display: grid; gap: 0.3rem; }
      .summary p { margin: 0; }
      ol { margin: 0.8rem 0 0; padding-left: 1.2rem; }
      li { margin: 0.2rem 0; }
      .signatures { margin-top: 1rem; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
      .sign-box { border: 1px solid #d4d9e3; padding: 0.6rem; }
      .sign-img { max-width: 100%; max-height: 90px; object-fit: contain; background: #fff; border-bottom: 1px solid #e3e8f2; }
      .sign-typed { font-size: 1.4rem; font-style: italic; color: #1f2a44; }
      @media (max-width: 760px) { .signatures { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <h1>Signed Service Agreement</h1>
        <p class="muted">Token: ${escapeHtml(meta.token)} | Status: ${escapeHtml(meta.status)} | Signed Count: ${escapeHtml(String(meta.signCount))}</p>
        <div class="summary">
          <p><strong>Province:</strong> ${escapeHtml(contract.province)}</p>
          <p><strong>Business:</strong> ${escapeHtml(contract.businessName)}</p>
          <p><strong>Client:</strong> ${escapeHtml(contract.clientName)}</p>
          <p><strong>Service:</strong> ${escapeHtml(contract.serviceType)}</p>
          <p><strong>Start Date:</strong> ${escapeHtml(formatDateHuman(contract.startDate))}</p>
          <p><strong>Project Fee:</strong> ${escapeHtml(formatCadCurrency(contract.projectFee))}</p>
        </div>
        <h2 style="margin-top: 0.9rem;">Contract Terms</h2>
        <ol>${clauses.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol>
        <h2 style="margin-top: 1rem;">Signatures</h2>
        <section class="signatures">
          <article class="sign-box">
            <h3>Service Provider</h3>
            ${providerSignature}
          </article>
          <article class="sign-box">
            <h3>Client</h3>
            ${clientSignature}
          </article>
        </section>
      </section>
    </main>
  </body>
</html>`;
}

function renderSignatureBlockHtml(signerInput) {
  const signer = sanitizeContractSigner(signerInput);
  const name = signer.signerName || "-";
  const signedAt = signer.signedAt ? formatDateTimeHuman(signer.signedAt) : "Not signed yet";
  const signatureMarkup =
    signer.finalType === "draw" && signer.finalValue
      ? `<img class="sign-img" src="${signer.finalValue}" alt="Drawn signature" />`
      : signer.finalType === "type" && signer.finalValue
      ? `<p class="sign-typed">${escapeHtml(signer.finalValue)}</p>`
      : `<p class="muted">No signature captured</p>`;

  return [
    `<p><strong>Signer:</strong> ${escapeHtml(name)}</p>`,
    `<p><strong>Signed At:</strong> ${escapeHtml(signedAt)}</p>`,
    signatureMarkup,
  ].join("");
}

function getContractClauses(contract) {
  const startDate = formatDateHuman(contract.startDate);
  const dueDate = formatDateHuman(addDaysToDateISO(contract.startDate, contract.paymentDueDays));
  const notes = sanitizeText(contract.scopeNotes, "").trim() || "No additional notes were provided.";
  const serviceText = sanitizeText(contract.serviceType, "").trim() || "the listed professional services";
  const feeText = formatCadCurrency(contract.projectFee);
  const revisions = clampInteger(contract.includedRevisions, 0, 500, 0);
  const paymentDueDays = clampInteger(contract.paymentDueDays, 0, 365, 0);

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

function sanitizeSignValue(signType, value) {
  if (signType === "type") {
    const typed = sanitizeRequiredText(value, "Typed signature is required.");
    if (typed.length > 140) {
      throw new Error("Typed signature is too long.");
    }
    return typed;
  }

  const drawn = sanitizeImageDataUrl(value);
  if (!drawn) {
    throw new Error("Drawn signature image is invalid.");
  }
  if (drawn.length > 4_000_000) {
    throw new Error("Drawn signature payload is too large.");
  }
  return drawn;
}

function sanitizeImageDataUrl(value) {
  const text = sanitizeText(value, "");
  if (/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(text)) {
    return text;
  }
  return "";
}

function sanitizeProvince(value) {
  if (CANADA_REGIONS.has(value)) {
    return value;
  }
  return "Ontario";
}

function sanitizeDateISO(value, fallback) {
  const text = sanitizeText(value, fallback);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
}

function sanitizeRequiredText(value, errorMessage) {
  const text = sanitizeText(value, "").trim();
  if (!text) {
    throw new Error(errorMessage);
  }
  return text;
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(baseIso, dayCount) {
  const date = new Date(baseIso);
  date.setDate(date.getDate() + dayCount);
  return date.toISOString();
}

function addDaysToDateISO(dateValue, dayCount) {
  if (!dateValue) {
    return "";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + Math.max(0, Math.round(dayCount)));
  return formatDateISO(date);
}

function isExpired(expiresAtIso) {
  const time = Date.parse(expiresAtIso);
  if (!Number.isFinite(time)) {
    return true;
  }
  return Date.now() > time;
}

function trimTrailingSlash(url) {
  return String(url).replace(/\/$/, "");
}

function getRequestIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
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

function formatCadCurrency(value) {
  const amount = clampNumber(value, 0, 10_000_000, 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
