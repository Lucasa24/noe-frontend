(() => {
  const elements = {
    description: document.querySelector("#description"),
    input: document.querySelector("#code-input"),
    submitButton: document.querySelector("#submit-action"),
    recipientPicker: document.querySelector("#recipient-picker"),
    status: document.querySelector("#status"),
    postUnlock: document.querySelector("#post-unlock"),
    pendingOverlay: document.querySelector("#pending-overlay")
  };
  let permissionPollId = null;
  let recipientPickerReady = false;
  let recipients = [];
  let recipientQuery = "";
  let selectedRecipientKey = "";
  let recipientPickerListenersAttached = false;
  let currentExtensionId = "";
  let pixPollingId = null;
  let clearedPendingProfileKeys = new Set();
  let pendingProfiles = {};

  const PENDING_PROFILES = {
    Agent: {
      email: "internetmoneyxtratosferic@gmail.com",
      renewalDate: "2026-07-25"
    },
    Jen: {
      email: "jennepherlopes@gmail.com",
      renewalDate: "2026-08-15",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700
    },
    Andressa: {
      email: "andressamichaelsen16@gmail.com",
      renewalDate: "2026-08-15",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700
    },
    Pedro: {
      email: "bragapeedro@gmail.com",
      renewalDate: "2026-08-15"
    }
  };

  const DEFAULT_PENDING_CONFIG = {
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  };

  const RENEWAL_CLEARANCES_KEY = "renewalClearances";

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
    await loadPendingProfileClearances();
    await loadExtensionConfig();
    await refreshLockState();
  }

  function applyLockState(lockState) {
    currentExtensionId = lockState?.extensionId || currentExtensionId;
    hidePendingOverlay();
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

  function getPendingProfile(key) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (clearedPendingProfileKeys.has(normalizedKey)) {
      return null;
    }

    for (const [profileKey, profile] of Object.entries(PENDING_PROFILES)) {
      if (profileKey.toLowerCase() === normalizedKey) {
        return {
          ...DEFAULT_PENDING_CONFIG,
          ...profile
        };
      }
    }
    return null;
  }

  async function loadExtensionConfig() {
    const response = await sendMessage({ type: "lock:getExtensionConfig" });

    if (!response?.ok) {
      return;
    }
  }

  async function loadPendingProfileClearances() {
    try {
      const data = await chrome.storage.local.get(RENEWAL_CLEARANCES_KEY);
      const clearances = data[RENEWAL_CLEARANCES_KEY] || {};
      clearedPendingProfileKeys = new Set(
        Object.keys(clearances).map((key) => normalizePendingProfileKey(key))
      );
    } catch (_error) {
      clearedPendingProfileKeys = new Set();
    }
  }

  async function markPendingProfileCleared(recipientKey, transactionId) {
    const normalizedKey = normalizePendingProfileKey(recipientKey);

    if (!normalizedKey) {
      return;
    }

    const data = await chrome.storage.local.get(RENEWAL_CLEARANCES_KEY).catch(() => ({}));
    const clearances = data[RENEWAL_CLEARANCES_KEY] || {};

    clearances[normalizedKey] = {
      clearedAt: Date.now(),
      transactionId: String(transactionId || "")
    };

    await chrome.storage.local.set({ [RENEWAL_CLEARANCES_KEY]: clearances });
    clearedPendingProfileKeys.add(normalizedKey);
  }

  function normalizePendingProfileKey(key) {
    return String(key || "").trim().toLowerCase();
  }

  async function requestCode(recipientKey) {
    const pendingProfile = getPendingProfile(recipientKey);
    if (pendingProfile) {
      showPendingProfile(pendingProfile, recipientKey);
      return;
    }
    selectedRecipientKey = recipientKey;
    renderRecipientPicker();
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
    await ensureRecipientPicker({ force: true, silent: true });

    if (elements.input) {
      elements.input.focus();
    }
  }

  async function ensureRecipientPicker({ force = false, silent = false } = {}) {
    if (recipientPickerReady && !force) {
      return;
    }

    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    if (!silent) {
      updateStatus("Carregando destinatarios...");
    }

    const response = await sendMessage({ type: "lock:listRecipients" });

    if (!response?.ok) {
      recipientPickerReady = false;
      hideRecipientPicker();
      updateStatus(response?.error || "Nao foi possivel carregar os destinatarios.");
      return;
    }

    const fetchedRecipients = Array.isArray(response.recipients) ? response.recipients : [];

    if (fetchedRecipients.length === 0) {
      recipientPickerReady = true;
      recipients = [{ key: "", label: "Enviar codigo", lastSentAt: null }];
      renderRecipientPicker();
      return;
    }

    recipientPickerReady = true;
    recipients = fetchedRecipients;
    renderRecipientPicker();
  }

  function renderRecipientPicker() {
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    if (!picker.querySelector("#recipient-search")) {
      picker.innerHTML = `
        <p>Escolha o destinatario:</p>
        <div class="recipient-search">
          <svg class="recipient-search-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="6"></circle>
            <path d="m16 16 4 4"></path>
          </svg>
          <input id="recipient-search" type="search" autocomplete="off" aria-label="Buscar destinatário" placeholder="Buscar destinatário..." />
        </div>
        <div id="recipient-actions">
          <ul id="recipient-list" aria-label="Destinatarios"></ul>
          <p id="recipient-empty" role="status" aria-live="polite" hidden>Nenhum destinatário encontrado.</p>
        </div>
      `;
      attachRecipientPickerListeners(picker);
    }

    const searchInput = picker.querySelector("#recipient-search");
    const list = picker.querySelector("#recipient-list");
    const emptyState = picker.querySelector("#recipient-empty");

    if (!(searchInput instanceof HTMLInputElement) || !(list instanceof HTMLUListElement) || !(emptyState instanceof HTMLElement)) {
      return;
    }

    searchInput.value = recipientQuery;
    const sortedRecipients = sortRecipientsByActivity(recipients);
    const visibleRecipients = filterRecipients(sortedRecipients, recipientQuery);
    const mostRecentRecipient = sortedRecipients.find((item) => getRecipientTimestamp(item) > 0);

    list.innerHTML = visibleRecipients.map((item) => {
      const key = String(item.key || "");
      const label = String(item.label || key);
      const isSelected = key === selectedRecipientKey;
      const isMostRecent = key === mostRecentRecipient?.key;

      return `
        <li class="recipient-item">
          <button
            class="recipient-option${isSelected ? " is-selected" : ""}"
            type="button"
            data-key="${escapeAttribute(key)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="recipient-copy">
              <span class="recipient-name">${escapeHtml(label)}</span>
              <span class="recipient-activity" ${getPendingProfile(key) ? 'style="color:#fca5a5"' : ''}>${getPendingProfile(key) ? escapeHtml("⚠️ Atrasado há " + calculateDaysLate(getPendingProfile(key).renewalDate) + " dias") : escapeHtml(formatRecipientActivity(item.lastSentAt))}</span>
            </span>
            ${getPendingProfile(key) ? '<span class="recipient-badge-pending">⚠️ Renovar</span>' : isMostRecent ? '<span class="recipient-badge">Mais recente</span>' : ""}
          </button>
        </li>
      `;
    }).join("");
    emptyState.hidden = visibleRecipients.length > 0;
    picker.style.display = "block";
  }

  function attachRecipientPickerListeners(picker) {
    if (recipientPickerListenersAttached) {
      return;
    }

    picker.addEventListener("input", (event) => {
      const target = event.target;

      if (target instanceof HTMLInputElement && target.id === "recipient-search") {
        recipientQuery = target.value;
        renderRecipientPicker();
      }
    });

    picker.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest("button[data-key]");

      if (!(button instanceof HTMLButtonElement) || !picker.contains(button)) {
        return;
      }

      const key = button.getAttribute("data-key");

      if (key === null) {
        return;
      }

      void requestCode(String(key || ""));
    });

    picker.addEventListener("keydown", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement) || !target.matches("button[data-key]")) {
        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        target.click();
      }
    });

    recipientPickerListenersAttached = true;
  }

  function sortRecipientsByActivity(items) {
    return [...(Array.isArray(items) ? items : [])]
      .map((item) => ({
        key: String(item?.key || ""),
        label: String(item?.label || item?.key || ""),
        lastSentAt: getRecipientTimestamp(item) > 0 ? item.lastSentAt : null
      }))
      .sort((left, right) => {
        const activityDifference = getRecipientTimestamp(right) - getRecipientTimestamp(left);

        if (activityDifference !== 0) {
          return activityDifference;
        }

        return left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" });
      });
  }

  function filterRecipients(items, query) {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => normalizeSearchText(item.label).includes(normalizedQuery));
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRecipientTimestamp(recipient) {
    const timestamp = Date.parse(String(recipient?.lastSentAt || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function formatRecipientActivity(lastSentAt) {
    const timestamp = Date.parse(String(lastSentAt || ""));

    if (!Number.isFinite(timestamp)) {
      return "Nenhum código enviado";
    }

    const date = new Date(timestamp);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((dayStart - targetDayStart) / 86400000);
    const time = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    if (daysAgo === 0) {
      return `Último código: hoje, ${time}`;
    }

    if (daysAgo === 1) {
      return `Último código: ontem, ${time}`;
    }

    return `Último código: ${date.toLocaleDateString("pt-BR")}, ${time}`;
  }

  function hideRecipientPicker() {
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    picker.style.display = "none";
    picker.textContent = "";
    recipients = [];
    recipientQuery = "";
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

  function calculateDaysLate(renewalDate) {
    const renewal = new Date(renewalDate + "T00:00:00");
    const now = new Date();
    const diffMs = now.getTime() - renewal.getTime();
    const days = Math.floor(diffMs / 86400000);
    return days > 0 ? days : 0;
  }

  function hidePendingOverlay() {
    stopPixPolling();
    if (elements.pendingOverlay) {
      elements.pendingOverlay.style.display = "none";
      elements.pendingOverlay.innerHTML = "";
    }
  }

  function showPendingProfile(profile, recipientKey) {
    const picker = elements.recipientPicker;
    if (picker) {
      picker.style.display = "none";
    }

    const overlay = elements.pendingOverlay;
    if (!overlay) {
      return;
    }

    const daysLate = calculateDaysLate(profile.renewalDate);
    const renewalFormatted = new Date(profile.renewalDate + "T00:00:00").toLocaleDateString("pt-BR");

    overlay.innerHTML = `
      <div class="pending-header">⚠️ PENDÊNCIA DE RENOVAÇÃO</div>
      <div class="pending-info">
        <div class="pending-info-row">
          <span class="pending-info-label">Perfil</span>
          <span>${escapeHtml(recipientKey)}</span>
        </div>
        <div class="pending-info-row">
          <span class="pending-info-label">E-mail</span>
          <span>${escapeHtml(profile.email)}</span>
        </div>
        <div class="pending-info-row">
          <span class="pending-info-label">Renovação</span>
          <span>${escapeHtml(renewalFormatted)}</span>
        </div>
        <div class="pending-info-row">
          <span class="pending-info-label">Valor</span>
          <span>${escapeHtml(profile.monthlyPrice)} / mês</span>
        </div>
        <div class="pending-info-row">
          <span class="pending-info-label">Status</span>
          <span class="pending-status-badge">⚠️ ATRASADO HÁ ${daysLate} DIAS</span>
        </div>
      </div>
      <div class="pending-message">
        Seu acesso está <strong>BLOQUEADO</strong> por falta de renovação. Pague agora via PIX para regularizar.
      </div>
      <button class="pending-pay-button" id="pending-pay-btn" type="button">
        🟢 PAGAR ${escapeHtml(profile.monthlyPrice)} VIA PIX
      </button>
      <button class="pending-back-button" id="pending-back-btn" type="button">
        ← Voltar aos destinatários
      </button>
    `;

    overlay.querySelector("#pending-pay-btn")?.addEventListener("click", () => {
      void startPixPayment(profile, recipientKey);
    });

    overlay.querySelector("#pending-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      if (picker) {
        picker.style.display = "block";
      }
    });

    overlay.style.display = "block";
    updateStatus("");
  }

  async function startPixPayment(profile, recipientKey) {
    const overlay = elements.pendingOverlay;
    if (!overlay) {
      return;
    }

    const payBtn = overlay.querySelector("#pending-pay-btn");
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = "Gerando cobrança...";
    }

    const response = await sendMessage({
      type: "lock:createPixCharge",
      extensionId: currentExtensionId,
      recipientKey
    });

    if (!response?.ok) {
      updateStatus(response?.error || "Falha ao gerar cobrança PIX.");
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = `🟢 PAGAR ${profile.monthlyPrice} VIA PIX`;
      }
      return;
    }

    showPixQrCode(response, profile, recipientKey);
  }

  function showPixQrCode(data, profile, recipientKey) {
    const overlay = elements.pendingOverlay;
    if (!overlay) {
      return;
    }

    overlay.innerHTML = `
      <div class="pix-container">
        <div class="pix-title">💳 PAGAMENTO PIX — ${escapeHtml(profile.monthlyPrice)}</div>
        <p style="color:#cbd5e1;font-size:14px;margin:0 0 14px">Escaneie o QR Code ou copie o código:</p>
        <div class="pix-qr-wrapper">
          <img src="${escapeAttribute(data.qrCodeBase64)}" alt="QR Code PIX" />
        </div>
        <button class="pix-copy-button" id="pix-copy-btn" type="button">📋 Copiar código PIX</button>
        <div class="pix-polling" id="pix-polling-indicator">
          <span class="pix-spinner"></span>
          Aguardando pagamento...
        </div>
        <button class="pending-back-button" id="pix-back-btn" type="button">
          ← Voltar
        </button>
      </div>
    `;

    overlay.querySelector("#pix-copy-btn")?.addEventListener("click", () => {
      void copyPixCode(data.qrCode);
    });

    overlay.querySelector("#pix-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      const picker = elements.recipientPicker;
      if (picker) {
        picker.style.display = "block";
      }
    });

    startPixPolling(data.transactionId, profile, recipientKey);
    updateStatus("");
  }

  async function copyPixCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      const btn = elements.pendingOverlay?.querySelector("#pix-copy-btn");
      if (btn) {
        btn.textContent = "✅ Código copiado!";
        setTimeout(() => {
          btn.textContent = "📋 Copiar código PIX";
        }, 2000);
      }
    } catch (_error) {
      updateStatus("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  function startPixPolling(transactionId, profile, recipientKey) {
    stopPixPolling();

    pixPollingId = globalThis.setInterval(async () => {
      const response = await sendMessage({
        type: "lock:checkPixStatus",
        transactionId
      });

      if (!response?.ok) {
        return;
      }

      if (response.status === "paid") {
        stopPixPolling();
        await markPendingProfileCleared(recipientKey, transactionId);
        await ensureRecipientPicker({ force: true, silent: true });
        showPaymentSuccess(profile, recipientKey);
        return;
      }

      if (response.status === "expired") {
        stopPixPolling();
        const indicator = elements.pendingOverlay?.querySelector("#pix-polling-indicator");
        if (indicator) {
          indicator.className = "pix-expired";
          indicator.innerHTML = 'QR Code expirado. <button class="pending-back-button" style="margin-top:8px" id="pix-retry-btn" type="button">Gerar novo QR Code</button>';
          elements.pendingOverlay?.querySelector("#pix-retry-btn")?.addEventListener("click", () => {
            void startPixPayment(profile, recipientKey);
          });
        }
      }
    }, 5000);
  }

  function stopPixPolling() {
    if (pixPollingId !== null) {
      globalThis.clearInterval(pixPollingId);
      pixPollingId = null;
    }
  }

  function showPaymentSuccess(profile, recipientKey) {
    const overlay = elements.pendingOverlay;
    if (!overlay) {
      return;
    }

    overlay.innerHTML = `
      <div class="payment-success">
        <div class="payment-success-icon">✅</div>
        <div class="payment-success-title">PAGAMENTO CONFIRMADO!</div>
        <p class="payment-success-text">
          Seu pagamento de <strong>${escapeHtml(profile.monthlyPrice)}</strong> foi recebido com sucesso.
        </p>
        <div class="payment-wait-badge">Pagamento confirmado. Agora solicite o codigo de acesso.</div>
        <button class="pending-pay-button" id="payment-request-code-btn" type="button">
          Solicitar codigo para ${escapeHtml(recipientKey)}
        </button>
        <button class="pending-back-button" id="payment-back-btn" type="button">
          Voltar aos destinatarios
        </button>
        <div class="support-section">
          <div class="support-section-title">Se precisar, entre em contato:</div>
          <a class="support-link" href="mailto:${escapeAttribute(profile.supportEmail)}">
            <span class="support-link-icon">📧</span>
            Suporte: ${escapeHtml(profile.supportEmail)}
          </a>
          <a class="support-link support-link-whatsapp" href="${escapeAttribute(profile.supportWhatsApp)}" target="_blank" rel="noopener noreferrer">
            <span class="support-link-icon">📱</span>
            Falar no WhatsApp
          </a>
        </div>
      </div>
    `;

    overlay.querySelector("#payment-request-code-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      void requestCode(recipientKey);
    });

    overlay.querySelector("#payment-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      const picker = elements.recipientPicker;
      if (picker) {
        picker.style.display = "block";
      }
    });

    updateStatus("");
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
