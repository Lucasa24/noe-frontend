(() => {
  const elements = {
    description: document.querySelector("#description"),
    input: document.querySelector("#code-input"),
    primaryButton: document.querySelector("#primary-action"),
    recipientPicker: document.querySelector("#recipient-picker"),
    status: document.querySelector("#status"),
    postUnlock: document.querySelector("#post-unlock")
  };
  let permissionPollId = null;

  init().catch((error) => {
    updateStatus(`Falha ao iniciar o bloqueio: ${error.message}`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.lockState) {
      return;
    }

    applyLockState(changes.lockState.newValue);
  });

  elements.primaryButton?.addEventListener("click", () => {
    void handlePrimaryAction();
  });

  elements.input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handlePrimaryAction();
  });

  async function init() {
    const response = await sendMessage({ type: "lock:getState" });
    applyLockState(response);
  }

  function applyLockState(lockState) {
    const siteAccessGranted = lockState?.siteAccessGranted !== false;

    if (lockState?.unlocked) {
      updateStatus("Codigo valido. Acesso liberado.");
      setUnlockedMode(true);
      stopPermissionPolling();
      return;
    }

    setUnlockedMode(false, siteAccessGranted);

    if (!siteAccessGranted) {
      startPermissionPolling();
      updateStatus('Ative "Em todos os sites" nas permissoes da extensao para continuar.');
      return;
    }

    stopPermissionPolling();

    if (!lockState?.configured) {
      updateStatus("Configure o webhook antes de solicitar o codigo.");
      return;
    }

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
    if (elements.primaryButton?.disabled) {
      return;
    }

    const code = String(elements.input?.value || "").trim();

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

    applyLockState(response?.state || { unlocked: true });
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

    if (elements.input) {
      elements.input.focus();
    }
  }

  async function chooseRecipient() {
    const picker = elements.recipientPicker;

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
      <div id="recipient-actions">
        ${recipients.map((item) => `
          <button class="secondary" type="button" data-key="${escapeAttribute(item.key)}">
            ${escapeHtml(item.label || item.key)}
          </button>
        `).join("")}
        <button class="secondary" type="button" data-cancel="true">Cancelar</button>
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

  function setUnlockedMode(unlocked, siteAccessGranted = true) {
    if (elements.input) {
      elements.input.disabled = unlocked || !siteAccessGranted;
      elements.input.value = unlocked ? "" : elements.input.value;
    }

    if (elements.primaryButton) {
      elements.primaryButton.disabled = unlocked || !siteAccessGranted;
      elements.primaryButton.textContent = unlocked
        ? "Acesso liberado"
        : siteAccessGranted
          ? "Liberar acesso"
          : "Permissao necessaria";
    }

    if (elements.postUnlock) {
      elements.postUnlock.style.display = unlocked ? "block" : "none";
    }

    if (elements.description) {
      elements.description.textContent = siteAccessGranted
        ? "Esta sessao fica bloqueada em uma aba interna da extensao ate que o codigo correto seja validado."
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
        resolve(response);
      });
    });
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
