const { listRecipientsForExtension } = require("./access-service");

const CONTENT_SELECTOR_CONFIG_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const PIXEL_AI_HUB_CONFIG_ID = "aachjpoooepljhlphhaplfijppgbjdfp";
const COMBO_BROWSER_READ_RUNTIME_ID = "miipjameglmiodjjgghegcidmkiefmlg";
const CONTENT_SELECTOR_EXTENSION_IDS = new Set([
  CONTENT_SELECTOR_CONFIG_ID,
  "nfnpblbakohfcnkngbimljiehklmdcmk",
  PIXEL_AI_HUB_CONFIG_ID,
  "hbokpkaoocpcecbfgfadoplblcfannke",
  "njnehniaiehecdplafcbkdhhmjjcojfe",
  COMBO_BROWSER_READ_RUNTIME_ID
]);

const ACCESS_CONTENTS = [
  { key: "claude-code-architect", label: "Claude Code Architect", url: "https://hotmart.com/pt-br/club/aisac-foundation/", allowedRecipientNames: ["Deivis", "LGA", "Janderson", "~ Solicitar Ativação com Adm", "Lira", "Moisés", "Daniel Lins", "Jonatas Gomes", "John"] },
  { key: "academy-pass", label: "Academy Pass", url: "https://app.academypass.ai/", allowedRecipientNames: ["Hugo", "Janderson", "~ Solicitar Ativação com Adm", "Sam", "Gabriel Solano", "Lira", "Moisés", "Jonatas Gomes", "Solano", "John"] },
  {
    key: "pixel-ai-hub",
    label: "PIXEL AI HUB",
    url: "https://app.pixeleducacao.com.br/",
    urls: [
      "https://hotmart.com/pt-br/club/pixel-educacao",
      "https://checklist.pixeleducacao.com.br/",
      "https://app.pixeleducacao.com.br/"
    ],
    allowedRecipientNames: ["Davidson", "Janderson", "Nathan", "LGA", "André", "Deivis", "Vitor", "Leila", "adspc7", "~ Solicitar Ativação com Adm", "Sam", "Gabriel Solano", "Lira", "Moisés", "Daniel Lins", "Solano", "John"]
  },
  { key: "comunidade-growth-hackers", label: "Comunidade Growth Hackers", url: "https://comunidadegrowthhackers.cademi.com.br/", allowedRecipientNames: ["andre", "Janderson", "~ Solicitar Ativação com Adm", "Sam", "Moisés", "Daniel Lins", "John"] },
  { key: "combo-vitalicio-leandro-ladeira", label: "COMBO VITALICIO", url: "https://hotmart.com/pt-br/club/", allowedRecipientNames: ["Gabriel Solano", "Moisés", "~ Solicitar Ativação com Adm"] },
  { key: "ai-coding", label: "AI CODING", url: "https://app.hub.la/m/vNGHcQ35ONNqWKbIFcEw", allowedRecipientNames: ["~ Solicitar Ativação com Adm", "John"] },
  { key: "edu-led-growth", label: "EDU-LED GROWTH", url: "https://hotmart.com/pt-br/club/full-stack-marketing/", allowedRecipientNames: ["Gabriel Solano", "Moisés", "~ Solicitar Ativação com Adm"] },
  { key: "comunidade-autonext-vibestack", label: "COMUNIDADE AUTONEXT & VIBESTACK", allowedRecipientNames: ["Gabriel Solano", "Daniel Lins", "~ Solicitar Ativação com Adm", "Solano", "John"] },
  { key: "linguagem-secreta-rian-dutra-psicologia-design", label: "Linguagem Secreta", url: "https://mentorxlab.com/linguagem-secreta-rian-dutra-psicologia-design/", allowedRecipientNames: ["Daniel Lins", "Jonatas Gomes"] },
  { key: "mkt360-programa-marketing-360-camila-renaux", label: "MKT360 - Programa Marketing 360° - Camila Renaux", url: "https://mentorxlab.com/mkt360-programa-marketing-360-camila-renaux/", allowedRecipientNames: ["Jonatas Gomes"] },
  { key: "formacao-estrategistas-de-marketing-camila-renaux", label: "Formação Estrategistas de Marketing - Camila Renaux", url: "https://mentorxlab.com/formacao-estrategistas-de-marketing-camila-renaux/", allowedRecipientNames: ["Jonatas Gomes"] },
  { key: "dtc-viral-lab", label: "DTC VIRAL LAB", allowedRecipientNames: ["João", "Igor", "Wesley", "Janderson", "adspc7", "~ Solicitar Ativação com Adm"] },
  { key: "dtc-experience", label: "DTC EXPERIENCE", allowedRecipientNames: ["João", "Igor", "Wesley", "Janderson", "adspc7", "~ Solicitar Ativação com Adm", "Sam", "Daniel Lins"] }
];

const COMBO_BROWSER_READ_CONTENT_KEYS = new Set([
  "combo-vitalicio-leandro-ladeira",
  "ai-coding",
  "edu-led-growth",
  "comunidade-autonext-vibestack"
]);

function getAccessContentsForExtension(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  if (normalizedExtensionId !== COMBO_BROWSER_READ_RUNTIME_ID) return ACCESS_CONTENTS;
  return ACCESS_CONTENTS.filter((item) => COMBO_BROWSER_READ_CONTENT_KEYS.has(item.key));
}

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
  return getAccessContentsForExtension(extensionId).map(({ key, label, url, urls, allowedRecipientNames }) => {
    const recipients = getAllowedRecipients(extensionId, key, allowedRecipientNames);
    return {
      key,
      label,
      url: url || "",
      urls: Array.isArray(urls) ? urls.map((item) => String(item || "").trim()).filter(Boolean) : [],
      available: recipients.length > 0,
      recipients: recipients.map(({ key: recipientKey, label: recipientLabel }) => ({ key: recipientKey, label: recipientLabel }))
    };
  });
}

function resolveContentRecipientKey({ extensionId, contentKey, recipientKey }) {
  if (!isContentSelectorEnabled(extensionId)) return "";
  const content = getAccessContentsForExtension(extensionId).find((item) => item.key === String(contentKey || "").trim());
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