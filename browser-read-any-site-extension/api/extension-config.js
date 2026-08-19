const DEFAULT_EXTENSION_CONFIG = {
  version: 1,
  pixEnabled: true,
  autoUnlockAfterPaid: false,
  allowCodeRequestAfterPaid: true,
  pendingProfiles: {}
};

const EXTENSION_CONFIG_OVERRIDES = {
  // Cobrança específica da extensão em que o destinatário Agent existe.
  // Agent: cobrança cancelada (imediata) e reprogramada para 18/09/2026 (hoje + 1 mês).
  "jncbkkimmoapjemleedmklnlgiioiffj": {
    pendingProfiles: {
      Agent: {
        email: "internetmoneyxtratosferic@gmail.com",
        renewalDate: "2026-09-18",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Pedro: cobrança agendada para 16/09. A gestão de data no pix-charge.js
      // impede a cobrança antes do renewalDate (2026-09-16).
      Pedro: {
        email: "bragapeedro@gmail.com",
        renewalDate: "2026-09-16",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Gabriel: mensalidade R$ 47,00 com recorrência automática (somar 1 mês).
      Gabriel: {
        email: "gabrielazevedomkt@gmail.com",
        recurring: true,
        startDate: "2026-08-17",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Janderson: mensalidade R$ 9,00 com recorrência automática (somar 1 mês).
      Janderson: {
        email: "jandergfx@gmail.com",
        recurring: true,
        startDate: "2026-08-18",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  // Cobrança de R$ 47,00 para os destinatários Jen e Andressa, nas duas extensões
  // em que existem no mapa de destinatários (PLANO DVD 3.1 e Verificação
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
      },
      Andressa: {
        email: "andressamichaelsen16@gmail.com",
        renewalDate: "2026-08-16",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Gabriel: mensalidade R$ 47,00 com recorrência automática (somar 1 mês).
      Gabriel: {
        email: "gabrielazevedomkt@gmail.com",
        recurring: true,
        startDate: "2026-08-17",
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
      },
      Andressa: {
        email: "andressamichaelsen16@gmail.com",
        renewalDate: "2026-08-16",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Gabriel: mensalidade R$ 47,00 com recorrência automática (somar 1 mês).
      Gabriel: {
        email: "gabrielazevedomkt@gmail.com",
        recurring: true,
        startDate: "2026-08-17",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  // Cobrança de R$ 9,00 para o Leônidas na extensão COMUNIDADE LENDÁRIA 2026.
  // Leônidas: cobrança cancelada (recorrência removida) e reprogramada para
  // 19/09/2026 (hoje 19/08 + 1 mês).
  "dmenpfckkeafegadpafdndbnhgfmiffb": {
    pendingProfiles: {
      Leônidas: {
        email: "leonidascaldeira15@gmail.com",
        renewalDate: "2026-09-19",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  // Cobrança mensal de R$ 9,00 para o Michel na extensão ASIMOV.
  // Michel: recorrência automática mensal, primeira cobrança em 21/08/2026.
  "ngjacbpbiegcnfkinikfpdkcplhejael": {
    pendingProfiles: {
      Michel: {
        email: "dicasdomarketing@gmail.com",
        recurring: true,
        startDate: "2026-08-21",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
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
  const config = mergeExtensionConfig(DEFAULT_EXTENSION_CONFIG, override);

  // Materializa as datas dinâmicas dos perfis com recorrência mensal.
  for (const profile of Object.values(config?.pendingProfiles || {})) {
    if (profile && isRecurringProfile(profile)) {
      const dates = resolveRecurrenceDates(profile);
      profile.renewalDate = dates.renewalDate;
      profile.nextRenewalDate = dates.nextRenewalDate;
    }
  }

  return config;
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

/**
 * Recorrência mensal automática ("somar 1 mês a partir do cadastro").
 * Calcula, a partir do startDate, o vencimento do ciclo de cobrança corrente
 * (o maior vencimento mensal que já chegou) e o próximo vencimento (ciclo +1).
 */
function resolveRecurrenceDates(profile, today = new Date()) {
  const startDate = String(profile?.startDate || "").trim();

  if (!startDate) {
    return { renewalDate: "", nextRenewalDate: "" };
  }

  const start = new Date(startDate + "T00:00:00");
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  if (Number.isNaN(start.getTime())) {
    return { renewalDate: "", nextRenewalDate: "" };
  }

  // Quantos ciclos mensais completos desde o cadastro (até hoje).
  let cyclesElapsed = 0;

  while (true) {
    const nextCycleDate = addMonthsCleaned(startDate, cyclesElapsed + 1);

    if (nextCycleDate.getTime() > todayStart.getTime()) {
      break;
    }

    cyclesElapsed += 1;
  }

  const currentDueDate = addMonthsCleaned(startDate, cyclesElapsed);
  const nextDueDate = addMonthsCleaned(startDate, cyclesElapsed + 1);

  return {
    renewalDate: toDateOnly(currentDueDate),
    nextRenewalDate: toDateOnly(nextDueDate)
  };
}

function isRecurringProfile(profile) {
  return Boolean(profile && profile.recurring === true);
}

function addMonthsCleaned(dateStr, months) {
  const date = new Date(dateStr + "T00:00:00");
  const originalDay = date.getDate();

  date.setDate(1);
  date.setMonth(date.getMonth() + months);

  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return date;
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
module.exports.resolveRecurrenceDates = resolveRecurrenceDates;
