const { getLatestPayment } = require("../lib/billing-state");
const { listRecipientsForExtension, resolveRecipientEmail } = require("../lib/access-service");
const { getPublicAccessContents } = require("../lib/content-access");

const DEFAULT_EXTENSION_CONFIG = {
  version: 1,
  pixEnabled: true,
  autoUnlockAfterPaid: false,
  allowCodeRequestAfterPaid: true,
  pendingProfiles: {
    "frizoncleiton@gmail.com": {
      email: "frizoncleiton@gmail.com",
      billingKey: "frizoncleiton@gmail.com",
      recurring: true,
      startDate: "2026-08-25",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    },
    "julioccou@gmail.com": {
      email: "julioccou@gmail.com",
      billingKey: "julioccou@gmail.com",
      recurring: true,
      startDate: "2026-08-26",
      monthlyPrice: "R$ 9,00",
      chargeAmountCents: 900,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    },
    "contatopodcastsdenegocios@gmail.com": {
      email: "contatopodcastsdenegocios@gmail.com",
      billingKey: "contatopodcastsdenegocios@gmail.com",
      recurring: true,
      startDate: "2026-08-30",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    },
    "iangabrielcopy@gmail.com": {
      email: "iangabrielcopy@gmail.com",
      billingKey: "iangabrielcopy@gmail.com",
      recurring: true,
      startDate: "2026-08-31",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    },
    "jefersonmorais.jsm@gmail.com": {
      email: "jefersonmorais.jsm@gmail.com",
      billingKey: "jefersonmorais.jsm@gmail.com",
      recurring: true,
      startDate: "2026-08-31",
      monthlyPrice: "R$ 9,00",
      chargeAmountCents: 900,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    },
    "danielenlacueva@gmail.com": {
      email: "danielenlacueva@gmail.com",
      billingKey: "danielenlacueva@gmail.com",
      recurring: true,
      startDate: "2026-08-31",
      monthlyPrice: "R$ 9,00",
      chargeAmountCents: 900,
      supportEmail: "caixa@mentorxlab.com",
      supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
    }
  }
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
      // Ronan: cobrança única agendada para 24/09/2026.
      "Ron*n": {
        email: "ronandeassis3@gmail.com",
        renewalDate: "2026-09-24",
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
      },
      Troy: {
        email: "jonatafernando02@gmail.com",
        recurring: true,
        startDate: "2026-08-23",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  "gklblkkcpmbmnnmjclppoldcdbimoafc": {
    pendingProfiles: {
      Mary: {
        email: "herlegacyspain@gmail.com",
        recurring: true,
        startDate: "2026-08-23",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      // Will: cobrança única agendada para 16/09/2026.
      Will: {
        email: "wisdom.sats89@gmail.com",
        renewalDate: "2026-09-16",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
      Troy: {
        email: "jonatafernando02@gmail.com",
        recurring: true,
        startDate: "2026-08-23",
        monthlyPrice: "R$ 47,00",
        chargeAmountCents: 4700,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
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
      // Ronan: cobrança única agendada para 24/09/2026.
      "Ron*n": {
        email: "ronandeassis3@gmail.com",
        renewalDate: "2026-09-24",
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
      Mary: {
        email: "herlegacyspain@gmail.com",
        recurring: true,
        startDate: "2026-08-23",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      },
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
  // Cobrança mensal de R$ 9,00 para o X.V.
  "ebfndfgcpnomfmbnpfhnghbemgogoehl": {
    pendingProfiles: {
      "X.V": {
        email: "Jpzx2004@proton.me",
        recurring: true,
        startDate: "2026-08-23",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  "kjlkomgkandjgpmecnfnindkkgdjadpe": {
    pendingProfiles: {
      // Will: cobrança única agendada para 16/09/2026.
      Will: {
        email: "wisdom.sats89@gmail.com",
        renewalDate: "2026-09-16",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
  "ibkaciaphpkbfikgjnjjfbjcdenlciia": {
    pendingProfiles: {
      // Will: cobrança única agendada para 16/09/2026.
      Will: {
        email: "wisdom.sats89@gmail.com",
        renewalDate: "2026-09-16",
        monthlyPrice: "R$ 9,00",
        chargeAmountCents: 900,
        supportEmail: "caixa@mentorxlab.com",
        supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
      }
    }
  },
};

const BILLING_TIME_ZONE = "America/Sao_Paulo";

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
      config: await buildPublicExtensionConfig(extensionId)
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      error: error instanceof Error ? error.message : "extension_config_failed"
    });
  }
}

async function buildExtensionConfig(extensionId, today = new Date()) {
  const override = EXTENSION_CONFIG_OVERRIDES[extensionId] || {};
  const config = mergeExtensionConfig(DEFAULT_EXTENSION_CONFIG, override);

  // Depois da quitação, o próximo vencimento passa a ser um mês após ela.
  await Promise.all(Object.entries(config?.pendingProfiles || {}).map(async ([profileKey, profile]) => {
    if (profile && isRecurringProfile(profile)) {
      const latestPayment = await getLatestPayment({ extensionId, billingKey: getBillingKey(profile, profileKey) });
      const dates = resolveRecurrenceDates(profile, latestPayment?.paidAt, today);
      profile.renewalDate = dates.renewalDate;
      profile.nextRenewalDate = dates.nextRenewalDate;
    }
  }));

  return {
    ...config,
    accessContents: getPublicAccessContents(extensionId)
  };
}

async function buildPublicExtensionConfig(extensionId, today = new Date()) {
  const config = await buildExtensionConfig(extensionId, today);
  const pendingProfiles = {};

  for (const [profileKey, profile] of Object.entries(config.pendingProfiles || {})) {
    if (!isChargeDue(profile, today)) continue;
    pendingProfiles[profileKey] = profile;
    addRecipientAliases(pendingProfiles, extensionId, profile);
  }

  return { ...config, pendingProfiles };
}

async function resolvePendingProfile(extensionId, recipientKey) {
  const config = await buildExtensionConfig(extensionId);
  const normalizedRecipientKey = String(recipientKey || "").trim().toLowerCase();
  const pendingProfiles = config.pendingProfiles || {};

  for (const [profileKey, profile] of Object.entries(pendingProfiles)) {
    if (String(profileKey || "").trim().toLowerCase() === normalizedRecipientKey) return withBillingKey(profile, profileKey);
  }

  try {
    const recipientEmail = normalizeEmail(resolveRecipientEmail({ extensionId, recipientKey }));
    for (const [profileKey, profile] of Object.entries(pendingProfiles)) {
      if (normalizeEmail(profile?.email) === recipientEmail) return withBillingKey(profile, profileKey);
    }
  } catch (_error) {
    // A resposta padrão abaixo preserva o erro de perfil inexistente.
  }

  return null;
}

function addRecipientAliases(pendingProfiles, extensionId, profile) {
  const profileEmail = normalizeEmail(profile?.email);
  if (!profileEmail) return;

  try {
    for (const recipient of listRecipientsForExtension(extensionId)) {
      const recipientEmail = normalizeEmail(resolveRecipientEmail({ extensionId, recipientKey: recipient.key }));
      if (recipientEmail === profileEmail) pendingProfiles[recipient.key] = profile;
    }
  } catch (_error) {
    // Sem mapa válido, a chave original continua disponível.
  }
}

function withBillingKey(profile, profileKey) {
  return { ...profile, billingKey: getBillingKey(profile, profileKey) };
}

function getBillingKey(profile, profileKey) {
  return String(profile?.billingKey || profileKey || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Recorrência mensal automática ("somar 1 mês a partir do cadastro").
 * Calcula, a partir do startDate, o vencimento do ciclo de cobrança corrente
 * (o maior vencimento mensal que já chegou) e o próximo vencimento (ciclo +1).
 */
function resolveRecurrenceDates(profile, paidAt = "", today = new Date()) {
  const paymentDate = toBillingDate(paidAt);

  if (paymentDate) {
    const nextDueDate = addMonthsCleaned(paymentDate, 1);
    const followingDueDate = addMonthsCleaned(paymentDate, 2);
    return {
      renewalDate: toDateOnly(nextDueDate),
      nextRenewalDate: toDateOnly(followingDueDate)
    };
  }

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

  // Sem pagamento registrado, vale a data de início. Após pagamento, todos os
  // ciclos seguintes passam a contar a partir da data da quitação.
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

function isChargeDue(profile, today = new Date()) {
  const renewalDate = String(profile?.renewalDate || "").trim();

  if (!renewalDate) {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) {
    return true;
  }

  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BILLING_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(today)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  const billingDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

  return billingDate >= renewalDate;
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

function toBillingDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BILLING_TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue])
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeExtensionConfig(baseConfig, overrideConfig) {
  const basePendingProfiles = baseConfig.pendingProfiles || {};
  const overridePendingProfiles = overrideConfig.pendingProfiles || {};
  return {
    ...baseConfig,
    ...overrideConfig,
    pendingProfiles: Object.fromEntries(
      Object.entries({ ...basePendingProfiles, ...overridePendingProfiles })
        .map(([key, profile]) => [key, { ...profile }])
    )
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
module.exports.buildPublicExtensionConfig = buildPublicExtensionConfig;
module.exports.resolvePendingProfile = resolvePendingProfile;
module.exports.resolveRecurrenceDates = resolveRecurrenceDates;
module.exports.isChargeDue = isChargeDue;
