const core = require("./_extension-config-core");
const { getLatestPayment, getLatestPaymentByBillingKey } = require("../lib/billing-state");
const { listRecipientsForExtension, resolveRecipientEmail } = require("../lib/access-service");

const BROWSER_READ_RUNTIME_IDS = new Set([
  "nicnjmokndbjnpjlikgmnfkihkklobce",
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  "aachjpoooepljhlphhaplfijppgbjdfp",
  "hbokpkaoocpcecbfgfadoplblcfannke",
  "njnehniaiehecdplafcbkdhhmjjcojfe"
]);

const RAONY_EMAIL = "raony-oliveira@hotmail.com";
const RAONY_PREMIUM_BILLING_KEY = RAONY_EMAIL + ":47";
const RAONY_STANDARD_BILLING_KEY = RAONY_EMAIL + ":9";
const RAONY_PREMIUM_EXTENSION_IDS = Object.freeze([
  "ocnhopnkhbkgknjhpfcmbihmialpjboj",
  "gklblkkcpmbmnnmjclppoldcdbimoafc"
]);

const BROWSER_READ_BILLING_PROFILES = Object.freeze({
  Deivis: Object.freeze({
    email: "deivisriemer4" + "@gmail.com",
    billingKey: "deivisriemer4" + "@gmail.com",
    recurring: true,
    startDate: "2026-09-11",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  })
});

// Regras globais por e-mail: aplicadas automaticamente em TODAS as extensões
// onde o destinatário existir no EXTENSION_EMAIL_MAP.
const GLOBAL_EMAIL_BILLING_PROFILES = Object.freeze({
  "drivecursos@proton.me": Object.freeze({
    email: "drivecursos@proton.me",
    billingKey: "drivecursos@proton.me",
    recurring: true,
    startDate: "2026-09-18",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  }),
  "hpx.jbvs@gmail.com": Object.freeze({
    email: "hpx.jbvs@gmail.com",
    billingKey: "hpx.jbvs@gmail.com",
    recurring: true,
    startDate: "2026-09-15",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  }),
  "jony.mkt@gmail.com": Object.freeze({
    email: "jony.mkt@gmail.com",
    billingKey: "jony.mkt@gmail.com",
    recurring: true,
    startDate: "2026-09-15",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  }),
  "enkazamodas@gmail.com": Object.freeze({
    email: "enkazamodas@gmail.com",
    billingKey: "enkazamodas@gmail.com",
    recurring: true,
    startDate: "2026-09-15",
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  }),
  "rafa.araujo.27@gmail.com": Object.freeze({
    email: "rafa.araujo.27@gmail.com",
    billingKey: "rafa.araujo.27@gmail.com",
    recurring: true,
    startDate: "2026-09-15",
    monthlyPrice: "R$ 47,00",
    chargeAmountCents: 4700,
    supportEmail: "caixa" + "@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  })
});

// E-mails explicitamente sem cobrança no mapa de cobrança da Vercel.
const DISABLED_BILLING_EMAILS = new Set([
  "wisdom.sats89@gmail.com",
  "bragapeedro@gmail.com",
  "cibaldestudio@gmail.com",
  "guilira1408@gmail.com"
]);

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
  const globalBillingProfiles = await buildGlobalEmailBillingProfiles(extensionId, today, false);
  const pendingProfiles = filterDisabledBillingProfiles({
    ...(config.pendingProfiles || {}),
    ...globalBillingProfiles
  });

  if (!isBrowserReadRuntime(extensionId)) {
    return { ...config, pendingProfiles };
  }

  const billingProfiles = await buildBrowserReadBillingProfiles(extensionId, today, false);
  return {
    ...config,
    pendingProfiles: filterDisabledBillingProfiles({
      ...pendingProfiles,
      ...billingProfiles
    })
  };
}

async function buildPublicExtensionConfig(extensionId, today = new Date()) {
  const config = await core.buildPublicExtensionConfig(extensionId, today);
  const globalBillingProfiles = await buildGlobalEmailBillingProfiles(extensionId, today, true);
  const pendingProfiles = filterDisabledBillingProfiles({
    ...(config.pendingProfiles || {}),
    ...globalBillingProfiles
  });

  if (!isBrowserReadRuntime(extensionId)) {
    return { ...config, pendingProfiles };
  }

  const billingProfiles = await buildBrowserReadBillingProfiles(extensionId, today, true);
  return {
    ...config,
    pendingProfiles: filterDisabledBillingProfiles({
      ...pendingProfiles,
      ...billingProfiles
    })
  };
}

async function resolvePendingProfile(extensionId, recipientKey) {
  if (isBrowserReadRuntime(extensionId)) {
    const matchedProfile = await findBrowserReadBillingProfile(extensionId, recipientKey);
    if (matchedProfile && !isBillingDisabledProfile(matchedProfile)) {
      return buildBillingProfile(extensionId, matchedProfile);
    }
  }

  const globalProfile = findGlobalEmailBillingProfile(extensionId, recipientKey);
  if (globalProfile && !isBillingDisabledProfile(globalProfile)) {
    return buildBillingProfile(extensionId, globalProfile);
  }

  const coreProfile = await core.resolvePendingProfile(extensionId, recipientKey);
  if (isBillingDisabledProfile(coreProfile)) {
    return null;
  }

  return coreProfile;
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

async function buildGlobalEmailBillingProfiles(extensionId, today, dueOnly) {
  const entries = [];

  try {
    for (const recipient of listRecipientsForExtension(extensionId)) {
      const email = normalizeEmail(resolveRecipientEmail({ extensionId, recipientKey: recipient.key }));
      const profile = getEmailBillingProfile(extensionId, email);

      if (!profile || isBillingDisabledProfile(profile)) {
        continue;
      }

      const resolved = await buildBillingProfile(extensionId, profile, today);
      if (dueOnly && !core.isChargeDue(resolved, today)) {
        continue;
      }

      entries.push([recipient.key, resolved]);
    }
  } catch (_error) {
    return {};
  }

  return Object.fromEntries(entries);
}

async function buildBillingProfile(extensionId, profile, today = new Date()) {
  const paymentCandidates = [];

  const latestPayment = await getLatestPayment({
    extensionId,
    billingKey: profile.billingKey
  });
  paymentCandidates.push(latestPayment?.paidAt);

  if (Array.isArray(profile.sharedPaymentExtensionIds) && profile.sharedPaymentExtensionIds.length > 0) {
    const sharedPayment = await getLatestPaymentByBillingKey({
      billingKey: profile.billingKey,
      extensionIds: profile.sharedPaymentExtensionIds
    });
    paymentCandidates.push(sharedPayment?.paidAt);
  }

  if (profile.coveredByBillingKey) {
    const coveringPayment = await getLatestPaymentByBillingKey({
      billingKey: profile.coveredByBillingKey,
      extensionIds: profile.coveredByExtensionIds || []
    });
    paymentCandidates.push(coveringPayment?.paidAt);
  }

  paymentCandidates.push(profile.manualPaidAt);

  const effectivePaidAt = getLatestPaidAt(paymentCandidates);
  const dates = core.resolveRecurrenceDates(profile, effectivePaidAt, today);
  const {
    manualPaidAt,
    sharedPaymentExtensionIds,
    coveredByBillingKey,
    coveredByExtensionIds,
    ...publicProfile
  } = profile;

  return { ...publicProfile, ...dates };
}

function getLatestPaidAt(values) {
  let latest = "";

  for (const value of values || []) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) continue;

    if (!latest || date.getTime() > new Date(latest).getTime()) {
      latest = date.toISOString();
    }
  }

  return latest;
}

async function findBrowserReadBillingProfile(extensionId, recipientKey) {
  const normalizedKey = String(recipientKey || "").trim().toLowerCase();

  for (const [key, profile] of Object.entries(BROWSER_READ_BILLING_PROFILES)) {
    if (key.toLowerCase() === normalizedKey) {
      return profile;
    }
  }

  try {
    const email = normalizeEmail(resolveRecipientEmail({ extensionId, recipientKey }));
    return Object.values(BROWSER_READ_BILLING_PROFILES)
      .find((profile) => normalizeEmail(profile.email) === email) || null;
  } catch (_error) {
    return null;
  }
}

function findGlobalEmailBillingProfile(extensionId, recipientKey) {
  try {
    const email = normalizeEmail(resolveRecipientEmail({ extensionId, recipientKey }));
    return getEmailBillingProfile(extensionId, email);
  } catch (_error) {
    return null;
  }
}

function getEmailBillingProfile(extensionId, email) {
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail === RAONY_EMAIL) {
    const isPremiumExtension = RAONY_PREMIUM_EXTENSION_IDS.includes(String(extensionId || "").trim());

    if (isPremiumExtension) {
      return {
        email: RAONY_EMAIL,
        billingKey: RAONY_PREMIUM_BILLING_KEY,
        recurring: true,
        startDate: "2026-09-20",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        sharedPaymentExtensionIds: RAONY_PREMIUM_EXTENSION_IDS,
        supportEmail: "caixa" + "@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      };
    }

    return {
      email: RAONY_EMAIL,
      billingKey: RAONY_STANDARD_BILLING_KEY,
      recurring: true,
      startDate: "2026-09-20",
      monthlyPrice: "R$ 9,00",
      chargeAmountCents: 900,
      coveredByBillingKey: RAONY_PREMIUM_BILLING_KEY,
      coveredByExtensionIds: RAONY_PREMIUM_EXTENSION_IDS,
      supportEmail: "caixa" + "@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    };
  }

  return GLOBAL_EMAIL_BILLING_PROFILES[normalizedEmail] || null;
}

function filterDisabledBillingProfiles(pendingProfiles) {
  return Object.fromEntries(
    Object.entries(pendingProfiles || {}).filter(([, profile]) => !isBillingDisabledProfile(profile))
  );
}

function isBillingDisabledProfile(profile) {
  return DISABLED_BILLING_EMAILS.has(normalizeEmail(profile?.email));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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
