const core = require("./_extension-config-core");
const { getLatestPayment } = require("../lib/billing-state");
const { resolveRecipientEmail } = require("../lib/access-service");

const BROWSER_READ_RUNTIME_IDS = new Set([
  "nicnjmokndbjnpjlikgmnfkihkklobce",
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  "aachjpoooepljhlphhaplfijppgbjdfp"
]);
const DEIVIS_BILLING_PROFILE = Object.freeze({
  email: "deivisriemer4@gmail.com",
  billingKey: "deivisriemer4@gmail.com",
  recurring: true,
  startDate: "2026-09-12",
  monthlyPrice: "R$ 9,00",
  chargeAmountCents: 900,
  supportEmail: "caixa@mentorxlab.com",
  supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
});

async function extensionConfigHandler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    assertAuthorized(req);
    const body = normalizeBody(req.body);
    const extensionId = String(body.extensionId || "").trim();

    if (!extensionId) {
      res.status(400).json({ ok: false, error: "missing_required_fields" });
      return;
    }

    res.status(200).json({
      ok: true,
      extensionId,
      config: await buildPublicExtensionConfig(extensionId)
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      error: error instanceof Error ? error.message : "extension_config_failed"
    });
  }
}

async function buildExtensionConfig(extensionId, today = new Date()) {
  const config = await core.buildExtensionConfig(extensionId, today);

  if (!isBrowserReadRuntime(extensionId)) {
    return config;
  }

  const deivisProfile = await buildDeivisProfile(extensionId, today);
  return {
    ...config,
    pendingProfiles: {
      ...(config.pendingProfiles || {}),
      Deivis: deivisProfile
    }
  };
}

async function buildPublicExtensionConfig(extensionId, today = new Date()) {
  const config = await core.buildPublicExtensionConfig(extensionId, today);

  if (!isBrowserReadRuntime(extensionId)) {
    return config;
  }

  const deivisProfile = await buildDeivisProfile(extensionId, today);
  const pendingProfiles = { ...(config.pendingProfiles || {}) };

  if (core.isChargeDue(deivisProfile, today)) {
    pendingProfiles.Deivis = deivisProfile;
  } else {
    delete pendingProfiles.Deivis;
  }

  return { ...config, pendingProfiles };
}

async function resolvePendingProfile(extensionId, recipientKey) {
  if (isBrowserReadRuntime(extensionId) && await isDeivisRecipient(extensionId, recipientKey)) {
    return buildDeivisProfile(extensionId);
  }

  return core.resolvePendingProfile(extensionId, recipientKey);
}

async function buildDeivisProfile(extensionId, today = new Date()) {
  const profile = { ...DEIVIS_BILLING_PROFILE };
  const latestPayment = await getLatestPayment({
    extensionId,
    billingKey: profile.billingKey
  });
  const dates = core.resolveRecurrenceDates(profile, latestPayment?.paidAt, today);
  return { ...profile, ...dates };
}

async function isDeivisRecipient(extensionId, recipientKey) {
  const normalizedKey = String(recipientKey || "").trim().toLowerCase();

  if (normalizedKey === "deivis") {
    return true;
  }

  try {
    const email = String(resolveRecipientEmail({ extensionId, recipientKey }) || "").trim().toLowerCase();
    return email === DEIVIS_BILLING_PROFILE.email;
  } catch (_error) {
    return false;
  }
}

function isBrowserReadRuntime(extensionId) {
  return BROWSER_READ_RUNTIME_IDS.has(String(extensionId || "").trim());
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function assertAuthorized(req) {
  const expectedToken = process.env.WEBHOOK_TOKEN || "";
  const providedToken = getBearerToken(req);

  if (expectedToken && providedToken !== expectedToken) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }
  return body;
}

module.exports = extensionConfigHandler;
module.exports.buildExtensionConfig = buildExtensionConfig;
module.exports.buildPublicExtensionConfig = buildPublicExtensionConfig;
module.exports.resolvePendingProfile = resolvePendingProfile;
module.exports.resolveRecurrenceDates = core.resolveRecurrenceDates;
module.exports.isChargeDue = core.isChargeDue;
