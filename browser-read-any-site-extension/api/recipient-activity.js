const crypto = require("crypto");

const ACTIVITY_PREFIX = "recipient-activity/v1";

/**
 * Armazena um arquivo por destinatário. Assim, dois envios simultâneos para
 * pessoas diferentes não sobrescrevem a atividade um do outro.
 *
 * O caminho usa um hash para não expor nomes de destinatários na URL pública
 * do Blob. O conteúdo é acessado apenas pelo backend autenticado.
 */
async function recordRecipientActivity({ extensionId, recipientKey, sentAt = new Date() }) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedRecipientKey = String(recipientKey || "").trim();

  if (!normalizedExtensionId || !normalizedRecipientKey || !hasBlobStore()) {
    return null;
  }

  const recordedAt = toIsoTimestamp(sentAt);
  const { put } = getBlobClient();

  await put(
    buildActivityPath(normalizedExtensionId, normalizedRecipientKey),
    JSON.stringify({
      extensionId: normalizedExtensionId,
      recipientKey: normalizedRecipientKey,
      lastSentAt: recordedAt
    }),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0
    }
  );

  return recordedAt;
}

/**
 * Retorna apenas a atividade dos destinatários solicitados. Caso o Blob ainda
 * não esteja configurado, a lista continua funcionando sem atividade prévia.
 */
async function getRecipientActivity(extensionId, recipientKeys) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedKeys = Array.from(new Set(
    (Array.isArray(recipientKeys) ? recipientKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  ));

  if (!normalizedExtensionId || normalizedKeys.length === 0 || !hasBlobStore()) {
    return {};
  }

  const expectedPaths = new Map(
    normalizedKeys.map((key) => [
      buildActivityPath(normalizedExtensionId, key),
      key
    ])
  );
  const { list } = getBlobClient();
  const { blobs = [] } = await list({
    prefix: `${ACTIVITY_PREFIX}/${hashValue(normalizedExtensionId)}/`
  });
  const activity = {};

  await Promise.all(blobs
    .filter((blob) => expectedPaths.has(blob.pathname))
    .map(async (blob) => {
      try {
        const response = await fetch(blob.url, { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const record = await response.json();
        const recipientKey = expectedPaths.get(blob.pathname);
        const lastSentAt = toIsoTimestamp(record?.lastSentAt);

        if (
          record?.extensionId === normalizedExtensionId &&
          record?.recipientKey === recipientKey &&
          lastSentAt
        ) {
          activity[recipientKey] = lastSentAt;
        }
      } catch (error) {
        console.error("recipient_activity_read_failed", error instanceof Error ? error.message : String(error));
      }
    }));

  return activity;
}

function hasBlobStore() {
  return Boolean(String(process.env.BLOB_READ_WRITE_TOKEN || "").trim());
}

function getBlobClient() {
  // Carregamento tardio permite que a extensão continue operando localmente
  // antes da configuração do Blob na Vercel.
  return require("@vercel/blob");
}

function buildActivityPath(extensionId, recipientKey) {
  return `${ACTIVITY_PREFIX}/${hashValue(extensionId)}/${hashValue(recipientKey)}.json`;
}

function hashValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest("hex");
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  const milliseconds = date.getTime();

  return Number.isFinite(milliseconds) ? date.toISOString() : "";
}

module.exports = {
  buildActivityPath,
  getRecipientActivity,
  recordRecipientActivity,
  toIsoTimestamp
};
