const AUTH_CONFIG_KEY = "authConfig";
const DEFAULT_WEBHOOK_URL = "https://noe-frontend.vercel.app/api/send-code";
const DEFAULT_WEBHOOK_TOKEN = "b4b7f9f9e7c64f3d9c1a8d2f6e3b7a91";

const webhookUrlInput = document.getElementById("webhook-url");
const webhookTokenInput = document.getElementById("webhook-token");
const statusElement = document.getElementById("status");
const extensionIdElement = document.getElementById("extension-id");
const saveButton = document.getElementById("save-config");

void init();

saveButton.addEventListener("click", () => {
  void saveConfig();
});

disableCopy(webhookUrlInput);
disableCopy(webhookTokenInput);

async function init() {
  extensionIdElement.textContent = chrome.runtime.id;

  const stored = await chrome.storage.local.get(AUTH_CONFIG_KEY);
  const config = stored[AUTH_CONFIG_KEY] || {};
  const defaultConfig = {
    webhookUrl: DEFAULT_WEBHOOK_URL,
    webhookToken: DEFAULT_WEBHOOK_TOKEN
  };
  const resolvedConfig = {
    webhookUrl: String(config.webhookUrl || defaultConfig.webhookUrl).trim(),
    webhookToken: String(config.webhookToken || defaultConfig.webhookToken).trim()
  };

  if (!config.webhookUrl && !Object.prototype.hasOwnProperty.call(config, "webhookToken")) {
    await chrome.storage.local.set({ [AUTH_CONFIG_KEY]: resolvedConfig });
  }

  webhookUrlInput.value = resolvedConfig.webhookUrl;
  webhookTokenInput.value = resolvedConfig.webhookToken;
}

async function saveConfig() {
  const payload = {
    webhookUrl: webhookUrlInput.value.trim(),
    webhookToken: webhookTokenInput.value.trim()
  };

  if (!payload.webhookUrl) {
    setStatus("Preencha a URL do webhook.");
    return;
  }

  if (!isValidWebhookUrl(payload.webhookUrl)) {
    setStatus("Use uma URL HTTPS terminando com /api/send-code.");
    return;
  }

  await chrome.storage.local.set({ [AUTH_CONFIG_KEY]: payload });
  setStatus("Configuracao salva. Use a URL do projeto unico na Vercel e reabra o navegador.");
}

function setStatus(text) {
  statusElement.textContent = text;
}

function isValidWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.endsWith("/api/send-code");
  } catch (_error) {
    return false;
  }
}

function disableCopy(input) {
  ["copy", "cut"].forEach((eventName) => {
    input.addEventListener(eventName, (event) => {
      event.preventDefault();
    });
  });

  input.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  input.addEventListener("keydown", (event) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

    if (ctrlOrCmd && (event.key === "c" || event.key === "x")) {
      event.preventDefault();
    }
  });
}
