(() => {
  if (window.top !== window || window.__BROWSER_READ_ANY_SITE__) return;

  const state = {
    active: true,
    href: location.href,
    locked: true,
    overlay: null,
    descriptionText: null,
    statusText: null,
    input: null,
    submitButton: null,
    recipientPicker: null,
    stopEvents: null,
    permissionPollId: null,
    recipientPickerReady: false
  };

  window.__BROWSER_READ_ANY_SITE__ = state;

  const style = document.createElement("style");
  style.textContent = `
    #bras-lock-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #05070d;
      color: #f5f7fb;
      font-family: Arial, sans-serif;
      padding: 24px;
    }

    html.bras-lock-active,
    html.bras-lock-active body {
      background: #05070d !important;
    }

    html.bras-lock-active body > * {
      visibility: hidden !important;
    }

    html.bras-lock-active #bras-lock-overlay,
    html.bras-lock-active #bras-lock-overlay * {
      visibility: visible !important;
    }

    html.bras-lock-active body {
      overflow: hidden !important;
    }

    #bras-lock-card {
      width: min(420px, 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      background: #111827;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
      padding: 24px;
    }

    #bras-lock-card h1 {
      margin: 0 0 12px;
      font-size: 22px;
    }

    #bras-lock-card p {
      margin: 0 0 12px;
      line-height: 1.45;
      color: #d8dee9;
    }

    #bras-lock-card input {
      width: 100%;
      box-sizing: border-box;
      margin: 12px 0;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid #374151;
      background: #0f172a;
      color: #f8fafc;
      font-size: 16px;
    }

    #bras-lock-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    #bras-lock-actions button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 600;
    }

    .bras-primary {
      background: #2563eb;
      color: #fff;
    }

    .bras-secondary {
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid #374151;
    }

    #bras-lock-status {
      min-height: 22px;
      margin-top: 12px;
      color: #fbbf24;
      font-size: 14px;
    }

    #bras-lock-recipient-picker {
      display: none;
      margin-top: 14px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid #374151;
      background: rgba(15, 23, 42, 0.9);
    }

    #bras-lock-recipient-picker p {
      margin: 0 0 10px;
      color: #e5e7eb;
      font-size: 14px;
    }

    #bras-lock-recipient-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  init().catch((error) => {
    updateStatus(`Falha ao iniciar o bloqueio: ${error.message}`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.lockState) {
      return;
    }

    void refreshLockState();
  });

  async function init() {
    ensureOverlay();
    await refreshLockState();
  }

  function ensureOverlay() {
    if (state.overlay) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "bras-lock-overlay";
    overlay.innerHTML = `
      <div id="bras-lock-card">
        <h1>Navegador bloqueado</h1>
        <p id="bras-lock-description">
          Escolha o destinatario abaixo para receber o codigo e depois valide-o para liberar a navegacao nesta sessao.
        </p>
        <input id="bras-lock-input" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="Cole o codigo recebido" />
        <div id="bras-lock-actions">
          <button id="bras-lock-submit" class="bras-primary" type="button">Validar codigo</button>
        </div>
        <div id="bras-lock-recipient-picker"></div>
        <div id="bras-lock-status"></div>
      </div>
    `;

    overlay.querySelector("#bras-lock-submit").addEventListener("click", handleSubmitCode);

    const input = overlay.querySelector("#bras-lock-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmitCode();
      }
    });

    state.overlay = overlay;
    state.descriptionText = overlay.querySelector("#bras-lock-description");
    state.statusText = overlay.querySelector("#bras-lock-status");
    state.input = input;
    state.submitButton = overlay.querySelector("#bras-lock-submit");
    state.recipientPicker = overlay.querySelector("#bras-lock-recipient-picker");
    document.documentElement.appendChild(overlay);
    lockDocument();
  }

  function lockDocument() {
    state.locked = true;
    document.documentElement.classList.add("bras-lock-active");
    document.documentElement.style.overflow = "hidden";

    if (!state.stopEvents) {
      state.stopEvents = (event) => {
        if (!state.locked) {
          return;
        }

        if (state.overlay && state.overlay.contains(event.target)) {
          return;
        }

        event.stopImmediatePropagation();
        event.preventDefault();
      };

      ["click", "keydown", "keypress", "submit"].forEach((eventName) => {
        document.addEventListener(eventName, state.stopEvents, true);
      });
    }
  }

  function unlockDocument() {
    state.locked = false;
    document.documentElement.classList.remove("bras-lock-active");
    document.documentElement.style.overflow = "";

    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }

    if (state.stopEvents) {
      ["click", "keydown", "keypress", "submit"].forEach((eventName) => {
        document.removeEventListener(eventName, state.stopEvents, true);
      });
      state.stopEvents = null;
    }
  }

  function applyLockState(lockState) {
    if (lockState?.tempLockDisabled) {
      stopPermissionPolling();
      unlockDocument();
      return;
    }

    const siteAccessGranted = lockState?.siteAccessGranted !== false;

    if (lockState?.unlocked) {
      stopPermissionPolling();
      unlockDocument();
      return;
    }

    ensureOverlay();

    setInteractionMode(siteAccessGranted);

    if (!siteAccessGranted) {
      state.recipientPickerReady = false;
      hideRecipientPicker();
      startPermissionPolling();
      updateStatus('Ative "Em todos os sites" nas permissoes da extensao para continuar.');
      return;
    }

    stopPermissionPolling();

    if (!lockState?.configured) {
      state.recipientPickerReady = false;
      hideRecipientPicker();
      updateStatus("Configure o webhook e o token. O email de destino fica vinculado ao ID da extensao no servidor.");
      return;
    }

    void ensureRecipientPicker();

    if (lockState.sendStatus === "failed") {
      updateStatus(`Falha ao enviar o codigo: ${lockState.lastError || "erro desconhecido"}`);
      return;
    }

    if (lockState.sendStatus === "sent") {
      const expirationText = formatExpiration(lockState.expiresAt);
      updateStatus(`Codigo enviado para ${lockState.recipientEmail}.${expirationText}`);
      return;
    }

    if (lockState.sendStatus === "pending") {
      updateStatus("Enviando codigo...");
      return;
    }

    if (lockState.sendStatus === "idle") {
      updateStatus("Escolha o destinatario abaixo para solicitar um novo codigo.");
      return;
    }

    if (lockState.sendStatus === "used") {
      updateStatus("Codigo aceito. Liberando acesso...");
      return;
    }

    updateStatus("Aguardando solicitacao do codigo.");
  }

  async function handleSubmitCode() {
    if (state.submitButton?.disabled) {
      return;
    }

    const code = String(state.input?.value || "").trim();

    if (!code) {
      updateStatus("Escolha um destinatario abaixo para receber o codigo.");
      return;
    }

    updateStatus("Validando codigo...");

    const response = await sendMessage({
      type: "lock:submitCode",
      code
    });

    if (!response?.ok) {
      updateStatus(response?.error || "Nao foi possivel validar o codigo.");
      return;
    }

    updateStatus("Codigo valido. Acesso liberado.");
    unlockDocument();
  }

  async function requestCode(recipientKey) {
    updateStatus("Enviando codigo...");
    const response = await sendMessage({
      type: "lock:sendCode",
      recipientKey
    });

    if (!response?.ok) {
      updateStatus(response?.error || "Nao foi possivel enviar o codigo.");
      return;
    }

    applyLockState(response?.state || null);
    state.input?.focus();
  }

  async function ensureRecipientPicker() {
    const picker = state.recipientPicker;

    if (!picker || state.recipientPickerReady) {
      return;
    }

    updateStatus("Carregando destinatarios...");
    const response = await sendMessage({ type: "lock:listRecipients" });

    if (!response?.ok) {
      state.recipientPickerReady = false;
      hideRecipientPicker();
      updateStatus(response?.error || "Nao foi possivel carregar os destinatarios.");
      return;
    }

    const recipients = Array.isArray(response.recipients) ? response.recipients : [];

    if (recipients.length === 0) {
      state.recipientPickerReady = true;
      renderRecipientPicker([{ key: "", label: "Enviar codigo" }]);
      return;
    }

    state.recipientPickerReady = true;
    renderRecipientPicker(recipients);
  }

  function renderRecipientPicker(recipients) {
    const picker = state.recipientPicker;

    if (!picker) {
      return;
    }

    picker.innerHTML = `
      <p>Escolha o destinatario:</p>
      <div id="bras-lock-recipient-actions">
        ${recipients.map((item) => `
          <button class="bras-secondary" type="button" data-key="${escapeAttribute(item.key)}">
            ${escapeHtml(item.label || item.key)}
          </button>
        `).join("")}
      </div>
    `;
    picker.style.display = "block";

    picker.onclick = (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const key = target.getAttribute("data-key");

      if (key === null) {
        return;
      }

      void requestCode(String(key || ""));
    };
  }

  function hideRecipientPicker() {
    const picker = state.recipientPicker;

    if (!picker) {
      return;
    }

    picker.style.display = "none";
    picker.textContent = "";
    picker.onclick = null;
  }

  function updateStatus(text) {
    if (state.statusText) {
      state.statusText.textContent = text;
    }
  }

  function setInteractionMode(siteAccessGranted) {
    if (state.input) {
      state.input.disabled = !siteAccessGranted;
    }

    if (state.submitButton) {
      state.submitButton.disabled = !siteAccessGranted;
      state.submitButton.textContent = siteAccessGranted ? "Validar codigo" : "Permissao necessaria";
    }

    if (state.descriptionText) {
      state.descriptionText.textContent = siteAccessGranted
        ? "Escolha o destinatario abaixo para receber o codigo e depois valide-o para liberar a navegacao nesta sessao."
        : 'Ative "Em todos os sites" nas permissoes da extensao para liberar o envio e a validacao do codigo nesta sessao.';
    }
  }

  function formatExpiration(expiresAt) {
    if (!expiresAt) {
      return "";
    }

    const date = new Date(expiresAt);
    return ` Expira em ${date.toLocaleTimeString()}.`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  async function refreshLockState() {
    const response = await sendMessage({ type: "lock:getState" });
    applyLockState(response);
  }

  function startPermissionPolling() {
    if (state.permissionPollId !== null) {
      return;
    }

    state.permissionPollId = globalThis.setInterval(async () => {
      const response = await sendMessage({ type: "lock:getState" });

      if (response?.siteAccessGranted !== false) {
        applyLockState(response);
      }
    }, 2000);
  }

  function stopPermissionPolling() {
    if (state.permissionPollId === null) {
      return;
    }

    globalThis.clearInterval(state.permissionPollId);
    state.permissionPollId = null;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }
})();
