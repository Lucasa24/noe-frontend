const DEFAULT_EXTENSION_CONFIG = {
  version: 1,
  pixEnabled: true,
  autoUnlockAfterPaid: false,
  allowCodeRequestAfterPaid: true,
  pendingProfiles: {
    Agent: {
      email: "internetmoneyxtratosferic@gmail.com",
      renewalDate: "2026-07-25",
      monthlyPrice: "R$ 9,00",
      chargeAmountCents: 900,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    }
  }
};

const EXTENSION_CONFIG_OVERRIDES = {
  // Exemplo:
  // "jncbkkimmoapjemleedmklnlgiioiffj": {
  //   pendingProfiles: {}
  // }
};

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
    const extensionId = String(body.extensionId || "").trim();

    if (!extensionId) {
      res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
      return;
    }

    res.status(200).json({
      ok: true,
      extensionId,
      config: buildExtensionConfig(extensionId)
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      error: error instanceof Error ? error.message : "extension_config_failed"
    });
  }
};

function buildExtensionConfig(extensionId) {
  const override = EXTENSION_CONFIG_OVERRIDES[extensionId] || {};
  return mergeExtensionConfig(DEFAULT_EXTENSION_CONFIG, override);
}

function mergeExtensionConfig(baseConfig, overrideConfig) {
  return {
    ...baseConfig,
    ...overrideConfig,
    pendingProfiles: {
      ...(baseConfig.pendingProfiles || {}),
      ...(overrideConfig.pendingProfiles || {})
    }
  };
}

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
