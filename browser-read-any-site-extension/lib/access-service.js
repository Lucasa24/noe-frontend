const crypto = require("crypto");

const DEFAULT_TTL_MINUTES = 10;

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

function resolveRecipientEmail({ extensionId, fallbackEmail }) {
  const mapping = getExtensionEmailMap();
  const normalizedExtensionId = String(extensionId || "").trim();

  if (mapping[normalizedExtensionId]) {
    return String(mapping[normalizedExtensionId]).trim().toLowerCase();
  }

  const normalizedFallback = String(fallbackEmail || "").trim().toLowerCase();

  if (normalizedFallback) {
    return normalizedFallback;
  }

  throw createError("extension_email_not_configured", 400);
}

function verifyAccessChallenge({ challengeToken, code, extensionId }) {
  assertSigningSecret();

  const payload = verifySignedPayload(challengeToken);
  const normalizedCode = String(code || "").trim();
  const normalizedExtensionId = String(extensionId || "").trim();

  if (!payload?.codeHash) {
    throw createError("invalid_challenge", 400);
  }

  if (payload.expiresAt < Date.now()) {
    throw createError("code_expired", 400);
  }

  if (normalizedExtensionId !== payload.extensionId) {
    throw createError("extension_mismatch", 400);
  }

  if (sha256(normalizedCode) !== payload.codeHash) {
    throw createError("invalid_code", 400);
  }

  return {
    ok: true,
    expiresAt: payload.expiresAt
  };
}

function buildEmailMessage({ code, extensionId, reason, expiresAt }) {
  const expiresAtIso = new Date(expiresAt).toISOString();

  return {
    subject: `Codigo de acesso da extensao ${extensionId}`,
    text: [
      "Seu codigo temporario de acesso foi gerado.",
      "",
      `Codigo: ${code}`,
      `Extensao: ${extensionId}`,
      `Motivo: ${reason}`,
      `Expira em: ${expiresAtIso}`,
      "",
      "Cole este codigo na tela de bloqueio do navegador para liberar a sessao."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 16px;">Codigo temporario de acesso</h2>
        <p>Use o codigo abaixo para liberar o navegador nesta sessao.</p>
        <div style="display: inline-block; padding: 14px 18px; font-size: 28px; font-weight: 700; letter-spacing: 4px; background: #111827; color: #ffffff; border-radius: 12px;">
          ${escapeHtml(code)}
        </div>
        <p style="margin-top: 20px;"><strong>Extensao:</strong> ${escapeHtml(extensionId)}</p>
        <p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
        <p><strong>Expira em:</strong> ${escapeHtml(expiresAtIso)}</p>
        <p style="margin-top: 20px;">Cole este codigo na tela de bloqueio do navegador para liberar a sessao.</p>
      </div>
    `
  };
}

function signPayload(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(token) {
  const normalizedToken = String(token || "").trim();
  const parts = normalizedToken.split(".");

  if (parts.length !== 2) {
    throw createError("invalid_challenge", 400);
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = createSignature(encodedPayload);

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw createError("invalid_signature", 400);
  }

  const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
  return JSON.parse(decoded);
}

function createSignature(encodedPayload) {
  return crypto
    .createHmac("sha256", process.env.SIGNING_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function generateAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getCodeTtlMinutes() {
  const parsed = Number(process.env.CODE_TTL_MINUTES || DEFAULT_TTL_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MINUTES;
}

function assertSigningSecret() {
  if (!process.env.SIGNING_SECRET) {
    throw createError("missing_signing_secret", 500);
  }
}

function assertAllowedExtension(extensionId) {
  const allowList = String(process.env.ALLOWED_EXTENSION_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowList.length === 0) {
    return;
  }

  if (!allowList.includes(String(extensionId || "").trim())) {
    throw createError("extension_not_allowed", 403);
  }
}

function getExtensionEmailMap() {
  const rawValue = String(process.env.EXTENSION_EMAIL_MAP || "").trim();

  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_map_format");
    }

    return parsed;
  } catch (_error) {
    throw createError("invalid_extension_email_map", 500);
  }
}

function maskEmail(email) {
  const normalizedEmail = String(email || "").trim();

  if (!normalizedEmail.includes("@")) {
    return "";
  }

  const [localPart, domain] = normalizedEmail.split("@");
  const safeLocalPart = localPart.length <= 2
    ? `${localPart[0] || "*"}*`
    : `${localPart.slice(0, 2)}***`;

  return `${safeLocalPart}@${domain}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

module.exports = {
  buildEmailMessage,
  createAccessChallenge,
  resolveRecipientEmail,
  verifyAccessChallenge
};
