const { Pool } = require("pg");

let pool;
let schemaReadyPromise;

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

  if (!normalizedTransactionId || !normalizedExtensionId || !normalizedBillingKey || !hasBillingDatabase()) {
    return null;
  }

  const record = {
    transactionId: normalizedTransactionId,
    extensionId: normalizedExtensionId,
    recipientKey: normalizedRecipientKey,
    billingKey: normalizedBillingKey,
    createdAt: new Date().toISOString()
  };

  await ensureBillingSchema();
  await getPool().query(
    `
      insert into public.extension_billing_charges (
        transaction_id,
        extension_id,
        recipient_key,
        billing_key,
        created_at
      )
      values ($1, $2, $3, $4, $5)
      on conflict (transaction_id) do update
        set extension_id = excluded.extension_id,
            recipient_key = excluded.recipient_key,
            billing_key = excluded.billing_key,
            created_at = excluded.created_at
    `,
    [
      record.transactionId,
      record.extensionId,
      record.recipientKey,
      record.billingKey,
      record.createdAt
    ]
  );

  return record;
}

/**
 * Grava o último pagamento confirmado do perfil. A data fica no servidor,
 * portanto a renovação não depende do cache local do navegador.
 */
async function recordPaymentConfirmation(transactionId, paidAt = new Date()) {
  const charge = await getPendingCharge(transactionId);

  if (!charge || !hasBillingDatabase()) {
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

  await ensureBillingSchema();
  await getPool().query(
    `
      insert into public.extension_billing_payments (
        extension_id,
        billing_key,
        recipient_key,
        transaction_id,
        paid_at
      )
      values ($1, $2, $3, $4, $5)
      on conflict (extension_id, billing_key) do update
        set recipient_key = excluded.recipient_key,
            transaction_id = excluded.transaction_id,
            paid_at = excluded.paid_at
    `,
    [
      record.extensionId,
      record.billingKey,
      record.recipientKey,
      record.transactionId,
      record.paidAt
    ]
  );

  return record;
}

async function getLatestPayment({ extensionId, billingKey }) {
  const normalizedExtensionId = String(extensionId || "").trim();
  const normalizedBillingKey = String(billingKey || "").trim();

  if (!normalizedExtensionId || !normalizedBillingKey || !hasBillingDatabase()) {
    return null;
  }

  await ensureBillingSchema();
  const result = await getPool().query(
    `
      select
        extension_id as "extensionId",
        recipient_key as "recipientKey",
        billing_key as "billingKey",
        transaction_id as "transactionId",
        paid_at as "paidAt"
      from public.extension_billing_payments
      where extension_id = $1 and billing_key = $2
      limit 1
    `,
    [normalizedExtensionId, normalizedBillingKey]
  );
  const record = result.rows[0] || null;
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

  if (!normalizedTransactionId || !hasBillingDatabase()) {
    return null;
  }

  await ensureBillingSchema();
  const result = await getPool().query(
    `
      select
        transaction_id as "transactionId",
        extension_id as "extensionId",
        recipient_key as "recipientKey",
        billing_key as "billingKey",
        created_at as "createdAt"
      from public.extension_billing_charges
      where transaction_id = $1
      limit 1
    `,
    [normalizedTransactionId]
  );
  const record = result.rows[0] || null;

  return record?.transactionId === normalizedTransactionId ? record : null;
}

function hasBillingDatabase() {
  return Boolean(getBillingDatabaseUrl());
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = sanitizeDatabaseUrl(getBillingDatabaseUrl());

  if (!connectionString) {
    throw new Error("billing_database_unavailable");
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000
  });

  return pool;
}

function getBillingDatabaseUrl() {
  return String(
    process.env.BILLING_DATABASE_URL || process.env.DATABASE_URL || ""
  ).trim();
}

function sanitizeDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslrootcert");
    return url.toString();
  } catch (_error) {
    return raw;
  }
}

async function ensureBillingSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = Promise.all([
      getPool().query(`
        create table if not exists public.extension_billing_charges (
          transaction_id text primary key,
          extension_id text not null,
          recipient_key text not null,
          billing_key text not null,
          created_at timestamptz not null default now()
        )
      `),
      getPool().query(`
        create table if not exists public.extension_billing_payments (
          extension_id text not null,
          billing_key text not null,
          recipient_key text not null,
          transaction_id text not null,
          paid_at timestamptz not null,
          primary key (extension_id, billing_key)
        )
      `)
    ]).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

module.exports = {
  getLatestPayment,
  isBillingStorageAvailable: hasBillingDatabase,
  recordPaymentConfirmation,
  recordPendingCharge,
  toIsoTimestamp
};
