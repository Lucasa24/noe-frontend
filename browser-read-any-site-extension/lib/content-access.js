const { listRecipientsForExtension } = require("./access-service");

// Mantém a ordem da tela de acesso: o conteúdo adicionado mais recentemente fica no topo.
const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const CONTENT_SELECTOR_EXTENSION_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk"
]);

const ACCESS_CONTENTS = [
  {
    key: "comunidade-growth-hackers",
    label: "Comunidade Growth Hackers",
    url: "https://comunidadegrowthhackers.cademi.com.br/",
    allowedRecipientNames: ["andre", "~ Solicitar Ativação com Adm"]
  },
  {
    key: "dtc-viral-lab",
    label: "DTC VIRAL LAB",
    // Para liberar, inclua aqui o nome do destinatário já cadastrado no servidor.
    allowedRecipientNames: ["João", "Igor", "Wesley", "~ Solicitar Ativação com Adm"]
  },
  {
    key: "dtc-experience",
    label: "DTC EXPERIENCE",
    // O nome também precisa existir em EXTENSION_EMAIL_MAP no ambiente da Vercel.
    allowedRecipientNames: ["João", "Igor", "Wesley", "~ Solicitar Ativação com Adm"]
  }
];

function isContentSelectorEnabled(extensionId) {
  return CONTENT_SELECTOR_EXTENSION_IDS.has(String(extensionId || "").trim());
}

function getContentSelectorConfigId(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  return isContentSelectorEnabled(normalizedExtensionId)
    ? CONTENT_SELECTOR_CONFIG_ID
    : normalizedExtensionId;
}

function getPublicAccessContents(extensionId) {
  if (!isContentSelectorEnabled(extensionId)) {
    return [];
  }

  return ACCESS_CONTENTS.map(({ key, label, url, allowedRecipientNames }) => {
    const recipients = getAllowedRecipients(extensionId, allowedRecipientNames);

    return {
      key,
      label,
      url: url || "",
      available: recipients.length > 0,
      recipients: recipients.map(({ key: recipientKey, label: recipientLabel }) => ({
        key: recipientKey,
        label: recipientLabel
      }))
    };
  });
}

function resolveContentRecipientKey({ extensionId, contentKey, recipientKey }) {
  if (!isContentSelectorEnabled(extensionId)) {
    return "";
  }

  const content = ACCESS_CONTENTS.find((item) => item.key === String(contentKey || "").trim());

  if (!content) {
    throw createError("content_not_found", 400);
  }

  if (content.allowedRecipientNames.length === 0) {
    throw createError("content_unavailable", 403);
  }

  const recipients = getAllowedRecipients(extensionId, content.allowedRecipientNames);
  const requestedRecipientKey = normalizeName(recipientKey);
  const recipient = requestedRecipientKey
    ? recipients.find((item) => normalizeName(item.key) === requestedRecipientKey)
    : recipients[0];

  if (!recipient?.key) {
    if (requestedRecipientKey) {
      throw createError("recipient_not_allowed_for_content", 403);
    }

    throw createError("authorized_recipient_not_configured", 500);
  }

  return recipient.key;
}

function getAllowedRecipients(extensionId, allowedRecipientNames) {
  const allowedNames = new Set((Array.isArray(allowedRecipientNames) ? allowedRecipientNames : [])
    .map(normalizeName)
    .filter(Boolean));

  if (allowedNames.size === 0) {
    return [];
  }

  const configExtensionId = getContentSelectorConfigId(extensionId);

  return listRecipientsForExtension(configExtensionId)
    .filter((item) => allowedNames.has(normalizeName(item.key)));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  getContentSelectorConfigId,
  getPublicAccessContents,
  isContentSelectorEnabled,
  resolveContentRecipientKey
};
