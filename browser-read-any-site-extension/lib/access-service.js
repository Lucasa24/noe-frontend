const core = require("./access-service-core");

const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const BROWSER_READ_RUNTIME_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  "aachjpoooepljhlphhaplfijppgbjdfp"
]);
const STATIC_BROWSER_READ_RECIPIENTS = Object.freeze({
  Deivis: Object.freeze(["deivisriemer4@gmail.com"])
});

function resolveBrowserReadConfigId(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  return BROWSER_READ_RUNTIME_IDS.has(normalizedExtensionId)
    ? CONTENT_SELECTOR_CONFIG_ID
    : normalizedExtensionId;
}

function ensureBrowserReadRuntimeIdsAreAuthorized() {
  const raw = String(process.env.ALLOWED_EXTENSION_IDS || "").trim();

  if (!raw) {
    return;
  }

  const ids = raw.split(",").map((item) => item.trim()).filter(Boolean);

  if (!ids.includes(CONTENT_SELECTOR_CONFIG_ID)) {
    return;
  }

  for (const extensionId of BROWSER_READ_RUNTIME_IDS) {
    if (!ids.includes(extensionId)) {
      ids.push(extensionId);
    }
  }

  process.env.ALLOWED_EXTENSION_IDS = ids.join(",");
}

ensureBrowserReadRuntimeIdsAreAuthorized();

function mapDisplayArgs(args) {
  if (!args || typeof args !== "object") {
    return args;
  }

  return {
    ...args,
    extensionId: resolveBrowserReadConfigId(args.extensionId)
  };
}

function getStaticBrowserReadRecipientTargets(extensionId, recipientKey) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedRecipientKey = String(recipientKey || "").trim().toLowerCase();

  if (!BROWSER_READ_RUNTIME_IDS.has(normalizedExtensionId) || !normalizedRecipientKey) {
    return null;
  }

  for (const [key, targets] of Object.entries(STATIC_BROWSER_READ_RECIPIENTS)) {
    if (key.toLowerCase() === normalizedRecipientKey) {
      return [...targets];
    }
  }

  return null;
}

function mergeStaticBrowserReadRecipients(extensionId, recipients) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const baseRecipients = Array.isArray(recipients) ? [...recipients] : [];

  if (!BROWSER_READ_RUNTIME_IDS.has(normalizedExtensionId)) {
    return baseRecipients;
  }

  const knownKeys = new Set(baseRecipients.map((item) => String(item?.key || "").trim().toLowerCase()));

  for (const key of Object.keys(STATIC_BROWSER_READ_RECIPIENTS)) {
    if (!knownKeys.has(key.toLowerCase())) {
      baseRecipients.push({ key, label: key });
    }
  }

  return baseRecipients;
}

module.exports = {
  buildAdminAlertEmailMessage(args) {
    return core.buildAdminAlertEmailMessage(mapDisplayArgs(args));
  },
  buildEmailMessage(args) {
    return core.buildEmailMessage(mapDisplayArgs(args));
  },
  buildWhatsAppAlertMessage(args) {
    return core.buildWhatsAppAlertMessage(mapDisplayArgs(args));
  },
  createAccessChallenge(args) {
    // Keep the real chrome.runtime.id in the signed challenge.
    return core.createAccessChallenge(args);
  },
  listRecipientsForExtension(extensionId) {
    const recipients = core.listRecipientsForExtension(resolveBrowserReadConfigId(extensionId));
    return mergeStaticBrowserReadRecipients(extensionId, recipients);
  },
  resolveRecipientEmail(args) {
    const staticTargets = getStaticBrowserReadRecipientTargets(args?.extensionId, args?.recipientKey);
    if (staticTargets?.length) {
      return staticTargets[0];
    }
    return core.resolveRecipientEmail(mapDisplayArgs(args));
  },
  resolveRecipientTargets(args) {
    const staticTargets = getStaticBrowserReadRecipientTargets(args?.extensionId, args?.recipientKey);
    if (staticTargets?.length) {
      return staticTargets;
    }
    return core.resolveRecipientTargets(mapDisplayArgs(args));
  },
  verifyAccessChallenge(args) {
    // Verification must use the same real runtime ID that was signed.
    return core.verifyAccessChallenge(args);
  }
};
