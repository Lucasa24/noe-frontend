const core = require("./_extension-config-core");
const { getLatestPayment } = require("../lib/billing-state");
const { resolveRecipientEmail } = require("../lib/access-service");

const BROWSER_READ_RUNTIME_IDS = new Set([
  "nicnjmokndbjnpjlikgmnfkihkklobce",
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  "aachjpoooepljhlphhaplfijppgbjdfp",
  "hbokpkaoocpcecbfgfadoplblcfannke"
]);

const BROWSER_READ_BILLING_PROFILES = Object.freeze({
  Deivis: Object.freeze({
    email: "deivisriemer4@gmail.com",
    billingKey: "deivisriemer4@gmail.com",
    recurring: true,
    startDate: "2026-09-11",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  }),
  Hugo: Object.freeze({
    email: "cibaldestudio@gmail.com",
    billingKey: "cibaldestudio@gmail.com",
    recurring: true,
    startDate: "2026-09-11",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  })
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

  const billingProfiles = await buildBrowserReadBillingProfiles(extensionId, today, false);
  return {
    ...config,
    pendingProfiles: {
      ...(config.pendingProfiles || {}),
      ...billingProfiles
    }
  };
}

async function buildPublicExtensionConfig(extensionId, today = new Date()) {
  const config = await core.buildPublicExtensionConfig(extensionId, today);

  if (!isBrowserReadRuntime(extensionId)) {
    return config;
  }

  const billingProfiles = await buildBrowserReadBillingProfiles(extensionId, today, true);
  return {
    ...config,
    pendingProfiles: {
      ...(config.pendingProfiles || {}),
      ...billingProfiles
    }
  };
}

async function resolvePendingProfile(extensionId, recipientKey) {
  if (isBrowserReadRuntime(extensionId)) {
    const matchedProfile = await findBrowserReadBillingProfile(extensionId, recipientKey);
    if (matchedProfile) {
      return buildBillingProfile(extensionId, matchedProfile);
    }
  }

  return core.resolvePendingProfile(extensionId, recipientKey);
}

async function buildBrowserReadBillingProfiles(extensionId, today, dueOnly) {
  const entries = await Promise.all(Object.entries(BROWSER_READ_BILLING_PROFILES).map(async ([key, profile]) => {
    const resolved = await buildBillingProfile(extensionId, profile, today);
    if (dueOnly && !core.isChargeDue(resolved, today)) {
      return null;
    }
    return [key, resolved];
  }));

  return Object.fromEntries(entries.filter(Boolean));
}

async function buildBillingProfile(extensionId, profile, today = new Date()) {
  const latestPayment = await getLatestPayment({
    extensionId,
    billingKey: profile.billingKey
  });
  const dates = core.resolveRecurrenceDates(profile, latestPayment?.paidAt, today);
  return { ...profile, ...dates };
}

async function findBrowserReadBillingProfile(extensionId, recipientKey) {
  const normalizedKey = String(recipientKey || "").trim().toLowerCase();

  for (const [key, profile] of Object.entries(BROWSER_READ_BILLING_PROFILES)) {
    if (key.toLowerCase() === normalizedKey) {
      return profile;
    }
  }

  try {
    const email = String(resolveRecipientEmail({ extensionId, recipientKey }) || "").trim().toLowerCase();
    return Object.values(BROWSER_READ_BILLING_PROFILES)
      .find((profile) => profile.email.toLowerCase() === email) || null;
  } catch (_error) {
    return null;
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
