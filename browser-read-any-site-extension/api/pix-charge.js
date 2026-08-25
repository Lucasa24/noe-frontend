const { isChargeDue, resolvePendingProfile } = require("./extension-config");

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
    return;
  }

  try {
    assertAuthorized(req);

    const body = normalizeBody(req.body);
    const { extensionId, recipientKey } = body;

    if (!extensionId || !recipientKey) {
      const error = new Error("missing_parameters");
      error.statusCode = 400;
      throw error;
    }

    const pendingProfile = resolvePendingProfile(extensionId, recipientKey);
    const chargeAmountCents = Number(pendingProfile?.chargeAmountCents || 0);

    if (!pendingProfile || !Number.isFinite(chargeAmountCents) || chargeAmountCents <= 0) {
      const error = new Error("pending_profile_not_found");
      error.statusCode = 400;
      throw error;
    }

    // Só cobra a partir da data marcada no fuso de São Paulo.
    if (!isChargeDue(pendingProfile)) {
      const error = new Error("charge_not_due_yet");
      error.statusCode = 400;
      throw error;
    }

    const pushinPayToken = process.env.PUSHINPAY_TOKEN;
    if (!pushinPayToken) {
      const error = new Error("missing_pushinpay_config");
      error.statusCode = 500;
      throw error;
    }

    const response = await fetch("https://api.pushinpay.com.br/api/pix/cashIn", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pushinPayToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ value: chargeAmountCents })
    });

    if (!response.ok) {
      throw new Error("pix_charge_failed");
    }

    const data = await response.json();

    res.status(200).json({
      ok: true,
      transactionId: data.id,
      qrCode: data.qr_code,
      qrCodeBase64: data.qr_code_base64
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      error: error instanceof Error ? error.message : "pix_charge_failed"
    });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function assertAuthorized(req) {
  const expectedToken = process.env.WEBHOOK_TOKEN || "";
  const providedToken = getBearerToken(req);

  if (expectedToken && providedToken !== expectedToken) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }

  return body;
}
