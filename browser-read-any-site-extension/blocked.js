(() => {
  const elements = {
    description: document.querySelector("#description"),
    input: document.querySelector("#code-input"),
    submitButton: document.querySelector("#submit-action"),
    recipientPicker: document.querySelector("#recipient-picker"),
    status: document.querySelector("#status"),
    postUnlock: document.querySelector("#post-unlock")
  };
  let permissionPollId = null;
  let recipientPickerReady = false;

  init().catch((error) => {
    updateStatus(`Falha ao iniciar o bloqueio: ${error.message}`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.lockState) {
      return;
    }

    void refreshLockState();
  });

  elements.submitButton?.addEventListener("click", () => {
    void handleSubmitCode();
  });

  elements.input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleSubmitCode();
  });

  async function init() {
    await refreshLockState();
  }

  function applyLockState(lockState) {
    if (lockState?.tempLockDisabled) {
      updateStatus("Bloqueio temporariamente desativado.");
      setUnlockedMode(true);
      stopPermissionPolling();
      return;
    }

    const siteAccessGranted = lockState?.siteAccessGranted !== false;

    if (lockState?.unlocked) {
      updateStatus("Codigo valido. Acesso liberado.");
      setUnlockedMode(true);
      stopPermissionPolling();
      return;
    }

    setUnlockedMode(false, siteAccessGranted);

    if (!siteAccessGranted) {
      recipientPickerReady = false;
      hideRecipientPicker();
      startPermissionPolling();
      updateStatus('Ative "Em todos os sites" nas permissoes da extensao para continuar.');
      return;
    }

    stopPermissionPolling();

    if (!lockState?.configured) {
      recipientPickerReady = false;
      hideRecipientPicker();
      updateStatus("Configure o webhook antes de solicitar o codigo.");
      return;
    }

    void ensureRecipientPicker();

    if (lockState.sendStatus === "failed") {
      updateStatus(`Falha ao enviar o codigo: ${lockState.lastError || "erro desconhecido"}`);
      return;
    }

    if (lockState.sendStatus === "sent") {
      updateStatus(`Codigo enviado para ${lockState.recipientEmail}.${formatExpiration(lockState.expiresAt)}`);
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
    if (elements.submitButton?.disabled) {
      return;
    }

    const code = String(elements.input?.value || "").trim();

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

    applyLockState(response?.state || { unlocked: true });
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

    if (elements.input) {
      elements.input.focus();
    }
  }

  async function ensureRecipientPicker() {
    if (recipientPickerReady) {
      return;
    }

    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    updateStatus("Carregando destinatarios...");
    const response = await sendMessage({ type: "lock:listRecipients" });

    if (!response?.ok) {
      recipientPickerReady = false;
      hideRecipientPicker();
      updateStatus(response?.error || "Nao foi possivel carregar os destinatarios.");
      return;
    }

    const recipients = Array.isArray(response.recipients) ? response.recipients : [];

    if (recipients.length === 0) {
      recipientPickerReady = true;
      renderRecipientPicker([{ key: "", label: "Enviar codigo" }]);
      return;
    }

    recipientPickerReady = true;
    renderRecipientPicker(recipients);
  }

  function renderRecipientPicker(recipients) {
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    picker.innerHTML = `
      <p>Escolha o destinatario:</p>
      <div id="recipient-actions">
        ${recipients.map((item) => `
          <button class="secondary" type="button" data-key="${escapeAttribute(item.key)}">
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
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    picker.style.display = "none";
    picker.textContent = "";
    picker.onclick = null;
  }

  function setUnlockedMode(unlocked, siteAccessGranted = true) {
    if (elements.input) {
      elements.input.disabled = unlocked || !siteAccessGranted;
      elements.input.value = unlocked ? "" : elements.input.value;
    }

    if (elements.submitButton) {
      elements.submitButton.disabled = unlocked || !siteAccessGranted;
      elements.submitButton.textContent = unlocked
        ? "Acesso liberado"
        : siteAccessGranted
          ? "Validar codigo"
          : "Permissao necessaria";
    }

    if (elements.postUnlock) {
      elements.postUnlock.style.display = unlocked ? "block" : "none";
    }

    if (elements.description) {
      elements.description.textContent = siteAccessGranted
        ? "Escolha o destinatario abaixo para receber o codigo e depois valide-o para liberar esta sessao."
        : 'Ative "Em todos os sites" nas permissoes da extensao para liberar o envio e a validacao do codigo nesta sessao.';
    }
  }

  function updateStatus(text) {
    if (elements.status) {
      elements.status.textContent = text;
    }
  }

  function formatExpiration(expiresAt) {
    if (!expiresAt) {
      return "";
    }

    return ` Expira em ${new Date(expiresAt).toLocaleTimeString()}.`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message || "Falha ao comunicar com a extensao."
          });
          return;
        }

        resolve(response);
      });
    });
  }

  async function refreshLockState() {
    const response = await sendMessage({ type: "lock:getState" });
    applyLockState(response);
  }

  function startPermissionPolling() {
    if (permissionPollId !== null) {
      return;
    }

    permissionPollId = globalThis.setInterval(async () => {
      const response = await sendMessage({ type: "lock:getState" });

      if (response?.siteAccessGranted !== false) {
        applyLockState(response);
      }
    }, 2000);
  }

  function stopPermissionPolling() {
    if (permissionPollId === null) {
      return;
    }

    globalThis.clearInterval(permissionPollId);
    permissionPollId = null;
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
