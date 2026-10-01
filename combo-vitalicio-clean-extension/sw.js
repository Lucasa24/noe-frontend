importScripts("combo-auth-session.js");
const comboAuthSessions = createComboAuthSessions(7490);
const CONTENT_KEY = "combo-vitalicio-leandro-ladeira";
const CONTENT_LABEL = "Combo vitalicio";
const BASE_URL = "https://hotmart.com/pt-br/club/";
const BLOCKED_URL = chrome.runtime.getURL("blocked.html");
const RULE_BLOCK_ALL = 7401;
const RULE_LEGACY_ALLOW_COMBO = 7402;
const RULE_LEGACY_ALLOW_MEMBER_AREA = 7403;
const RULE_ALLOW_COMBO_START = 7410;
const RULE_ALLOW_COMBO_COUNT = 14;
const RULE_ALLOW_COMBO_IDS = Array.from(
  { length: RULE_ALLOW_COMBO_COUNT },
  (_, index) => RULE_ALLOW_COMBO_START + index
);
const RULE_ALLOW_OIDC_AUTHORIZE = RULE_ALLOW_COMBO_START + RULE_ALLOW_COMBO_COUNT;
const RULE_ALLOW_COMBO_AUTH_START = RULE_ALLOW_OIDC_AUTHORIZE + 1;
const RULE_ALLOW_COMBO_AUTH_COUNT = 12;
const RULE_ALLOW_COMBO_AUTH_IDS = Array.from(
  { length: RULE_ALLOW_COMBO_AUTH_COUNT },
  (_, index) => RULE_ALLOW_COMBO_AUTH_START + index
);
const RULE_IDS = [
  RULE_BLOCK_ALL,
  RULE_LEGACY_ALLOW_COMBO,
  RULE_LEGACY_ALLOW_MEMBER_AREA,
  ...RULE_ALLOW_COMBO_IDS,
  RULE_ALLOW_OIDC_AUTHORIZE,
  ...RULE_ALLOW_COMBO_AUTH_IDS
];
const ACCESS_MESSAGE = "browser-read:set-content-access";
const AUTH_FLOW_MESSAGE = "combo-vitalicio:auth-flow";
const LOCAL_AUTH_SESSION_RULE_ID = 7490;
const AUTH_HOSTS = new Set([
  "sso.hotmart.com",
  "sso-surrogate.hotmart.com",
  "consumer.hotmart.com"
]);
const COMBO_ALLOWED_PRODUCT_PATHS = new Set([
  "/pt-br/club/light-copy/products/2438760",
  "/pt-br/club/light-copy/products/2617625",
  "/pt-br/club/seu-produto-pronto/products/5982822",
  "/pt-br/club/vendatodosantodianew/products/1006882",
  "/pt-br/club/superads/products/4468950",
  "/pt-br/club/reuniao-da-mandala/products/4502972",
  "/pt-br/club/whatsapp10x/products/4530858",
  "/pt-br/club/stories-10x/products/1817832",
  "/pt-br/club/conversao-10x/products/4530978",
  "/pt-br/club/filosofia-ladeira/products/3799079",
  "/pt-br/club/melhores-palestras-da-mentoria-fluxo/products/4506254",
  "/pt-br/club/crescimento-10x/products/4530992",
  "/pt-br/club/fluxomatic/products/4159619",
  "/pt-br/club/vendatodosantodianew/products/4956523"
]);

const COMBO_ALLOWED_CLUB_SLUGS = new Set([
  "light-copy",
  "seu-produto-pronto",
  "vendatodosantodianew",
  "superads",
  "reuniao-da-mandala",
  "whatsapp10x",
  "stories-10x",
  "conversao-10x",
  "filosofia-ladeira",
  "melhores-palestras-da-mentoria-fluxo",
  "crescimento-10x",
  "fluxomatic"
]);

function normalizeExtensionName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function isAuthorizedBrowserReadSender(sender) {
  const senderId = String(sender?.id || "").trim();
  if (!senderId || !chrome.management?.get) return false;

  try {
    const info = await chrome.management.get(senderId);
    return info?.enabled === true
      && normalizeExtensionName(info.name) === "browser read any site";
  } catch (_) {
    return false;
  }
}

const BLOCK_ALL_RULE = {
  id: RULE_BLOCK_ALL,
  priority: 1,
  action: { type: "block" },
  condition: {
    regexFilter: "^https?://",
    resourceTypes: ["main_frame"]
  }
};

function buildAllowComboRules() {
  return Array.from(COMBO_ALLOWED_PRODUCT_PATHS).map((allowedPath, index) => ({
    id: RULE_ALLOW_COMBO_START + index,
    priority: 100,
    action: { type: "allow" },
    condition: {
      regexFilter: "^https://hotmart\\.com" + allowedPath.replace("/pt-br/", "/[pP][tT]-[bB][rR]/") + "(?:/|\\?|$)",
      resourceTypes: ["main_frame"]
    }
  }));
}


function buildAllowComboAuthRules() {
  return Array.from(COMBO_ALLOWED_CLUB_SLUGS).map((slug, index) => ({
    id: RULE_ALLOW_COMBO_AUTH_START + index,
    priority: 160,
    action: { type: "allow" },
    condition: {
      regexFilter: "^https://hotmart\\.com/[pP][tT]-[bB][rR]/club/" + slug + "/auth/login(?:/|\\?|$)",
      resourceTypes: ["main_frame"]
    }
  }));
}

function isComboAuthEntryUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "hotmart.com") {
      return false;
    }

    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
    for (const slug of COMBO_ALLOWED_CLUB_SLUGS) {
      if (path === "/pt-br/club/" + slug + "/auth/login") {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

const ALLOW_OIDC_AUTHORIZE_RULE = {
  id: RULE_ALLOW_OIDC_AUTHORIZE,
  priority: 150,
  action: { type: "allow" },
  condition: {
    regexFilter: "^https://sso\\.hotmart\\.com/oidc/authorize(?:\\?|$)",
    resourceTypes: ["main_frame"]
  }
};

function isComboOidcAuthorizeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "sso.hotmart.com"
      && url.pathname === "/oidc/authorize";
  } catch (_) {
    return false;
  }
}

function isAllowedComboUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (url.protocol !== "https:" || url.hostname !== "hotmart.com") {
      return false;
    }

    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
    for (const allowedPath of COMBO_ALLOWED_PRODUCT_PATHS) {
      if (path === allowedPath || path.startsWith(allowedPath + "/")) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

function isValidComboAccessPayloadUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
    return url.protocol === "https:"
      && url.hostname === "hotmart.com"
      && (path === "/pt-br/club" || isAllowedComboUrl(url.href));
  } catch (_) {
    return false;
  }
}


function isAuthHostUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    return url.protocol === "https:" && AUTH_HOSTS.has(url.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function findBrowserReadExtension() {
  if (!chrome.management?.getAll) return null;
  const extensions = await chrome.management.getAll();
  return extensions.find((item) => {
    return item?.type === "extension"
      && item?.enabled === true
      && normalizeExtensionName(item.name) === "browser read any site";
  }) || null;
}

async function syncBrowserReadAuthFlow(tabId, active) {
  const browserRead = await findBrowserReadExtension();
  if (!browserRead?.id) return { ok: false, error: "browser_read_not_found" };
  try {
    const response = await chrome.runtime.sendMessage(browserRead.id, {
      type: AUTH_FLOW_MESSAGE,
      active: active === true,
      tabId
    });
    return response || { ok: false, error: "browser_read_no_response" };
  } catch (_) {
    return { ok: false, error: "browser_read_auth_flow_failed" };
  }
}

async function getLocalAuthRule() {
  if (!chrome.declarativeNetRequest?.getSessionRules) return null;
  const rules = await chrome.declarativeNetRequest.getSessionRules().catch(() => []);
  return rules.find((rule) => rule.id === LOCAL_AUTH_SESSION_RULE_ID) || null;
}

async function setLocalAuthTab(tabId, active) {
  return comboAuthSessions.set(tabId, active);
}

async function setAuthFlowForTab(tabId, active) {
  await setLocalAuthTab(tabId, active);
  const result = await syncBrowserReadAuthFlow(tabId, active);
  if (result?.ok !== true) {
    await setLocalAuthTab(tabId, false);
    return { ok: false, error: result?.error || "browser_read_auth_flow_failed" };
  }
  return { ok: true, active: active === true, tabId };
}

async function clearAllAuthFlowTabs() {
  return comboAuthSessions.clear();
}

async function setBadge(text) {
  await chrome.action.setBadgeText({ text }).catch(() => {});
}

async function disableGate(reason = "") {
  await clearAllAuthFlowTabs();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE_IDS,
    addRules: []
  }).catch(() => {});

  await chrome.storage.local.set({
    browserReadApproved: false,
    browserReadApproval: null
  });

  await setBadge("WAIT");
  if (reason) console.log("[Combo vitalicio] aguardando Browser Read:", reason);
}

async function enableGate(payload) {
  if (payload?.contentKey !== CONTENT_KEY || !isValidComboAccessPayloadUrl(payload?.contentUrl || BASE_URL)) {
    throw new Error("invalid_combo_access_payload");
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE_IDS,
    addRules: [
      BLOCK_ALL_RULE,
      ...buildAllowComboRules(),
      ...buildAllowComboAuthRules()
    ]
  });

  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = new Set(rules.map((rule) => rule.id));
  if (!ids.has(RULE_BLOCK_ALL) ||
      RULE_ALLOW_COMBO_IDS.some((ruleId) => !ids.has(ruleId)) ||
      RULE_ALLOW_COMBO_AUTH_IDS.some((ruleId) => !ids.has(ruleId))) {
    throw new Error("combo_network_rules_not_applied");
  }

  await chrome.storage.local.set({
    browserReadApproved: true,
    browserReadApproval: {
      contentKey: CONTENT_KEY,
      contentLabel: String(payload.contentLabel || CONTENT_LABEL),
      contentUrl: BASE_URL,
      recipientKey: String(payload.recipientKey || ""),
      browserReadExtensionId: String(payload.browserReadExtensionId || ""),
      approvedAt: Date.now()
    }
  });

  await setBadge("ON");


}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "combo-autologin:get-tab-id") {
      const tabId = sender?.tab?.id;
      return Number.isInteger(tabId)
        ? { ok: true, tabId }
        : { ok: false, error: "tab_id_unavailable" };
    }

    if (message?.type === "combo-autologin:set-auth-flow") {
      const senderTabId = sender?.tab?.id;
      const requestedTabId = Number(message?.tabId);
      const tabId = Number.isInteger(senderTabId) ? senderTabId : requestedTabId;
      if (!Number.isInteger(tabId)) {
        return { ok: false, error: "tab_id_unavailable" };
      }
      const approval = await chrome.storage.local.get("browserReadApproved");
      const sourceUrl = sender?.tab?.url || sender?.url || "";
      if (!approval.browserReadApproved || !Number.isInteger(senderTabId) ||
          (!isAllowedComboUrl(sourceUrl) && !isComboAuthEntryUrl(sourceUrl) &&
           !(new RegExp(COMBO_AUTH_TRANSIT_REGEX).test(sourceUrl) && await comboAuthSessions.has(tabId)))) {
        return { ok: false, error: "invalid_combo_auth_source" };
      }
      return setAuthFlowForTab(tabId, message.active === true);
    }

    return { ok: false, error: "unsupported_message" };
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!(await isAuthorizedBrowserReadSender(sender))) {
      return { ok: false, error: "unauthorized_browser_read" };
    }

    if (message?.type === "browser-read:prepare-combo-navigation") {
      const data = await chrome.storage.local.get(["browserReadApproved", "browserReadApproval"]);
      if (!data.browserReadApproved || data.browserReadApproval?.browserReadExtensionId !== sender.id ||
          !Number.isInteger(message.tabId) || !isAllowedComboUrl(message.url)) {
        return { ok: false, error: "invalid_combo_navigation" };
      }
      const tab = await chrome.tabs.get(message.tabId);
      const page = new URL(tab.pendingUrl || tab.url);
      if (page.protocol !== "chrome-extension:" || page.hostname !== sender.id || page.pathname !== "/combo-links.html") {
        return { ok: false, error: "invalid_combo_source_tab" };
      }
      await setLocalAuthTab(message.tabId, true);
      return { ok: true };
    }
    if (message?.type !== ACCESS_MESSAGE) {
      return { ok: false, error: "unsupported_message" };
    }

    const payload = message?.payload && typeof message.payload === "object"
      ? message.payload
      : {};

    if (String(payload.browserReadExtensionId || "") !== String(sender.id || "")) {
      return { ok: false, error: "browser_read_identity_mismatch" };
    }

    if (payload.approved === true) {
      await enableGate(payload);
      return { ok: true, approved: true, extensionId: chrome.runtime.id };
    }

    await disableGate("Browser Read ainda nao aprovou ou trocou de conteudo");
    return { ok: true, approved: false, extensionId: chrome.runtime.id };
  })().then(sendResponse).catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return true;
});



chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.status) return;
  const url = String(changeInfo?.url || tab?.pendingUrl || tab?.url || "").trim();
  if (!url) return;

  void (async () => {
    const { browserReadApproved } = await chrome.storage.local.get("browserReadApproved");
    if (browserReadApproved !== true) return;
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (!current || (current.pendingUrl || current.url) !== url) return;

    if (isComboAuthEntryUrl(url)) {
      await setAuthFlowForTab(tabId, true);
      return;
    }

    const authKey = "comboVitalicioAutologinState:" + tabId;
    const authState = (await chrome.storage.local.get(authKey))[authKey];
    if (isAllowedComboUrl(url) && authState?.active && !authState?.submittedSecret) return;
    if ((changeInfo.status === "complete" && !current.pendingUrl && isAllowedComboUrl(url)) ||
        (!isAllowedComboUrl(url) && !new RegExp(COMBO_AUTH_TRANSIT_REGEX).test(url))) {
      await setAuthFlowForTab(tabId, false);
    }
  })().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void setLocalAuthTab(tabId, false).catch(() => {});
  void syncBrowserReadAuthFlow(tabId, false).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  void disableGate("instalacao/atualizacao");
});

chrome.runtime.onStartup.addListener(() => {
  void disableGate("inicio do navegador");
});

chrome.action.onClicked.addListener(async () => {
  const { browserReadApproved } = await chrome.storage.local.get("browserReadApproved");
  if (browserReadApproved !== true) {
    await setBadge("WAIT");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (typeof tab?.id === "number") {
    await chrome.tabs.update(tab.id, { url: BLOCKED_URL }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: BLOCKED_URL }).catch(() => {});
  }
});
