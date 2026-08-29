const AUTH_CONFIG_KEY = "authConfig";
const LOCK_STATE_KEY = "lockState";
const LAST_ACTIVE_TAB_KEY = "lastActiveTabSnapshot";
const SESSION_KEY = "browserSessionId";
const EXTENSION_CONFIG_CACHE_KEY = "extensionConfigCache";
const DEFAULT_WEBHOOK_URL = "https://noe-frontend.vercel.app/api/send-code";
const DEFAULT_WEBHOOK_TOKEN = "b4b7f9f9e7c64f3d9c1a8d2f6e3b7a91";
const BLOCKED_PAGE_PATH = "blocked.html";
const TEMP_DISABLE_BROWSER_LOCK = false;
const EXTENSION_CONFIG_CACHE_SCHEMA_VERSION = 3;
const CONTENT_SELECTOR_EXTENSION_ID = "nicnjmokndbjnpjlikgmnfkihkklobce";
const COURSES_DVD_EXTENSION_ID = "jamchgcokehlhclhjgooeihlhnoblmji";
const COURSES_DVD_ACCESS_URL = `chrome-extension://${COURSES_DVD_EXTENSION_ID}/src/access/access.html`;
const COURSES_DVD_ACCESS_MESSAGE = "browser-read:set-content-access";
const SCOPED_BLOCK_RULE_ID = 9101;
const SCOPED_ALLOW_RULE_ID = 9102;
const ALLOWED_WHILE_LOCKED_ORIGINS = new Set([
  "https://zoom.us",
  "https://us05web.zoom.us"
]);

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapLock("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrapLock("startup");
});

chrome.tabs.onCreated.addListener((tab) => {
  const tabUrl = tab.pendingUrl || tab.url || "";

  void rememberTabSnapshot(tab);

  if (!tabUrl) {
    return;
  }

  void enforceLockedTab(tab.id, tabUrl).catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const tabUrl = changeInfo.url || tab.pendingUrl || tab.url || "";

  if (tab.active) {
    void rememberTabSnapshot(tab);
  }

  if (!tabUrl) {
    return;
  }

  void enforceLockedTab(tabId, tabUrl).catch(() => undefined);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void rememberTabById(activeInfo.tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  void rememberActiveTabFromWindow(windowId);
});

chrome.permissions?.onAdded?.addListener(() => {
  void handleSiteAccessPolicyChange();
});

chrome.permissions?.onRemoved?.addListener(() => {
  void handleSiteAccessPolicyChange();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message?.type === "lock:getState") {
        sendResponse(await getPublicLockState());
        return;
      }

      if (message?.type === "lock:requestSiteAccess") {
        sendResponse(await requestSiteAccessPrompt());
        return;
      }

      if (message?.type === "lock:listRecipients") {
        sendResponse(await listRecipients());
        return;
      }

      if (message?.type === "lock:getExtensionConfig") {
        sendResponse(await getExtensionConfig());
        return;
      }

      if (message?.type === "lock:refreshExtensionConfig") {
        await chrome.storage.local.remove(EXTENSION_CONFIG_CACHE_KEY);
        sendResponse(await getExtensionConfig());
        return;
      }

      if (message?.type === "lock:sendCode") {
        sendResponse(await sendAccessCode(message.contentKey, message.recipientKey));
        return;
      }

      if (message?.type === "lock:submitCode") {
        sendResponse(await verifyAccessCode(message.code));
        return;
      }

      if (message?.type === "lock:createPixCharge") {
        sendResponse(await createPixCharge(message.extensionId, message.recipientKey));
        return;
      }

      if (message?.type === "lock:checkPixStatus") {
        sendResponse(await checkPixStatus(message.transactionId));
        return;
      }

      if (message?.type === "lock:resendCode") {
        const result = await sendAccessCode("");
        sendResponse(result);
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
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Erro inesperado no service worker."
      });
    }
  })();

  return true;
});

async function bootstrapLock(reason) {
  const config = await getAuthConfig();
  const sessionId = await getBrowserSessionId();
  const nextState = {
    unlocked: false,
    createdAt: Date.now(),
    unlockedAt: null,
    restoredTabsAt: null,
    pendingHostAccessOrigin: "",
    pendingHostAccessTabId: null,
    pendingHostAccessUrl: "",
    pendingHostAccessRequestedAt: null,
    reason,
    sessionId,
    extensionId: chrome.runtime.id,
    recipientKey: "",
    contentKey: "",
    allowedContentUrl: "",
    allowedContentOrigin: "",
    allowedContentLabel: "",
    recipientEmail: "",
    maskedRecipientEmail: "",
    challengeToken: "",
    expiresAt: null,
    sendStatus: config.webhookUrl ? "idle" : "not_configured",
    lastError: "",
    lastSentAt: null,
    restorableTabs: []
  };

  await saveLockState(nextState);

  await updateBadge(nextState);
  await enforceLockedBrowser(nextState);
  return nextState;
}

async function getAuthConfig() {
  const data = await chrome.storage.local.get(AUTH_CONFIG_KEY);
  const config = data[AUTH_CONFIG_KEY] || {};
  return {
    webhookUrl: String(config.webhookUrl || DEFAULT_WEBHOOK_URL).trim(),
    webhookToken: String(config.webhookToken || DEFAULT_WEBHOOK_TOKEN).trim()
  };
}

async function getLockState() {
  const data = await chrome.storage.local.get(LOCK_STATE_KEY);
  return data[LOCK_STATE_KEY] || null;
}

async function saveLockState(lockState) {
  await chrome.storage.local.set({ [LOCK_STATE_KEY]: lockState });
}

async function getLastActiveTabSnapshot() {
  const data = await chrome.storage.local.get(LAST_ACTIVE_TAB_KEY);
  return data[LAST_ACTIVE_TAB_KEY] || null;
}

async function saveLastActiveTabSnapshot(snapshot) {
  await chrome.storage.local.set({ [LAST_ACTIVE_TAB_KEY]: snapshot });
}

async function handleSiteAccessPolicyChange() {
  const state = await ensureCurrentLockState("site_access_change");
  const siteAccessGranted = await hasRequiredSiteAccess();
  const config = await getAuthConfig();

  if (!state) {
    return;
  }

  if (!siteAccessGranted) {
    const relockedState = buildSiteAccessLockedState(state, config);
    await saveLockState(relockedState);
    await updateBadge(relockedState);
    await enforceLockedBrowser(relockedState);
    return;
  }

  const nextState = clearPendingHostAccessState(state);

  if (nextState !== state) {
    await saveLockState(nextState);
  }

  if (nextState.unlocked) {
    const restoredState = await enforceScopedBrowser(nextState);

    if (restoredState !== nextState) {
      await saveLockState(restoredState);
    }
  } else {
    await enforceLockedBrowser(nextState);
  }

  await updateBadge(nextState);
}

async function hasRequiredSiteAccess() {
  if (!chrome.permissions?.contains) {
    return true;
  }

  try {
    return await chrome.permissions.contains({ origins: ["<all_urls>"] });
  } catch (_error) {
    return true;
  }
}

async function getPublicLockState() {
  const state = await ensureCurrentLockState("startup");
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state) {
    return {
      unlocked: TEMP_DISABLE_BROWSER_LOCK,
      configured: false,
      extensionId: chrome.runtime.id,
      siteAccessGranted,
      tempLockDisabled: TEMP_DISABLE_BROWSER_LOCK
    };
  }

  return toPublicLockState(state, { siteAccessGranted });
}

function toPublicLockState(state, options = {}) {
  const siteAccessGranted = options.siteAccessGranted !== false;
  return {
    unlocked: TEMP_DISABLE_BROWSER_LOCK || (Boolean(state.unlocked) && siteAccessGranted),
    configured: Boolean(state.sendStatus !== "not_configured"),
    recipientEmail: state.maskedRecipientEmail || maskEmail(state.recipientEmail),
    extensionId: state.extensionId,
    expiresAt: state.expiresAt || null,
    sendStatus: state.sendStatus,
    lastError: state.lastError || "",
    siteAccessGranted,
    pendingHostAccessUrl: state.pendingHostAccessUrl || "",
    tempLockDisabled: TEMP_DISABLE_BROWSER_LOCK
  };
}

function buildSiteAccessLockedState(state, config) {
  const clearedState = clearPendingHostAccessState(state || {});

  return {
    ...clearedState,
    unlocked: false,
    unlockedAt: null,
    challengeToken: "",
    expiresAt: null,
    recipientKey: "",
    contentKey: "",
    allowedContentUrl: "",
    allowedContentOrigin: "",
    allowedContentLabel: "",
    recipientEmail: "",
    maskedRecipientEmail: "",
    sendStatus: config?.webhookUrl ? "idle" : "not_configured",
    lastError: "",
    lastSentAt: null
  };
}

async function requestSiteAccessPrompt() {
  const state = await ensureCurrentLockState("site_access_request");
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state) {
    return {
      ok: false,
      error: "Nao foi possivel carregar o estado da extensao."
    };
  }

  if (siteAccessGranted) {
    return {
      ok: true,
      state: toPublicLockState(state, { siteAccessGranted: true }),
      message: "A permissao do site ja esta liberada."
    };
  }

  if (typeof chrome.permissions?.addHostAccessRequest !== "function") {
    return {
      ok: false,
      error: "Este navegador nao suporta o pedido nativo de permissao. Libere manualmente em chrome://extensions.",
      state: toPublicLockState(state, { siteAccessGranted: false })
    };
  }

  const targetUrl = await getSiteAccessTargetUrl(state);

  if (!targetUrl) {
    return {
      ok: false,
      error: "Nao encontrei um site para solicitar permissao agora.",
      state: toPublicLockState(state, { siteAccessGranted: false })
    };
  }

  const pendingState = {
    ...state,
    pendingHostAccessOrigin: getUrlOrigin(targetUrl),
    pendingHostAccessTabId: null,
    pendingHostAccessUrl: targetUrl,
    pendingHostAccessRequestedAt: Date.now()
  };

  await saveLockState(pendingState);

  try {
    const requestTab = await chrome.tabs.create({ url: targetUrl, active: true });
    const nextState = {
      ...pendingState,
      pendingHostAccessTabId: typeof requestTab?.id === "number" ? requestTab.id : null
    };

    await saveLockState(nextState);

    if (typeof requestTab?.id === "number") {
      const confirmedTab = await chrome.tabs.get(requestTab.id).catch(() => null);

      if (!confirmedTab?.id) {
        throw new Error("A aba do pedido foi fechada antes da solicitacao de permissao.");
      }

      await chrome.permissions.addHostAccessRequest({ tabId: requestTab.id });
    }

    return {
      ok: true,
      state: toPublicLockState(nextState, { siteAccessGranted: false }),
      message: 'O navegador exibiu o pedido de acesso. Clique em "Permitir" no menu de extensoes.'
    };
  } catch (error) {
    const clearedState = clearPendingHostAccessState(pendingState);
    await saveLockState(clearedState);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel abrir o pedido de permissao.",
      state: toPublicLockState(clearedState, { siteAccessGranted: false })
    };
  }
}

async function verifyAccessCode(code) {
  const state = await ensureCurrentLockState("startup");
  const config = await getAuthConfig();
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
    if (state) {
      await enforceLockedBrowser(state);
    }

    return {
      ok: false,
      error: getMissingSiteAccessMessage(),
      state: toPublicLockState(state || {}, { siteAccessGranted: false })
    };
  }

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

  if (!isValidSelectedAccessState(state)) {
    return {
      ok: false,
      error: "Escolha novamente o conteudo e o destinatario antes de validar o codigo."
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
      restoredTabsAt: null,
      sendStatus: "used",
      lastError: ""
    };

    await saveLockState(updatedState);
    await updateBadge(updatedState);
    const restoredState = await enforceScopedBrowser(updatedState);

    await saveLockState(restoredState);

    return {
      ok: true,
      state: toPublicLockState(restoredState)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel validar o codigo."
    };
  }
}

async function sendAccessCode(contentKey, recipientKey = "") {
  const config = await getAuthConfig();
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
    const state = await ensureCurrentLockState("manual_request");

    if (state) {
      await enforceLockedBrowser(state);
    }

    return {
      ok: false,
      error: getMissingSiteAccessMessage(),
      state: toPublicLockState(state || {}, { siteAccessGranted: false })
    };
  }

  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de solicitar o codigo."
    };
  }

  let selectedAccess;

  try {
    selectedAccess = await resolveSelectedContentAccess(contentKey, recipientKey);
    await syncCoursesDvdContentAccess(selectedAccess, recipientKey);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel preparar o acesso exclusivo ao conteudo."
    };
  }

  const baseState = await ensureCurrentLockState("manual_request");
  const nextState = {
    ...baseState,
    unlocked: false,
    unlockedAt: null,
    reason: "manual_request",
    recipientKey: String(recipientKey || ""),
    contentKey: String(contentKey || ""),
    allowedContentUrl: selectedAccess.url,
    allowedContentOrigin: selectedAccess.origin,
    allowedContentLabel: selectedAccess.label,
    sendStatus: "pending",
    lastError: ""
  };

  await saveLockState(nextState);
  await updateBadge(nextState);

  const updatedState = await requestAccessCode(nextState, config);

  return {
    ok: updatedState.sendStatus === "sent",
    state: toPublicLockState(updatedState),
    error: updatedState.sendStatus === "failed" ? (updatedState.lastError || "send_failed") : ""
  };
}

async function createPixCharge(extensionId, recipientKey) {
  const config = await getAuthConfig();

  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de gerar a cobranca PIX."
    };
  }

  try {
    const pixChargeUrl = buildSiblingApiUrl(config.webhookUrl, "pix-charge");
    const response = await postJson(pixChargeUrl, {
      extensionId: String(extensionId || chrome.runtime.id || ""),
      recipientKey: String(recipientKey || "")
    }, config.webhookToken);

    if (!response.ok) {
      return {
        ok: false,
        error: mapServerError(response.error)
      };
    }

    if (!response.transactionId || !response.qrCode || !response.qrCodeBase64) {
      return {
        ok: false,
        error: "Resposta invalida ao gerar cobranca PIX."
      };
    }

    return {
      ok: true,
      transactionId: String(response.transactionId),
      qrCode: String(response.qrCode),
      qrCodeBase64: normalizePixImageSource(response.qrCodeBase64)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel gerar a cobranca PIX."
    };
  }
}

async function resolveSelectedContentAccess(contentKey, recipientKey) {
  const normalizedContentKey = String(contentKey || "").trim();
  const normalizedRecipientKey = String(recipientKey || "").trim();
  const configResult = await getExtensionConfig();

  if (!configResult?.ok) {
    throw new Error(configResult?.error || "Nao foi possivel carregar os conteudos autorizados.");
  }

  const contents = Array.isArray(configResult.config?.accessContents)
    ? configResult.config.accessContents
    : [];
  const content = contents.find((item) => item.key === normalizedContentKey);
  const recipientAllowed = Array.isArray(content?.recipients)
    && content.recipients.some((item) => item.key === normalizedRecipientKey);

  if (!content?.available || !recipientAllowed) {
    throw new Error("Este destinatario nao esta autorizado para o conteudo escolhido.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(String(content.url || "").trim());
  } catch (_error) {
    throw new Error("O dominio deste conteudo nao foi configurado corretamente.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("O dominio deste conteudo nao e valido para navegacao.");
  }

  return {
    key: normalizedContentKey,
    label: String(content.label || normalizedContentKey),
    url: parsedUrl.href,
    origin: parsedUrl.origin
  };
}

async function syncCoursesDvdContentAccess(selectedAccess, recipientKey) {
  try {
    const response = await chrome.runtime.sendMessage(COURSES_DVD_EXTENSION_ID, {
      type: COURSES_DVD_ACCESS_MESSAGE,
      payload: {
        contentKey: selectedAccess.key,
        contentLabel: selectedAccess.label,
        contentUrl: selectedAccess.url,
        recipientKey: String(recipientKey || "").trim()
      }
    });

    if (response?.ok !== true) {
      throw new Error(response?.error || "courses_dvd_sync_failed");
    }
  } catch (_error) {
    throw new Error("Atualize e mantenha ativa a extensao Cursos DVD para liberar este conteudo.");
  }
}

async function getExtensionConfig() {
  const configuredAuth = await getAuthConfig();
  let result = await requestRemoteExtensionConfig(configuredAuth);

  if (!result.ok && isContentSelectorExtension() && !isDefaultAuthConfig(configuredAuth)) {
    const defaultAuth = getDefaultAuthConfig();
    const fallbackResult = await requestRemoteExtensionConfig(defaultAuth);

    if (fallbackResult.ok) {
      await chrome.storage.local.set({ [AUTH_CONFIG_KEY]: defaultAuth });
      result = {
        ...fallbackResult,
        source: "default_recovery"
      };
    } else {
      result = fallbackResult;
    }
  }

  if (!result.ok) {
    return getCachedExtensionConfig(result.error);
  }

  await saveExtensionConfigCache(result.config);
  return result;
}

async function requestRemoteExtensionConfig(config) {
  if (!config?.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de carregar a configuracao da extensao."
    };
  }

  try {
    const extensionConfigUrl = buildSiblingApiUrl(config.webhookUrl, "extension-config");
    const response = await postJson(extensionConfigUrl, {
      extensionId: chrome.runtime.id
    }, config.webhookToken);

    if (!response.ok || !response.config) {
      return {
        ok: false,
        error: mapServerError(response.error)
      };
    }

    const normalizedConfig = normalizeExtensionConfig(response.config);

    if (isContentSelectorExtension() && !hasValidContentSelectorConfig(normalizedConfig)) {
      return {
        ok: false,
        error: "A configuração de conteúdos ou destinatários está incompleta no servidor."
      };
    }

    return {
      ok: true,
      source: "remote",
      config: normalizedConfig
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel carregar a configuracao da extensao."
    };
  }
}

function getDefaultAuthConfig() {
  return {
    webhookUrl: DEFAULT_WEBHOOK_URL,
    webhookToken: DEFAULT_WEBHOOK_TOKEN
  };
}

function isDefaultAuthConfig(config) {
  const defaultConfig = getDefaultAuthConfig();
  return config?.webhookUrl === defaultConfig.webhookUrl
    && config?.webhookToken === defaultConfig.webhookToken;
}

function isContentSelectorExtension() {
  return chrome.runtime.id === CONTENT_SELECTOR_EXTENSION_ID;
}

async function checkPixStatus(transactionId) {
  const config = await getAuthConfig();

  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de consultar o PIX."
    };
  }

  try {
    const pixStatusUrl = buildSiblingApiUrl(config.webhookUrl, "pix-status");
    const response = await postJson(pixStatusUrl, {
      transactionId: String(transactionId || "")
    }, config.webhookToken);

    if (!response.ok) {
      return {
        ok: false,
        error: mapServerError(response.error)
      };
    }

    return {
      ok: true,
      status: normalizePixStatus(response.status)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel consultar o status do PIX."
    };
  }
}

async function requestAccessCode(state, config) {
  try {
    const response = await postJson(config.webhookUrl, {
      extensionId: state.extensionId,
      reason: state.reason,
      recipientKey: state.recipientKey || "",
      contentKey: state.contentKey || ""
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

    const storage = await chrome.storage.local.get("localActivityMap");
    const localActivityMap = storage.localActivityMap || {};
    localActivityMap[state.recipientKey || ""] = new Date().toISOString();
    await chrome.storage.local.set({ localActivityMap });

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

async function listRecipients() {
  const config = await getAuthConfig();
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
    const state = await ensureCurrentLockState("site_access_required");

    if (state) {
      await enforceLockedBrowser(state);
    }

    return {
      ok: false,
      error: getMissingSiteAccessMessage()
    };
  }

  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configure o webhook antes de listar os destinatarios."
    };
  }

  try {
    const recipientsUrl = buildSiblingApiUrl(config.webhookUrl, "recipients");
    const response = await postJson(recipientsUrl, {
      extensionId: chrome.runtime.id
    }, config.webhookToken);

    if (!response.ok) {
      return {
        ok: false,
        error: mapServerError(response.error)
      };
    }

    const storage = await chrome.storage.local.get("localActivityMap");
    const localActivityMap = storage.localActivityMap || {};
    const baseRecipients = Array.isArray(response.recipients) ? response.recipients : [];

    const mergedRecipients = baseRecipients.map((r) => {
      let mergedLastSentAt = r.lastSentAt;
      const localSentAt = localActivityMap[r.key];

      if (localSentAt) {
        if (!mergedLastSentAt || new Date(localSentAt) > new Date(mergedLastSentAt)) {
          mergedLastSentAt = localSentAt;
        }
      }

      return {
        ...r,
        lastSentAt: mergedLastSentAt
      };
    });

    return {
      ok: true,
      recipients: mergedRecipients
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel carregar os destinatarios."
    };
  }
}

async function getCachedExtensionConfig(errorMessage) {
  const data = await chrome.storage.local.get(EXTENSION_CONFIG_CACHE_KEY).catch(() => ({}));
  const cachedEntry = data[EXTENSION_CONFIG_CACHE_KEY] || null;
  const cachedConfig = cachedEntry?.schemaVersion === EXTENSION_CONFIG_CACHE_SCHEMA_VERSION
    ? cachedEntry.config
    : null;

  if (cachedConfig) {
    const normalizedConfig = normalizeExtensionConfig(cachedConfig);

    if (isContentSelectorExtension() && !hasValidContentSelectorConfig(normalizedConfig)) {
      return {
        ok: false,
        error: errorMessage || "O cache de conteúdos e destinatários está desatualizado."
      };
    }

    return {
      ok: true,
      source: "cache",
      error: errorMessage,
      config: normalizedConfig
    };
  }

  return {
    ok: false,
    error: errorMessage || "Nao foi possivel carregar a configuracao da extensao."
  };
}

async function saveExtensionConfigCache(config) {
  await chrome.storage.local.set({
    [EXTENSION_CONFIG_CACHE_KEY]: {
      config,
      schemaVersion: EXTENSION_CONFIG_CACHE_SCHEMA_VERSION,
      cachedAt: Date.now()
    }
  });
}

function hasValidContentSelectorConfig(config) {
  const contents = Array.isArray(config?.accessContents) ? config.accessContents : [];

  if (contents.length === 0) {
    return false;
  }

  return contents.every((content) => {
    if (content?.available !== true) {
      return true;
    }

    return Array.isArray(content.recipients) && content.recipients.length > 0;
  });
}

async function ensureCurrentLockState(reason) {
  const [state, sessionId] = await Promise.all([
    getLockState(),
    getBrowserSessionId()
  ]);

  if (!state || state.sessionId !== sessionId) {
    return bootstrapLock(reason);
  }

  return state;
}

async function enforceLockedBrowser(state) {
  if (TEMP_DISABLE_BROWSER_LOCK) {
    return;
  }

  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state) {
    return;
  }

  if (state.unlocked && siteAccessGranted) {
    await enforceScopedBrowser(state);
    return;
  }

  await clearScopedNetworkRules();

  const blockedUrl = getBlockedPageUrl();
  const tabs = await chrome.tabs.query({});
  let blockedTab = tabs.find((tab) => isBlockedPageUrl(tab.pendingUrl || tab.url || ""));
  const preferredRestoreTabId = await getPreferredRestoreTabId(tabs, blockedTab?.id);
  const restorableTabs = captureRestorableTabs(tabs, blockedTab?.id, preferredRestoreTabId, state);

  if (!blockedTab) {
    blockedTab = await chrome.tabs.create({ url: blockedUrl, active: true });
  } else if (blockedTab.id) {
    const currentBlockedUrl = blockedTab.pendingUrl || blockedTab.url || "";

    if (!blockedTab.active) {
      await chrome.tabs.update(blockedTab.id, { active: true }).catch(() => undefined);
    }

    if (!isBlockedPageUrl(currentBlockedUrl)) {
      await chrome.tabs.update(blockedTab.id, { url: blockedUrl }).catch(() => undefined);
    }
  }

  if (restorableTabs.length > 0) {
    const nextState = {
      ...state,
      restorableTabs
    };

    await saveLockState(nextState);
  }

  // Enquanto o Browser Read estiver bloqueado, a tela de bloqueio deve ser a
  // unica aba disponivel. A unica excecao e a aba temporaria usada pelo
  // proprio navegador para conceder a permissao de acesso ao site.
  const tabsToClose = tabs
    .filter((tab) => {
      if (typeof tab.id !== "number" || tab.id === blockedTab?.id) {
        return false;
      }

      return !isPendingHostAccessTab(tab, state);
    })
    .map((tab) => tab.id);

  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose).catch(() => undefined);
  }
}

async function enforceLockedTab(tabId, tabUrl) {
  if (TEMP_DISABLE_BROWSER_LOCK) {
    return;
  }

  if (typeof tabId !== "number") {
    return;
  }

  const state = await ensureCurrentLockState("startup");
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state) {
    return;
  }

  if (state.unlocked && siteAccessGranted) {
    if (!isAllowedAfterUnlock(tabUrl, state)) {
      await chrome.tabs.update(tabId, { url: COURSES_DVD_ACCESS_URL, active: true }).catch(() => undefined);
    }
    return;
  }

  if (isAllowedWhileLocked(tabUrl, state, { id: tabId })) {
    return;
  }

  const blockedTab = await findBlockedTab();

  if (blockedTab?.id && blockedTab.id !== tabId) {
    await chrome.tabs.remove(tabId).catch(() => undefined);
    await chrome.tabs.update(blockedTab.id, { active: true }).catch(() => undefined);
    return;
  }

  await chrome.tabs.update(tabId, { url: getBlockedPageUrl(), active: true }).catch(() => undefined);
}

async function findBlockedTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => isBlockedPageUrl(tab.pendingUrl || tab.url || "")) || null;
}

async function getPreferredRestoreTabId(tabs, blockedTabId) {
  const preferredFromSnapshot = await findPreferredTabFromSnapshot(tabs, blockedTabId);

  if (typeof preferredFromSnapshot === "number") {
    return preferredFromSnapshot;
  }

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    const focusedTab = Array.isArray(lastFocusedWindow?.tabs)
      ? lastFocusedWindow.tabs.find((tab) => {
        const url = String(tab.pendingUrl || tab.url || "").trim();
        return typeof tab.id === "number"
          && tab.id !== blockedTabId
          && Boolean(tab.active)
          && url
          && !isAllowedWhileLocked(url);
      })
      : null;

    if (typeof focusedTab?.id === "number") {
      return focusedTab.id;
    }
  } catch (_error) {
    // Fallback below uses the tabs query result.
  }

  const activeTab = tabs.find((tab) => {
    const url = String(tab.pendingUrl || tab.url || "").trim();
    return typeof tab.id === "number"
      && tab.id !== blockedTabId
      && Boolean(tab.active)
      && url
      && !isAllowedWhileLocked(url);
  });

  return typeof activeTab?.id === "number" ? activeTab.id : null;
}

async function findPreferredTabFromSnapshot(tabs, blockedTabId) {
  const snapshot = await getLastActiveTabSnapshot();

  if (!snapshot?.url) {
    return null;
  }

  const candidates = tabs.filter((tab) => {
    const url = String(tab.pendingUrl || tab.url || "").trim();
    return typeof tab.id === "number"
      && tab.id !== blockedTabId
      && normalizeUrl(url) === normalizeUrl(snapshot.url)
      && !isAllowedWhileLocked(url);
  });

  if (candidates.length === 0) {
    return null;
  }

  const rankedCandidates = [...candidates].sort((left, right) => {
    return scoreRestoreCandidate(right, snapshot) - scoreRestoreCandidate(left, snapshot);
  });

  return rankedCandidates[0]?.id ?? null;
}

function scoreRestoreCandidate(tab, snapshot) {
  let score = 0;

  if ((tab.title || "") === (snapshot.title || "")) {
    score += 100;
  }

  if (Boolean(tab.pinned) === Boolean(snapshot.pinned)) {
    score += 10;
  }

  if (typeof tab.index === "number" && typeof snapshot.index === "number") {
    score += Math.max(0, 5 - Math.min(5, Math.abs(tab.index - snapshot.index)));
  }

  if (tab.active) {
    score += 1;
  }

  return score;
}

async function rememberTabById(tabId) {
  if (typeof tabId !== "number") {
    return;
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);

  if (!tab) {
    return;
  }

  await rememberTabSnapshot(tab);
}

async function rememberActiveTabFromWindow(windowId) {
  if (typeof windowId !== "number") {
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
  const activeTab = Array.isArray(tabs) ? tabs[0] : null;

  if (!activeTab) {
    return;
  }

  await rememberTabSnapshot(activeTab);
}

async function rememberTabSnapshot(tab) {
  const snapshot = buildTabSnapshot(tab);

  if (!snapshot) {
    return;
  }

  await saveLastActiveTabSnapshot(snapshot);
}

function buildTabSnapshot(tab) {
  const url = String(tab?.pendingUrl || tab?.url || "").trim();

  if (!url || isAllowedWhileLocked(url)) {
    return null;
  }

  return {
    url,
    title: String(tab.title || ""),
    pinned: Boolean(tab.pinned),
    index: typeof tab.index === "number" ? tab.index : null,
    recordedAt: Date.now()
  };
}

function captureRestorableTabs(tabs, blockedTabId, preferredRestoreTabId, state) {
  return tabs.reduce((result, tab) => {
    if (typeof tab.id !== "number" || tab.id === blockedTabId) {
      return result;
    }

    const url = String(tab.pendingUrl || tab.url || "").trim();

    if (!url || isAllowedWhileLocked(url, state, tab)) {
      return result;
    }

    result.push({
      url,
      pinned: Boolean(tab.pinned),
      active: Boolean(tab.active),
      preferred: tab.id === preferredRestoreTabId
    });
    return result;
  }, []);
}

async function restoreTabsAfterUnlock(state) {
  const restorableTabs = Array.isArray(state?.restorableTabs)
    ? state.restorableTabs.filter((tab) => tab && typeof tab.url === "string" && tab.url.trim())
    : [];

  if (restorableTabs.length === 0) {
    return state;
  }

  const blockedTab = await findBlockedTab();
  let activeAssigned = false;
  let restoredCount = 0;
  let targetTabId = null;

  for (let index = 0; index < restorableTabs.length; index += 1) {
    const tab = restorableTabs[index];
    const shouldActivate = !activeAssigned && (tab.preferred || tab.active || index === 0);
    const createProperties = {
      url: tab.url,
      pinned: Boolean(tab.pinned),
      active: shouldActivate,
      index
    };

    if (typeof blockedTab?.windowId === "number") {
      createProperties.windowId = blockedTab.windowId;
    }

    try {
      const createdTab = await chrome.tabs.create(createProperties);
      activeAssigned = activeAssigned || shouldActivate;
      restoredCount += 1;

      if (shouldActivate && typeof createdTab?.id === "number") {
        targetTabId = createdTab.id;
      }
    } catch (_error) {
      // Ignore tabs that Chrome refuses to recreate.
    }
  }

  if (restoredCount === 0) {
    return state;
  }

  if (typeof blockedTab?.id === "number") {
    await chrome.tabs.remove(blockedTab.id).catch(() => undefined);
  }

  if (typeof blockedTab?.windowId === "number") {
    await chrome.windows.update(blockedTab.windowId, { focused: true }).catch(() => undefined);
  }

  if (typeof targetTabId === "number") {
    await chrome.tabs.update(targetTabId, { active: true }).catch(() => undefined);
  }

  return {
    ...state,
    restorableTabs: [],
    restoredTabsAt: Date.now()
  };
}

async function enforceScopedBrowser(state) {
  if (!isValidSelectedAccessState(state)) {
    const config = await getAuthConfig();
    const relockedState = buildSiteAccessLockedState(state, config);
    await saveLockState(relockedState);
    await updateBadge(relockedState);
    await enforceLockedBrowser(relockedState);
    return relockedState;
  }

  try {
    await configureScopedNetworkRules(state);
  } catch (_error) {
    const config = await getAuthConfig();
    const relockedState = buildSiteAccessLockedState(state, config);
    await saveLockState(relockedState);
    await updateBadge(relockedState);
    await enforceLockedBrowser(relockedState);
    return relockedState;
  }

  const tabs = await chrome.tabs.query({});

  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number") {
      return;
    }

    const url = tab.pendingUrl || tab.url || "";

    if (isAllowedAfterUnlock(url, state)) {
      return;
    }

    await chrome.tabs.update(tab.id, {
      url: COURSES_DVD_ACCESS_URL
    }).catch(() => undefined);
  }));

  return {
    ...state,
    restorableTabs: [],
    restoredTabsAt: Date.now()
  };
}

function getBlockedPageUrl() {
  return chrome.runtime.getURL(BLOCKED_PAGE_PATH);
}

function isBlockedPageUrl(url) {
  return normalizeUrl(url) === normalizeUrl(getBlockedPageUrl());
}

async function clearScopedNetworkRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [SCOPED_BLOCK_RULE_ID, SCOPED_ALLOW_RULE_ID]
  });
}

async function configureScopedNetworkRules(state) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    throw new Error("dynamic_network_rules_unavailable");
  }

  const escapedOrigin = String(state.allowedContentOrigin || "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!escapedOrigin) {
    throw new Error("allowed_origin_missing");
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [SCOPED_BLOCK_RULE_ID, SCOPED_ALLOW_RULE_ID],
    addRules: [
      {
        id: SCOPED_BLOCK_RULE_ID,
        priority: 1,
        action: { type: "block" },
        condition: {
          regexFilter: "^https?://",
          resourceTypes: ["main_frame"]
        }
      },
      {
        id: SCOPED_ALLOW_RULE_ID,
        priority: 100,
        action: { type: "allow" },
        condition: {
          regexFilter: `^${escapedOrigin}/`,
          resourceTypes: ["main_frame"]
        }
      }
    ]
  });

  const activeRuleIds = new Set(
    (await chrome.declarativeNetRequest.getDynamicRules()).map((rule) => rule.id)
  );

  if (!activeRuleIds.has(SCOPED_BLOCK_RULE_ID) || !activeRuleIds.has(SCOPED_ALLOW_RULE_ID)) {
    throw new Error("scoped_network_rules_not_applied");
  }
}

function isCoursesDvdAccessUrl(url) {
  return normalizeUrl(url) === normalizeUrl(COURSES_DVD_ACCESS_URL);
}

function isValidSelectedAccessState(state) {
  const allowedUrl = String(state?.allowedContentUrl || "").trim();
  const allowedOrigin = String(state?.allowedContentOrigin || "").trim();

  return Boolean(
    state?.contentKey
    && state?.recipientKey
    && allowedUrl
    && allowedOrigin
    && getUrlOrigin(allowedUrl) === allowedOrigin
  );
}

function isAllowedAfterUnlock(url, state) {
  if (isCoursesDvdAccessUrl(url)) {
    return true;
  }

  if (!isValidSelectedAccessState(state)) {
    return false;
  }

  return getUrlOrigin(url) === state.allowedContentOrigin;
}

function isAllowedWhileLocked(url, state = null, tab = null) {
  const normalizedUrl = normalizeUrl(url);

  if (isPendingHostAccessTab(tab, state)) {
    return true;
  }

  if (!normalizedUrl) {
    return false;
  }

  return normalizedUrl === normalizeUrl(getBlockedPageUrl())
    || isPendingHostAccessUrl(normalizedUrl, state)
    || isAllowedWhileLockedOrigin(normalizedUrl);
}

function isAllowedWhileLockedOrigin(url) {
  return ALLOWED_WHILE_LOCKED_ORIGINS.has(getUrlOrigin(url));
}

function isPendingHostAccessTab(tab, state) {
  return typeof tab?.id === "number"
    && typeof state?.pendingHostAccessTabId === "number"
    && tab.id === state.pendingHostAccessTabId;
}

function isPendingHostAccessUrl(url, state) {
  const requestedOrigin = String(state?.pendingHostAccessOrigin || "").trim();

  if (!requestedOrigin) {
    return false;
  }

  return getUrlOrigin(url) === requestedOrigin;
}

function clearPendingHostAccessState(state) {
  if (!state?.pendingHostAccessOrigin && !state?.pendingHostAccessTabId && !state?.pendingHostAccessUrl) {
    return state;
  }

  return {
    ...state,
    pendingHostAccessOrigin: "",
    pendingHostAccessTabId: null,
    pendingHostAccessUrl: "",
    pendingHostAccessRequestedAt: null
  };
}

async function getSiteAccessTargetUrl(state) {
  const pendingUrl = String(state?.pendingHostAccessUrl || "").trim();

  if (pendingUrl && !isAllowedWithoutPendingHostAccess(pendingUrl)) {
    return pendingUrl;
  }

  const snapshot = await getLastActiveTabSnapshot();
  const snapshotUrl = String(snapshot?.url || "").trim();

  if (snapshotUrl) {
    return snapshotUrl;
  }

  const restorableTab = Array.isArray(state?.restorableTabs)
    ? state.restorableTabs.find((tab) => tab && typeof tab.url === "string" && tab.url.trim())
    : null;

  return String(restorableTab?.url || "").trim();
}

function isAllowedWithoutPendingHostAccess(url) {
  const normalizedUrl = normalizeUrl(url);
  return normalizedUrl === normalizeUrl(getBlockedPageUrl())
    || normalizedUrl === normalizeUrl(chrome.runtime.getURL("options.html"))
    || isExtensionsManagerUrl(normalizedUrl)
    || isAllowedWhileLockedOrigin(normalizedUrl);
}

function isExtensionsManagerUrl(url) {
  return /^(chrome|edge):\/\/extensions\/?(?:[?#].*)?$/i.test(String(url || "").trim());
}

function getUrlOrigin(url) {
  try {
    return new URL(String(url || "").trim()).origin;
  } catch (_error) {
    return "";
  }
}

function normalizeUrl(url) {
  return String(url || "").split("#")[0];
}

async function getBrowserSessionId() {
  const data = await chrome.storage.session.get(SESSION_KEY);

  if (data[SESSION_KEY]) {
    return data[SESSION_KEY];
  }

  const sessionId = createSessionId();
  await chrome.storage.session.set({ [SESSION_KEY]: sessionId });
  return sessionId;
}

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function updateBadge(state) {
  let text = "LOCK";
  let color = "#c62828";
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
    text = "SITE";
    color = "#8e24aa";
  } else if (state.unlocked) {
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

function normalizePixStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (!normalizedStatus) {
    return "pending";
  }

  if (["paid", "completed", "approved", "success", "succeeded"].includes(normalizedStatus)) {
    return "paid";
  }

  if (["expired", "canceled", "cancelled"].includes(normalizedStatus)) {
    return "expired";
  }

  return normalizedStatus;
}

function normalizePixImageSource(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("data:")) {
    return normalizedValue;
  }

  return `data:image/png;base64,${normalizedValue}`;
}

function normalizeExtensionConfig(config) {
  const rawConfig = config && typeof config === "object" && !Array.isArray(config) ? config : {};

  return {
    version: Number(rawConfig.version || 1),
    pixEnabled: rawConfig.pixEnabled !== false,
    autoUnlockAfterPaid: rawConfig.autoUnlockAfterPaid === true,
    allowCodeRequestAfterPaid: rawConfig.allowCodeRequestAfterPaid !== false,
    pendingProfiles: normalizePendingProfiles(rawConfig.pendingProfiles),
    accessContents: normalizeAccessContents(rawConfig.accessContents)
  };
}

function normalizeAccessContents(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce((result, item) => {
    const key = String(item?.key || "").trim();
    const label = String(item?.label || "").trim();

    if (!key || !label) {
      return result;
    }

    result.push({
      key,
      label,
      url: String(item?.url || "").trim(),
      available: item?.available === true,
      recipients: normalizeContentRecipients(item?.recipients)
    });
    return result;
  }, []);
}

function normalizeContentRecipients(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce((result, item) => {
    const key = String(item?.key || "").trim();
    const label = String(item?.label || "").trim();

    if (key && label) {
      result.push({ key, label });
    }

    return result;
  }, []);
}

function normalizePendingProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [key, profile]) => {
    const normalizedKey = String(key || "").trim();

    if (!normalizedKey || !profile || typeof profile !== "object" || Array.isArray(profile)) {
      return result;
    }

    result[normalizedKey] = {
      email: String(profile.email || ""),
      renewalDate: String(profile.renewalDate || ""),
      monthlyPrice: String(profile.monthlyPrice || ""),
      chargeAmountCents: Number(profile.chargeAmountCents || 0),
      supportEmail: String(profile.supportEmail || ""),
      supportWhatsApp: String(profile.supportWhatsApp || "")
    };

    return result;
  }, {});
}

function mapServerError(errorCode) {
  switch (errorCode) {
    case "invalid_code":
      return "Codigo invalido.";
    case "code_expired":
      return "O codigo expirou. Solicite um novo codigo.";
    case "extension_not_allowed":
      return "Esta extensao nao esta autorizada no servidor.";
    case "extension_email_not_configured":
      return "Nao existe email configurado para este ID de extensao no servidor.";
    case "recipient_not_selected":
      return "Selecione um destinatario antes de enviar o codigo.";
    case "recipient_not_found":
      return "O destinatario selecionado nao existe no servidor.";
    case "content_not_found":
      return "O conteúdo selecionado não existe no servidor.";
    case "content_unavailable":
      return "Este conteúdo ainda não está liberado para solicitar código.";
    case "authorized_recipient_not_configured":
      return "O destinatário autorizado para este conteúdo ainda não foi configurado no servidor.";
    case "recipient_not_allowed_for_content":
      return "Este destinatário não está autorizado para o conteúdo selecionado.";
    case "invalid_extension_email_map":
      return "O mapa de emails por extensao esta invalido no servidor.";
    case "missing_parameters":
      return "Faltam parametros obrigatorios para concluir a operacao.";
    case "unauthorized":
      return "Token do webhook invalido.";
    case "missing_signing_secret":
      return "O servidor nao foi configurado com a chave de assinatura.";
    case "missing_smtp_config":
      return "O servidor nao foi configurado com SMTP.";
    case "missing_pushinpay_config":
      return "O servidor nao foi configurado com o token da PushinPay.";
    case "pix_charge_failed":
      return "Nao foi possivel gerar a cobranca PIX.";
    case "pix_status_failed":
      return "Nao foi possivel consultar o status do PIX.";
    case "pending_profile_not_found":
      return "Este destinatario nao possui cobranca PIX ativa.";
    case "extension_config_failed":
      return "Nao foi possivel carregar a configuracao da extensao.";
    default:
      return errorCode ? `Erro do servidor: ${errorCode}` : "Falha ao comunicar com o servidor.";
  }
}

function getMissingSiteAccessMessage() {
  return 'Ative "Em todos os sites" nas permissoes da extensao para continuar.';
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
