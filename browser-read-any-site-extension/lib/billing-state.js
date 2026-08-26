const crypto = require("crypto");

const BILLING_PREFIX = "billing-state/v1";

/**
 * Persiste a relação entre um PIX criado e o perfil que será renovado. O
 * registro permite que o webhook/polling confirme o pagamento sem confiar em
 * dados enviados pelo navegador.
 */
async function recordPendingCharge({ transactionId, extensionId, recipientKey, billingKey }) {
  const normalizedTransactionId = String(transactionId || "").trim();
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedRecipientKey = String(recipientKey || "").trim();
  const normalizedBillingKey = String(billingKey || normalizedRecipientKey).trim();

  if (!normalizedTransactionId || !normalizedExtensionId || !normalizedBillingKey || !hasBlobStore()) {
    return null;
  }

  const record = {
    transactionId: normalizedTransactionId,
    extensionId: normalizedExtensionId,
    recipientKey: normalizedRecipientKey,
    billingKey: normalizedBillingKey,
    createdAt: new Date().toISOString()
  };

  const { put } = getBlobClient();
  await put(
    buildChargePath(normalizedTransactionId),
    JSON.stringify(record),
    blobWriteOptions()
  );

  return record;
}

/**
 * Grava o último pagamento confirmado do perfil. A data fica no servidor,
 * portanto a renovação não depende do cache local do navegador.
 */
async function recordPaymentConfirmation(transactionId, paidAt = new Date()) {
  const charge = await getPendingCharge(transactionId);

  if (!charge || !hasBlobStore()) {
    return null;
  }

  const confirmedAt = toIsoTimestamp(paidAt) || new Date().toISOString();
  const record = {
    extensionId: charge.extensionId,
    recipientKey: charge.recipientKey,
    billingKey: charge.billingKey,
    transactionId: charge.transactionId,
    paidAt: confirmedAt
  };

  const { put } = getBlobClient();
  await put(
    buildPaymentPath(charge.extensionId, charge.billingKey),
    JSON.stringify(record),
    blobWriteOptions()
  );

  return record;
}

async function getLatestPayment({ extensionId, billingKey }) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedBillingKey = String(billingKey || "").trim();

  if (!normalizedExtensionId || !normalizedBillingKey || !hasBlobStore()) {
    return null;
  }

  const record = await getJsonAtPath(buildPaymentPath(normalizedExtensionId, normalizedBillingKey));
  const paidAt = toIsoTimestamp(record?.paidAt);

  if (
    !record ||
    record.extensionId !== normalizedExtensionId ||
    record.billingKey !== normalizedBillingKey ||
    !paidAt
  ) {
    return null;
  }

  return {
    ...record,
    paidAt
  };
}

async function getPendingCharge(transactionId) {
  const normalizedTransactionId = String(transactionId || "").trim();

  if (!normalizedTransactionId || !hasBlobStore()) {
    return null;
  }

  const record = await getJsonAtPath(buildChargePath(normalizedTransactionId));

  if (record?.transactionId !== normalizedTransactionId) {
    return null;
  }

  return record;
}

async function getJsonAtPath(pathname) {
  const { list } = getBlobClient();
  const { blobs = [] } = await list({ prefix: pathname });
  const blob = blobs.find((item) => item.pathname === pathname);

  if (!blob) {
    return null;
  }

  const response = await fetch(blob.url, { cache: "no-store" });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function blobWriteOptions() {
  return {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  };
}

function hasBlobStore() {
  return [
    process.env.BLOB_READ_WRITE_TOKEN,
    process.env.BLOB_STORE_ID,
    process.env.VERCEL_OIDC_TOKEN
  ].some((value) => Boolean(String(value || "").trim()));
}

function getBlobClient() {
  return require("@vercel/blob");
}

function buildChargePath(transactionId) {
  return `${BILLING_PREFIX}/charges/${hashValue(transactionId)}.json`;
}

function buildPaymentPath(extensionId, billingKey) {
  return `${BILLING_PREFIX}/payments/${hashValue(extensionId)}/${hashValue(billingKey)}.json`;
}

function hashValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest("hex");
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

module.exports = {
  buildChargePath,
  buildPaymentPath,
  getLatestPayment,
  isBillingStorageAvailable: hasBlobStore,
  recordPaymentConfirmation,
  recordPendingCharge,
  toIsoTimestamp
};
