const core = require("./access-service-core");

const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const PIXEL_AI_HUB_CONFIG_ID = "aachjpoooepljhlphhaplfijppgbjdfp";
const BROWSER_READ_RUNTIME_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  PIXEL_AI_HUB_CONFIG_ID,
  "hbokpkaoocpcecbfgfadoplblcfannke",
  "njnehniaiehecdplafcbkdhhmjjcojfe"
]);
const STATIC_BROWSER_READ_RECIPIENTS = Object.freeze({
  Deivis: Object.freeze(["deivisriemer4" + "@gmail.com"]),
  Hugo: Object.freeze(["cibaldestudio" + "@gmail.com"]),
  Janderson: Object.freeze(["jandergfx" + "@gmail.com", "lucasalvarezempresa" + "@gmail.com"]),
  "~ Solicitar Ativação com Adm": Object.freeze(["lucasalvarezempresa" + "@gmail.com"])
});

const STATIC_EXTENSION_RECIPIENTS = Object.freeze({
  jncbkkimmoapjemleedmklnlgiioiffj: Object.freeze({
    Pedro: Object.freeze(["bragapeedro" + "@gmail.com", "lucasalvarezempresa" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"])
  }),
  kjlkomgkandjgpmecnfnindkkgdjadpe: Object.freeze({
    Will: Object.freeze(["wisdom.sats89" + "@gmail.com", "lucasalvarezempresa" + "@gmail.com"])
  }),
  ibkaciaphpkbfikgjnjjfbjcdenlciia: Object.freeze({
    Will: Object.freeze(["wisdom.sats89" + "@gmail.com", "lucasalvarezempresa" + "@gmail.com"]),
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  gklblkkcpmbmnnmjclppoldcdbimoafc: Object.freeze({
    Will: Object.freeze(["wisdom.sats89" + "@gmail.com", "lucasalvarezempresa" + "@gmail.com"]),
    "777": Object.freeze(["gabrieg7.1997" + "@gmail.com"]),
    Diogo: Object.freeze(["DiogoLocke" + "@gmail.com"])
  }),
  ocnhopnkhbkgknjhpfcmbihmialpjboj: Object.freeze({
    "777": Object.freeze(["gabrieg7.1997" + "@gmail.com"]),
    Diogo: Object.freeze(["DiogoLocke" + "@gmail.com"])
  }),
  ngjacbpbiegcnfkinikfpdkcplhejael: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  dmenpfckkeafegadpafdndbnhgfmiffb: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"])
  }),
  hbokpkaoocpcecbfgfadoplblcfannke: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"])
  }),
  nicnjmokndbjnpjlikgmnfkihkklobce: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  ikijmkigbfcanidmonpfaihfclefllin: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  ebfndfgcpnomfmbnpfhnghbemgogoehl: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  icbfelnhpolnnlcamcmkadkdkmngdepa: Object.freeze({
    Janderson: Object.freeze(["jandergfx" + "@gmail.com"]),
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  aachjpoooepljhlphhaplfijppgbjdfp: Object.freeze({
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  bioajcjmagbibhnleajecienfednodib: Object.freeze({
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  }),
  njnehniaiehecdplafcbkdhhmjjcojfe: Object.freeze({
    Sam: Object.freeze(["samuelbuenopessoal" + "@gmail.com"]),
    "Gabriel Solano": Object.freeze(["gabrielsolano2002" + "@gmail.com"])
  })
});

function resolveBrowserReadConfigId(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  return BROWSER_READ_RUNTIME_IDS.has(normalizedExtensionId)
    ? CONTENT_SELECTOR_CONFIG_ID
    : normalizedExtensionId;
}

function resolveRecipientListConfigId(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  if (normalizedExtensionId === PIXEL_AI_HUB_CONFIG_ID) {
    return PIXEL_AI_HUB_CONFIG_ID;
  }
  return resolveBrowserReadConfigId(normalizedExtensionId);
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

function getStaticExtensionRecipientTargets(extensionId, recipientKey) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedRecipientKey = String(recipientKey || "").trim().toLowerCase();
  const entry = STATIC_EXTENSION_RECIPIENTS[normalizedExtensionId];

  if (!entry || !normalizedRecipientKey) {
    return null;
  }

  for (const [key, targets] of Object.entries(entry)) {
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

function mergeStaticExtensionRecipients(extensionId, recipients) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const baseRecipients = Array.isArray(recipients) ? [...recipients] : [];
  const entry = STATIC_EXTENSION_RECIPIENTS[normalizedExtensionId];

  if (!entry) {
    return baseRecipients;
  }

  const knownKeys = new Set(baseRecipients.map((item) => String(item?.key || "").trim().toLowerCase()));

  for (const key of Object.keys(entry)) {
    if (!knownKeys.has(key.toLowerCase())) {
      baseRecipients.push({ key, label: key });
    }
  }

  return baseRecipients;
}

function resolveRecipientTargetsWithRuntimeFallback(args) {
  const staticBrowserTargets = getStaticBrowserReadRecipientTargets(args?.extensionId, args?.recipientKey);
  if (staticBrowserTargets?.length) {
    return staticBrowserTargets;
  }

  const staticExtensionTargets = getStaticExtensionRecipientTargets(args?.extensionId, args?.recipientKey);
  if (staticExtensionTargets?.length) {
    return staticExtensionTargets;
  }

  const normalizedExtensionId = String(args?.extensionId || "").trim();
  const mappedExtensionId = resolveBrowserReadConfigId(normalizedExtensionId);

  if (!BROWSER_READ_RUNTIME_IDS.has(normalizedExtensionId) || mappedExtensionId === normalizedExtensionId) {
    return core.resolveRecipientTargets(mapDisplayArgs(args));
  }

  try {
    return core.resolveRecipientTargets(args);
  } catch (runtimeError) {
    try {
      return core.resolveRecipientTargets(mapDisplayArgs(args));
    } catch (_mappedError) {
      throw runtimeError;
    }
  }
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
    return core.createAccessChallenge(args);
  },
  listRecipientsForExtension(extensionId) {
    let recipients = [];

    try {
      recipients = core.listRecipientsForExtension(resolveRecipientListConfigId(extensionId));
    } catch (error) {
      const staticRecipients = mergeStaticExtensionRecipients(extensionId, []);
      if (staticRecipients.length === 0) {
        throw error;
      }
      recipients = staticRecipients;
    }

    return mergeStaticExtensionRecipients(
      extensionId,
      mergeStaticBrowserReadRecipients(extensionId, recipients)
    );
  },
  resolveRecipientEmail(args) {
    return resolveRecipientTargetsWithRuntimeFallback(args)[0];
  },
  resolveRecipientTargets(args) {
    return resolveRecipientTargetsWithRuntimeFallback(args);
  },
  verifyAccessChallenge(args) {
    return core.verifyAccessChallenge(args);
  }
};
