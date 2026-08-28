const { listRecipientsForExtension } = require("./access-service");

// Mantém a ordem da tela de acesso: o conteúdo adicionado mais recentemente fica no topo.
const CONTENT_SELECTOR_EXTENSION_IDS = new Set([
  "nicnjmokndbjnpjlikgmnfkihkklobce"
]);

const ACCESS_CONTENTS = [
  {
    key: "comunidade-growth-hackers",
    label: "Comunidade Growth Hackers",
    url: "https://comunidadegrowthhackers.cademi.com.br/",
    allowedRecipientNames: ["andre"]
  },
  {
    key: "dtc-viral-lab",
    label: "DTC VIRAL LAB",
    // Para liberar, inclua aqui o nome do destinatário já cadastrado no servidor.
    allowedRecipientNames: []
  },
  {
    key: "dtc-experience",
    label: "DTC EXPERIENCE",
    // O nome também precisa existir em EXTENSION_EMAIL_MAP no ambiente da Vercel.
    allowedRecipientNames: []
  }
];

function isContentSelectorEnabled(extensionId) {
  return CONTENT_SELECTOR_EXTENSION_IDS.has(String(extensionId || "").trim());
}

function getPublicAccessContents(extensionId) {
  if (!isContentSelectorEnabled(extensionId)) {
    return [];
  }

  return ACCESS_CONTENTS.map(({ key, label, url, allowedRecipientNames }) => ({
    key,
    label,
    url: url || "",
    available: allowedRecipientNames.length > 0
  }));
}

function resolveContentRecipientKey({ extensionId, contentKey }) {
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

  const allowedNames = new Set(content.allowedRecipientNames.map(normalizeName));
  const recipient = listRecipientsForExtension(extensionId)
    .find((item) => allowedNames.has(normalizeName(item.key)));

  if (!recipient?.key) {
    throw createError("authorized_recipient_not_configured", 500);
  }

  return recipient.key;
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
  getPublicAccessContents,
  isContentSelectorEnabled,
  resolveContentRecipientKey
};
