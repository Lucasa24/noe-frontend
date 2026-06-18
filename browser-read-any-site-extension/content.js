(() => {
  if (window.top !== window || window.__BROWSER_READ_ANY_SITE__) return;

  const state = {
    active: true,
    href: location.href,
    locked: true,
    overlay: null,
    statusText: null,
    input: null,
    recipientPicker: null,
    stopEvents: null
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

    const nextValue = changes.lockState.newValue;
    applyLockState(nextValue);
  });

  async function init() {
    ensureOverlay();
    const response = await sendMessage({ type: "lock:getState" });
    applyLockState(response);
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
          Clique em "Liberar acesso" para escolher um destinatario e enviar o codigo. Depois cole o codigo recebido para liberar a navegacao nesta sessao.
        </p>
        <input id="bras-lock-input" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="Cole o codigo recebido" />
        <div id="bras-lock-actions">
          <button id="bras-lock-submit" class="bras-primary" type="button">Liberar acesso</button>
        </div>
        <div id="bras-lock-recipient-picker"></div>
        <div id="bras-lock-status"></div>
      </div>
    `;

    overlay.querySelector("#bras-lock-submit").addEventListener("click", handlePrimaryAction);

    const input = overlay.querySelector("#bras-lock-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handlePrimaryAction();
      }
    });

    state.overlay = overlay;
    state.statusText = overlay.querySelector("#bras-lock-status");
    state.input = input;
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
    if (lockState?.unlocked) {
      unlockDocument();
      return;
    }

    ensureOverlay();

    if (!lockState?.configured) {
      updateStatus("Configure o webhook e o token. O email de destino fica vinculado ao ID da extensao no servidor.");
      return;
    }

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
      updateStatus('Clique em "Liberar acesso" para solicitar um novo codigo.');
      return;
    }

    if (lockState.sendStatus === "used") {
      updateStatus("Codigo aceito. Liberando acesso...");
      return;
    }

    updateStatus("Aguardando solicitacao do codigo.");
  }

  async function handlePrimaryAction() {
    const code = String(state.input?.value || "").trim();

    if (!code) {
      await requestCode();
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

  async function requestCode() {
    const recipientKey = await chooseRecipient();

    if (recipientKey === null) {
      return;
    }

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

  async function chooseRecipient() {
    const picker = state.recipientPicker;

    if (!picker) {
      return "";
    }

    picker.style.display = "none";
    picker.textContent = "";

    updateStatus("Carregando destinatarios...");
    const response = await sendMessage({ type: "lock:listRecipients" });

    if (!response?.ok) {
      updateStatus(response?.error || "Nao foi possivel carregar os destinatarios.");
      return null;
    }

    const recipients = Array.isArray(response.recipients) ? response.recipients : [];

    if (recipients.length === 0) {
      return "";
    }

    if (recipients.length === 1) {
      return String(recipients[0]?.key || "");
    }

    picker.innerHTML = `
      <p>Escolha o destinatario:</p>
      <div id="bras-lock-recipient-actions">
        ${recipients.map((item) => `
          <button class="bras-secondary" type="button" data-key="${escapeAttribute(item.key)}">
            ${escapeHtml(item.label || item.key)}
          </button>
        `).join("")}
        <button class="bras-secondary" type="button" data-cancel="true">Cancelar</button>
      </div>
    `;
    picker.style.display = "block";

    return new Promise((resolve) => {
      const onClick = (event) => {
        const target = event.target;

        if (!(target instanceof HTMLElement)) {
          return;
        }

        const cancel = target.getAttribute("data-cancel");
        const key = target.getAttribute("data-key");

        if (!cancel && !key) {
          return;
        }

        picker.removeEventListener("click", onClick);
        picker.style.display = "none";
        picker.textContent = "";

        if (cancel) {
          updateStatus("Envio cancelado.");
          resolve(null);
          return;
        }

        resolve(String(key || ""));
      };

      picker.addEventListener("click", onClick);
    });
  }

  function updateStatus(text) {
    if (state.statusText) {
      state.statusText.textContent = text;
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
