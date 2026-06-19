const AUTH_CONFIG_KEY = "authConfig";
const LOCK_STATE_KEY = "lockState";
const LAST_ACTIVE_TAB_KEY = "lastActiveTabSnapshot";
const SESSION_KEY = "browserSessionId";
const DEFAULT_WEBHOOK_URL = "https://noe-frontend.vercel.app/api/send-code";
const DEFAULT_WEBHOOK_TOKEN = "b4b7f9f9e7c64f3d9c1a8d2f6e3b7a91";
const BLOCKED_PAGE_PATH = "blocked.html";

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

  void enforceLockedTab(tab.id, tabUrl);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const tabUrl = changeInfo.url || tab.pendingUrl || tab.url || "";

  if (tab.active) {
    void rememberTabSnapshot(tab);
  }

  if (!tabUrl) {
    return;
  }

  void enforceLockedTab(tabId, tabUrl);
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

    if (message?.type === "lock:sendCode") {
      sendResponse(await sendAccessCode(message.recipientKey));
      return;
    }

    if (message?.type === "lock:submitCode") {
      sendResponse(await verifyAccessCode(message.code));
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
    webhookUrl: config.webhookUrl || DEFAULT_WEBHOOK_URL,
    webhookToken: Object.prototype.hasOwnProperty.call(config, "webhookToken")
      ? config.webhookToken
      : DEFAULT_WEBHOOK_TOKEN
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

  if (!state) {
    return;
  }

  if (!siteAccessGranted) {
    await updateBadge(state);
    await enforceLockedBrowser(state);
    return;
  }

  const nextState = clearPendingHostAccessState(state);

  if (nextState !== state) {
    await saveLockState(nextState);
  }

  if (nextState.unlocked) {
    const restoredState = await restoreTabsAfterUnlock(nextState);

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
      unlocked: false,
      configured: false,
      extensionId: chrome.runtime.id,
      siteAccessGranted
    };
  }

  return toPublicLockState(state, { siteAccessGranted });
}

function toPublicLockState(state, options = {}) {
  const siteAccessGranted = options.siteAccessGranted !== false;
  return {
    unlocked: Boolean(state.unlocked) && siteAccessGranted,
    configured: Boolean(state.sendStatus !== "not_configured"),
    recipientEmail: state.maskedRecipientEmail || maskEmail(state.recipientEmail),
    extensionId: state.extensionId,
    expiresAt: state.expiresAt || null,
    sendStatus: state.sendStatus,
    lastError: state.lastError || "",
    siteAccessGranted,
    pendingHostAccessUrl: state.pendingHostAccessUrl || ""
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

    const restoredState = await restoreTabsAfterUnlock(updatedState);

    if (restoredState !== updatedState) {
      await saveLockState(restoredState);
    }

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

async function sendAccessCode(recipientKey) {
  const config = await getAuthConfig();
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
    const state = await ensureCurrentLockState("manual_request");
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

  const baseState = await ensureCurrentLockState("manual_request");
  const nextState = {
    ...baseState,
    unlocked: false,
    unlockedAt: null,
    reason: "manual_request",
    recipientKey: String(recipientKey || ""),
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

async function requestAccessCode(state, config) {
  try {
    const response = await postJson(config.webhookUrl, {
      extensionId: state.extensionId,
      reason: state.reason,
      recipientKey: state.recipientKey || ""
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

async function listRecipients() {
  const config = await getAuthConfig();
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!siteAccessGranted) {
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

    return {
      ok: true,
      recipients: Array.isArray(response.recipients) ? response.recipients : []
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel carregar os destinatarios."
    };
  }
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
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state || (state.unlocked && siteAccessGranted)) {
    return;
  }

  const blockedUrl = getBlockedPageUrl();
  const tabs = await chrome.tabs.query({});
  let blockedTab = tabs.find((tab) => isBlockedPageUrl(tab.pendingUrl || tab.url || ""));
  const preferredRestoreTabId = await getPreferredRestoreTabId(tabs, blockedTab?.id);
  const restorableTabs = captureRestorableTabs(tabs, blockedTab?.id, preferredRestoreTabId, state);

  if (!blockedTab) {
    blockedTab = await chrome.tabs.create({ url: blockedUrl, active: true });
  } else if (blockedTab.id) {
    await chrome.tabs.update(blockedTab.id, { active: true, url: blockedUrl });
  }

  if (restorableTabs.length > 0) {
    const nextState = {
      ...state,
      restorableTabs
    };

    await saveLockState(nextState);
  }

  const tabsToClose = tabs
    .filter((tab) => {
      if (typeof tab.id !== "number" || tab.id === blockedTab?.id) {
        return false;
      }

      return !isAllowedWhileLocked(tab.pendingUrl || tab.url || "", state);
    })
    .map((tab) => tab.id);

  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
  }
}

async function enforceLockedTab(tabId, tabUrl) {
  if (typeof tabId !== "number") {
    return;
  }

  const state = await ensureCurrentLockState("startup");
  const siteAccessGranted = await hasRequiredSiteAccess();

  if (!state || (state.unlocked && siteAccessGranted)) {
    return;
  }

  if (isAllowedWhileLocked(tabUrl, state)) {
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

    if (!url || isAllowedWhileLocked(url, state)) {
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

function getBlockedPageUrl() {
  return chrome.runtime.getURL(BLOCKED_PAGE_PATH);
}

function isBlockedPageUrl(url) {
  return normalizeUrl(url) === normalizeUrl(getBlockedPageUrl());
}

function isAllowedWhileLocked(url, state = null) {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return false;
  }

  return normalizedUrl === normalizeUrl(getBlockedPageUrl())
    || normalizedUrl === normalizeUrl(chrome.runtime.getURL("options.html"))
    || isExtensionsManagerUrl(normalizedUrl)
    || isPendingHostAccessUrl(normalizedUrl, state);
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
    || isExtensionsManagerUrl(normalizedUrl);
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
    case "invalid_extension_email_map":
      return "O mapa de emails por extensao esta invalido no servidor.";
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
