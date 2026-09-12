const core = require("./access-service-core");

const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const BROWSER_READ_RUNTIME_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  "aachjpoooepljhlphhaplfijppgbjdfp"
]);

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
    return core.listRecipientsForExtension(resolveBrowserReadConfigId(extensionId));
  },
  resolveRecipientEmail(args) {
    return core.resolveRecipientEmail(mapDisplayArgs(args));
  },
  resolveRecipientTargets(args) {
    return core.resolveRecipientTargets(mapDisplayArgs(args));
  },
  verifyAccessChallenge(args) {
    // Verification must use the same real runtime ID that was signed.
    return core.verifyAccessChallenge(args);
  }
};
