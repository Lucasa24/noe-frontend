const AUTH_CONFIG_KEY = "authConfig";

const recipientEmailInput = document.getElementById("recipient-email");
const webhookUrlInput = document.getElementById("webhook-url");
const webhookTokenInput = document.getElementById("webhook-token");
const statusElement = document.getElementById("status");
const extensionIdElement = document.getElementById("extension-id");
const saveButton = document.getElementById("save-config");

void init();

saveButton.addEventListener("click", () => {
  void saveConfig();
});

async function init() {
  extensionIdElement.textContent = chrome.runtime.id;

  const stored = await chrome.storage.local.get(AUTH_CONFIG_KEY);
  const config = stored[AUTH_CONFIG_KEY] || {};

  recipientEmailInput.value = config.recipientEmail || "";
  webhookUrlInput.value = config.webhookUrl || "";
  webhookTokenInput.value = config.webhookToken || "";
}

async function saveConfig() {
  const payload = {
    recipientEmail: recipientEmailInput.value.trim(),
    webhookUrl: webhookUrlInput.value.trim(),
    webhookToken: webhookTokenInput.value.trim()
  };

  if (!payload.recipientEmail || !payload.webhookUrl) {
    setStatus("Preencha o email e a URL do webhook.");
    return;
  }

  if (!isValidWebhookUrl(payload.webhookUrl)) {
    setStatus("Use uma URL HTTPS terminando com /api/send-code.");
    return;
  }

  await chrome.storage.local.set({ [AUTH_CONFIG_KEY]: payload });
  setStatus("Configuracao salva. Reabra o navegador ou clique em reenviar codigo na tela de bloqueio.");
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
