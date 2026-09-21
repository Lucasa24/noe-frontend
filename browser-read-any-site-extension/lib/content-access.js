const { listRecipientsForExtension } = require("./access-service");

const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const PIXEL_AI_HUB_CONFIG_ID = "aachjpoooepljhlphhaplfijppgbjdfp";
const CONTENT_SELECTOR_EXTENSION_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  PIXEL_AI_HUB_CONFIG_ID,
  "hbokpkaoocpcecbfgfadoplblcfannke",
  "njnehniaiehecdplafcbkdhhmjjcojfe"
]);

const ACCESS_CONTENTS = [
  { key: "claude-code-architect", label: "Claude Code Architect", url: "https://hotmart.com/pt-br/club/aisac-foundation/", allowedRecipientNames: ["Deivis", "LGA", "~ Solicitar Ativação com Adm"] },
  { key: "academy-pass", label: "Academy Pass", url: "https://app.academypass.ai/", allowedRecipientNames: ["Hugo", "Janderson", "~ Solicitar Ativação com Adm"] },
  { key: "pixel-ai-hub", label: "PIXEL AI HUB", url: "https://app.pixeleducacao.com.br/", allowedRecipientNames: ["Davidson", "Deivis", "Vitor", "LGA", "~ Solicitar Ativação com Adm"] },
  { key: "comunidade-growth-hackers", label: "Comunidade Growth Hackers", url: "https://comunidadegrowthhackers.cademi.com.br/", allowedRecipientNames: ["andre", "~ Solicitar Ativação com Adm"] },
  { key: "dtc-viral-lab", label: "DTC VIRAL LAB", allowedRecipientNames: ["João", "Igor", "Wesley", "~ Solicitar Ativação com Adm"] },
  { key: "dtc-experience", label: "DTC EXPERIENCE", allowedRecipientNames: ["João", "Igor", "Wesley", "~ Solicitar Ativação com Adm"] }
];

function isContentSelectorEnabled(extensionId) {
  return CONTENT_SELECTOR_EXTENSION_IDS.has(String(extensionId || "").trim());
}

function getContentSelectorConfigId(extensionId, contentKey = "") {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedContentKey = String(contentKey || "").trim();

  if (!isContentSelectorEnabled(normalizedExtensionId)) {
    return normalizedExtensionId;
  }

  if (normalizedContentKey === "pixel-ai-hub") {
    return PIXEL_AI_HUB_CONFIG_ID;
  }

  return CONTENT_SELECTOR_CONFIG_ID;
}

function getPublicAccessContents(extensionId) {
  if (!isContentSelectorEnabled(extensionId)) return [];
  return ACCESS_CONTENTS.map(({ key, label, url, allowedRecipientNames }) => {
    const recipients = getAllowedRecipients(extensionId, key, allowedRecipientNames);
    return { key, label, url: url || "", available: recipients.length > 0, recipients: recipients.map(({ key: recipientKey, label: recipientLabel }) => ({ key: recipientKey, label: recipientLabel })) };
  });
}

function resolveContentRecipientKey({ extensionId, contentKey, recipientKey }) {
  if (!isContentSelectorEnabled(extensionId)) return "";
  const content = ACCESS_CONTENTS.find((item) => item.key === String(contentKey || "").trim());
  if (!content) throw createError("content_not_found", 400);
  if (content.allowedRecipientNames.length === 0) throw createError("content_unavailable", 403);
  const recipients = getAllowedRecipients(extensionId, content.key, content.allowedRecipientNames);
  const requestedRecipientKey = normalizeName(recipientKey);
  const recipient = requestedRecipientKey ? recipients.find((item) => normalizeName(item.key) === requestedRecipientKey) : recipients[0];
  if (!recipient?.key) {
    if (requestedRecipientKey) throw createError("recipient_not_allowed_for_content", 403);
    throw createError("authorized_recipient_not_configured", 500);
  }
  return recipient.key;
}

function getAllowedRecipients(extensionId, contentKey, allowedRecipientNames) {
  const allowed = (Array.isArray(allowedRecipientNames) ? allowedRecipientNames : [])
    .map((name, index) => ({ normalized: normalizeName(name), index }))
    .filter((item) => item.normalized);
  if (allowed.length === 0) return [];

  const allowedNames = new Map(allowed.map((item) => [item.normalized, item.index]));
  const configExtensionId = getContentSelectorConfigId(extensionId, contentKey);

  return listRecipientsForExtension(configExtensionId)
    .filter((item) => allowedNames.has(normalizeName(item.key)))
    .sort((a, b) => {
      const aIndex = allowedNames.get(normalizeName(a.key)) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = allowedNames.get(normalizeName(b.key)) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
}

function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { getContentSelectorConfigId, getPublicAccessContents, isContentSelectorEnabled, resolveContentRecipientKey };
