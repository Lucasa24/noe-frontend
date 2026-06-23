const crypto = require("crypto");

const DEFAULT_TTL_MINUTES = 10;
const EXTENSION_DISPLAY_NAMES = {
  kdiclmpfoijaodmpobpfnakglkpclijl: "comunidade invictus",
  kjclfjfidoohlndnjldcbcjomjlcgicd: "Formacao pre vendas diamond",
  njnehniaiehecdplafcbkdhhmjjcojfe: "academy pass",
  dmenpfckkeafegadpafdndbnhgfmiffb: "COMUNIDADE LENDÁRIA 2026"
};

function createAccessChallenge({ extensionId, recipientEmail, reason }) {
  assertSigningSecret();
  assertAllowedExtension(extensionId);

  const code = generateAccessCode();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + getCodeTtlMinutes() * 60 * 1000;

  const payload = {
    codeHash: sha256(code),
    expiresAt,
    extensionId,
    issuedAt,
    nonce: crypto.randomUUID(),
    reason: String(reason || "startup"),
    recipientEmail: String(recipientEmail || "").trim().toLowerCase()
  };

  return {
    code,
    expiresAt,
    challengeToken: signPayload(payload),
    maskedEmail: maskEmail(payload.recipientEmail)
  };
}

function resolveRecipientEmail({ extensionId, fallbackEmail, recipientKey }) {
  const recipients = resolveRecipientTargets({ extensionId, fallbackEmail, recipientKey });
  return recipients[0];
}

function resolveRecipientTargets({ extensionId, fallbackEmail, recipientKey }) {
  const mapping = getExtensionEmailMap();
  const normalizedExtensionId = String(extensionId || "").trim();
  const entry = mapping[normalizedExtensionId];

  if (entry) {
    if (typeof entry === "string") {
      const recipients = normalizeRecipientList(entry);

      if (recipients.length > 0) {
        return recipients;
      }

      throw createError("extension_email_not_configured", 400);
    }

    if (typeof entry === "object" && !Array.isArray(entry)) {
      const normalizedRecipientKey = String(recipientKey || "").trim();
      const keys = Object.keys(entry).filter((key) => normalizeRecipientList(entry[key]).length > 0);

      if (normalizedRecipientKey) {
        const recipients = normalizeRecipientList(entry[normalizedRecipientKey]);

        if (recipients.length > 0) {
          return recipients;
        }

        throw createError("recipient_not_found", 400);
      }

      if (keys.length === 1) {
        return normalizeRecipientList(entry[keys[0]]);
      }

      throw createError("recipient_not_selected", 400);
    }

    throw createError("invalid_extension_email_map", 500);
  }

  const fallbackRecipients = normalizeRecipientList(fallbackEmail);

  if (fallbackRecipients.length > 0) {
    return fallbackRecipients;
  }

  throw createError("extension_email_not_configured", 400);
}

function listRecipientsForExtension(extensionId) {
  const normalizedExtensionId = String(extensionId || "").trim();
  assertAllowedExtension(normalizedExtensionId);

  const mapping = getExtensionEmailMap();
  const entry = mapping[normalizedExtensionId];

  if (!entry) {
    throw createError("extension_email_not_configured", 400);
  }
