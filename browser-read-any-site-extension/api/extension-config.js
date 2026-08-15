const DEFAULT_EXTENSION_CONFIG = {
  version: 1,
  pixEnabled: true,
  autoUnlockAfterPaid: false,
  allowCodeRequestAfterPaid: true,
  pendingProfiles: {}
};

const EXTENSION_CONFIG_OVERRIDES = {
  // Cobrança específica da extensão em que o destinatário Agent existe.
  "jncbkkimmoapjemleedmklnlgiioiffj": {
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
  },
  // Cobrança de R$ 47,00 apenas para o destinatário Jen, nas duas extensões
  // em que ela existe no mapa de destinatários (PLANO DVD 3.1 e Verificação
  // de Atualização em Plataformas).
  "ocnhopnkhbkgknjhpfcmbihmialpjboj": {
    pendingProfiles: {
      Jen: {
        email: "jennepherlopes@gmail.com",
        renewalDate: "2026-08-15",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  "gklblkkcpmbmnnmjclppoldcdbimoafc": {
    pendingProfiles: {
      Jen: {
        email: "jennepherlopes@gmail.com",
        renewalDate: "2026-08-15",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
};

async function extensionConfigHandler(req, res) {
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
}

function buildExtensionConfig(extensionId) {
  const override = EXTENSION_CONFIG_OVERRIDES[extensionId] || {};
  return mergeExtensionConfig(DEFAULT_EXTENSION_CONFIG, override);
}

function resolvePendingProfile(extensionId, recipientKey) {
  const config = buildExtensionConfig(extensionId);
  const normalizedRecipientKey = String(recipientKey || "").trim().toLowerCase();
  const pendingProfiles = config.pendingProfiles || {};

  for (const [profileKey, profile] of Object.entries(pendingProfiles)) {
    if (String(profileKey || "").trim().toLowerCase() === normalizedRecipientKey) {
      return profile;
    }
  }

  return null;
}

function mergeExtensionConfig(baseConfig, overrideConfig) {
  const hasPendingProfileOverride = Object.prototype.hasOwnProperty.call(overrideConfig, "pendingProfiles");

  return {
    ...baseConfig,
    ...overrideConfig,
    pendingProfiles: hasPendingProfileOverride
      ? (overrideConfig.pendingProfiles || {})
      : (baseConfig.pendingProfiles || {})
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

module.exports = extensionConfigHandler;
module.exports.buildExtensionConfig = buildExtensionConfig;
module.exports.resolvePendingProfile = resolvePendingProfile;
