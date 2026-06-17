const AUTH_CONFIG_KEY = "authConfig";
const LOCK_STATE_KEY = "lockState";

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapLock("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrapLock("startup");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "lock:getState") {
      sendResponse(await getPublicLockState());
      return;
    }

    if (message?.type === "lock:submitCode") {
      sendResponse(await verifyAccessCode(message.code));
      return;
    }

    if (message?.type === "lock:resendCode") {
      const state = await bootstrapLock("manual_resend");
      sendResponse({
        ok: state.sendStatus === "sent",
        state: toPublicLockState(state)
      });
      return;
    }

    if (message?.type === "lock:openOptions") {
      await chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "lock:getRuntimeInfo") {
      sendResponse({ extensionId: chrome.runtime.id });
      return;
    }

    sendResponse({ ok: false, error: "unsupported_message" });
  })();

  return true;
});

async function bootstrapLock(reason) {
  const config = await getAuthConfig();
  const nextState = {
    unlocked: false,
    createdAt: Date.now(),
    unlockedAt: null,
    reason,
    extensionId: chrome.runtime.id,
    recipientEmail: config.recipientEmail || "",
    maskedRecipientEmail: "",
    challengeToken: "",
    expiresAt: null,
    sendStatus: config.webhookUrl && config.recipientEmail ? "pending" : "not_configured",
    lastError: "",
    lastSentAt: null
  };

  await saveLockState(nextState);

  if (nextState.sendStatus === "pending") {
    return requestAccessCode(nextState, config);
  }

  await updateBadge(nextState);
  return nextState;
}

async function getAuthConfig() {
  const data = await chrome.storage.local.get(AUTH_CONFIG_KEY);
  return data[AUTH_CONFIG_KEY] || {};
}

async function getLockState() {
  const data = await chrome.storage.local.get(LOCK_STATE_KEY);
  return data[LOCK_STATE_KEY] || null;
}

async function saveLockState(lockState) {
  await chrome.storage.local.set({ [LOCK_STATE_KEY]: lockState });
}

async function getPublicLockState() {
  const state = await getLockState();

  if (!state) {
    return {
      unlocked: false,
      configured: false,
      extensionId: chrome.runtime.id
    };
  }

  return toPublicLockState(state);
}

function toPublicLockState(state) {
  return {
    unlocked: Boolean(state.unlocked),
    configured: Boolean(state.recipientEmail),
    recipientEmail: state.maskedRecipientEmail || maskEmail(state.recipientEmail),
    extensionId: state.extensionId,
    expiresAt: state.expiresAt || null,
    sendStatus: state.sendStatus,
    lastError: state.lastError || ""
  };
}

async function verifyAccessCode(code) {
  const state = await getLockState();
  const config = await getAuthConfig();

  if (!state?.challengeToken) {
    return {
      ok: false,
      error: "Nenhum codigo foi gerado ainda."
    };
  }

  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de validar o codigo."
    };
  }

  if (state.expiresAt && Date.now() > state.expiresAt) {
    return {
      ok: false,
      error: "O codigo expirou. Solicite um novo codigo."
    };
  }

  try {
    const verifyUrl = buildSiblingApiUrl(config.webhookUrl, "verify-code");
    const response = await postJson(verifyUrl, {
      challengeToken: state.challengeToken,
      code: String(code || "").trim(),
      extensionId: state.extensionId
    }, config.webhookToken);

    if (!response.ok) {
      return {
        ok: false,
        error: mapServerError(response.error)
      };
    }

    const updatedState = {
      ...state,
      unlocked: true,
      unlockedAt: Date.now(),
      sendStatus: "used",
      lastError: ""
    };

    await saveLockState(updatedState);
    await updateBadge(updatedState);

    return {
      ok: true,
      state: toPublicLockState(updatedState)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel validar o codigo."
    };
  }
}

async function requestAccessCode(state, config) {
  try {
    const response = await postJson(config.webhookUrl, {
      to: config.recipientEmail,
      extensionId: state.extensionId,
      reason: state.reason
    }, config.webhookToken);

    if (!response.ok || !response.challengeToken) {
      throw new Error(mapServerError(response.error));
    }

    const updatedState = {
      ...state,
      challengeToken: response.challengeToken,
      expiresAt: response.expiresAt || null,
      sendStatus: "sent",
      lastSentAt: Date.now(),
      lastError: "",
      recipientEmail: state.recipientEmail,
      maskedRecipientEmail: response.recipientEmail || maskEmail(state.recipientEmail)
    };

    await saveLockState(updatedState);
    await updateBadge(updatedState);
    return updatedState;
  } catch (error) {
    const updatedState = {
      ...state,
      sendStatus: "failed",
      lastError: error instanceof Error ? error.message : String(error)
    };

    await saveLockState(updatedState);
    await updateBadge(updatedState);
    return updatedState;
  }
}

async function updateBadge(state) {
  let text = "LOCK";
  let color = "#c62828";

  if (state.unlocked) {
    text = "OPEN";
    color = "#2e7d32";
  } else if (state.sendStatus === "not_configured") {
    text = "CFG";
    color = "#6d4c41";
  } else if (state.sendStatus === "failed") {
    text = "ERR";
    color = "#ef6c00";
  }

  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function postJson(url, body, token) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = {};
    }
  }

  if (!response.ok && !data.error) {
    throw new Error(`HTTP ${response.status}`);
  }

  return data;
}

function buildSiblingApiUrl(baseUrl, endpointName) {
  const url = new URL(baseUrl);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Webhook invalido.");
  }

  segments[segments.length - 1] = endpointName;
  url.pathname = `/${segments.join("/")}`;
  return url.toString();
}

function mapServerError(errorCode) {
  switch (errorCode) {
    case "invalid_code":
      return "Codigo invalido.";
    case "code_expired":
      return "O codigo expirou. Solicite um novo codigo.";
    case "extension_not_allowed":
      return "Esta extensao nao esta autorizada no servidor.";
    case "unauthorized":
      return "Token do webhook invalido.";
    case "missing_signing_secret":
      return "O servidor nao foi configurado com a chave de assinatura.";
    case "missing_smtp_config":
      return "O servidor nao foi configurado com SMTP.";
    default:
      return errorCode ? `Erro do servidor: ${errorCode}` : "Falha ao comunicar com o servidor.";
  }
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  const [localPart, domain] = email.split("@");
  const safeLocalPart = localPart.length <= 2
    ? `${localPart[0] || "*"}*`
    : `${localPart.slice(0, 2)}***`;

  return `${safeLocalPart}@${domain}`;
}
