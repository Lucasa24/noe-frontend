(() => {
  const elements = {
    description: document.querySelector("#description"),
    input: document.querySelector("#code-input"),
    submitButton: document.querySelector("#submit-action"),
    reloadButton: document.querySelector("#reload-extension"),
    recipientPicker: document.querySelector("#recipient-picker"),
    status: document.querySelector("#status"),
    postUnlock: document.querySelector("#post-unlock"),
    pendingOverlay: document.querySelector("#pending-overlay")
  };
  let permissionPollId = null;
  let contentPickerReady = false;
  let accessContents = [];
  let contentConfigError = "";
  let contentQuery = "";
  let recipientQuery = "";
  let selectedContentKey = "";
  let contentPickerListenersAttached = false;
  let currentExtensionId = "";
  let pixPollingId = null;
  let clearedPendingProfileKeys = new Set();
  let pendingProfileClearanceExpiresAt = new Map();
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
      renewalDate: "2026-08-16",
      monthlyPrice: "R$ 47,00",
      chargeAmountCents: 4700
    }
  };

  const DEFAULT_PENDING_CONFIG = {
    monthlyPrice: "R$ 9,00",
    chargeAmountCents: 900,
    supportEmail: "caixa@mentorxlab.com",
    supportWhatsApp: "http://wa.me/5591984272483?text=Ol%C3%A1,%20gostaria%20de%20consultar%20as%20op%C3%A7%C3%B5es%20de%20parcelamento%20do%20Plano%20D.....V.....D%205"
  };

  const RENEWAL_CLEARANCES_KEY = "renewalClearances";
  const MESSAGE_RESPONSE_TIMEOUT_MS = 30000;

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

  elements.reloadButton?.addEventListener("click", () => {
    void handleReloadExtension();
  });

  document.addEventListener("keydown", (event) => {
    if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "r") {
      return;
    }

    event.preventDefault();
    void handleReloadExtension();
  });

  async function init() {
    await loadPendingProfileClearances();
    await loadExtensionConfig();
    await refreshLockState();
  }

  async function applyLockState(lockState) {
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
      contentPickerReady = false;
      hideContentPicker();
      startPermissionPolling();
      updateStatus('Ative "Em todos os sites" nas permissoes da extensao para continuar.');
      return;
    }

    stopPermissionPolling();

    if (!lockState?.configured) {
      contentPickerReady = false;
      hideContentPicker();
      updateStatus("Configure o webhook antes de solicitar o codigo.");
      return;
    }

    if (!(await ensureContentPicker())) {
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
      updateStatus("Escolha um conteúdo abaixo para solicitar um novo código.");
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
      updateStatus("Escolha um conteúdo abaixo para receber o código.");
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

    await applyLockState(response?.state || { unlocked: true });
  }

  function getPendingProfile(key) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (isPendingProfileCleared(normalizedKey)) {
      return null;
    }

    const remoteProfile = findPendingProfile(pendingProfiles, normalizedKey);
    if (remoteProfile) {
      const resolvedRemoteProfile = {
        ...DEFAULT_PENDING_CONFIG,
        ...remoteProfile
      };

      return isChargeDue(resolvedRemoteProfile) ? resolvedRemoteProfile : null;
    }

    for (const [profileKey, profile] of Object.entries(PENDING_PROFILES)) {
      if (profileKey.toLowerCase() === normalizedKey) {
        const resolvedProfile = {
          ...DEFAULT_PENDING_CONFIG,
          ...profile
        };

        return isChargeDue(resolvedProfile) ? resolvedProfile : null;
      }
    }
    return null;
  }

  async function loadExtensionConfig() {
    const response = await sendMessage({ type: "lock:getExtensionConfig" });

    return applyExtensionConfig(response);
  }

  function applyExtensionConfig(response) {
    if (!response?.ok) {
      accessContents = [];
      contentConfigError = response?.error || "Não foi possível carregar os conteúdos.";
      return false;
    }

    pendingProfiles = normalizePendingProfiles(response.config?.pendingProfiles);
    accessContents = normalizeAccessContents(response.config?.accessContents);
    contentConfigError = accessContents.length > 0
      ? ""
      : response?.error || "A configuração recebida não possui conteúdos.";
    return accessContents.length > 0;
  }

  async function handleReloadExtension() {
    if (elements.reloadButton?.disabled) {
      return;
    }

    if (elements.reloadButton) {
      elements.reloadButton.disabled = true;
      elements.reloadButton.textContent = "♻ Recarregando extensão...";
    }

    updateStatus("Buscando conteúdos e destinatários atualizados...");

    try {
      const response = await sendMessage({ type: "lock:refreshExtensionConfig" });

      if (!applyExtensionConfig(response)) {
        contentPickerReady = false;
        hideContentPicker();
        updateStatus(contentConfigError || "Não foi possível recarregar a extensão.");
        return;
      }

      selectedContentKey = "";
      contentQuery = "";
      recipientQuery = "";
      contentPickerReady = true;
      renderContentPicker();
      updateStatus("Extensão recarregada. Conteúdos e destinatários atualizados.");
    } finally {
      if (elements.reloadButton) {
        elements.reloadButton.disabled = false;
        elements.reloadButton.textContent = "♻ Recarregar extensão";
      }
    }
  }

  function normalizeAccessContents(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => ({
        key: String(item?.key || "").trim(),
        label: String(item?.label || "").trim(),
        available: item?.available === true,
        recipients: normalizeContentRecipients(item?.recipients)
      }))
      .filter((item) => item.key && item.label);
  }

  function normalizeContentRecipients(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => ({
        key: String(item?.key || "").trim(),
        label: String(item?.label || "").trim()
      }))
      .filter((item) => item.key && item.label);
  }

  function normalizePendingProfiles(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value;
  }

  function findPendingProfile(profiles, normalizedKey) {
    for (const [profileKey, profile] of Object.entries(profiles || {})) {
      if (String(profileKey || "").trim().toLowerCase() === normalizedKey) {
        return profile;
      }
    }

    return null;
  }

  function isChargeDue(profile) {
    const renewalDate = String(profile?.renewalDate || "").trim();

    if (!renewalDate) {
      return true;
    }

    const renewal = new Date(renewalDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Number.isNaN(renewal.getTime()) ? true : today >= renewal;
  }

  async function loadPendingProfileClearances() {
    try {
      const data = await chrome.storage.local.get(RENEWAL_CLEARANCES_KEY);
      const clearances = data[RENEWAL_CLEARANCES_KEY] || {};
      pendingProfileClearanceExpiresAt = new Map(
        Object.entries(clearances).map(([key, clearance]) => [normalizePendingProfileKey(key), Number(clearance?.nextDueAt || 0)])
      );
      clearedPendingProfileKeys = new Set(
        Array.from(pendingProfileClearanceExpiresAt.entries())
          .filter(([, nextDueAt]) => !Number.isFinite(nextDueAt) || nextDueAt > Date.now())
          .map(([key]) => key)
      );
    } catch (_error) {
      clearedPendingProfileKeys = new Set();
      pendingProfileClearanceExpiresAt = new Map();
    }
  }

  async function markPendingProfileCleared(recipientKey, transactionId) {
    const normalizedKey = normalizePendingProfileKey(recipientKey);

    if (!normalizedKey) {
      return;
    }

    const data = await chrome.storage.local.get(RENEWAL_CLEARANCES_KEY).catch(() => ({}));
    const clearances = data[RENEWAL_CLEARANCES_KEY] || {};

    const paidAt = Date.now();
    const nextDueAt = addOneCalendarMonth(paidAt);
    clearances[normalizedKey] = {
      clearedAt: paidAt,
      nextDueAt,
      transactionId: String(transactionId || "")
    };

    await chrome.storage.local.set({ [RENEWAL_CLEARANCES_KEY]: clearances });
    pendingProfileClearanceExpiresAt.set(normalizedKey, nextDueAt);
    clearedPendingProfileKeys.add(normalizedKey);
  }

  function normalizePendingProfileKey(key) {
    return String(key || "").trim().toLowerCase();
  }

  function isPendingProfileCleared(normalizedKey) {
    if (!clearedPendingProfileKeys.has(normalizedKey)) return false;
    const nextDueAt = pendingProfileClearanceExpiresAt.get(normalizedKey);
    if (Number.isFinite(nextDueAt) && nextDueAt <= Date.now()) {
      clearedPendingProfileKeys.delete(normalizedKey);
      pendingProfileClearanceExpiresAt.delete(normalizedKey);
      return false;
    }
    return true;
  }

  function addOneCalendarMonth(timestamp) {
    const date = new Date(timestamp);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
    return date.getTime();
  }

  async function requestCode(contentKey, recipientKey) {
    const content = accessContents.find((item) => item.key === contentKey);
    const recipient = content?.recipients.find((item) => item.key === recipientKey);

    if (!content || !recipient) {
      updateStatus("Escolha um destinatário autorizado para solicitar o código.");
      return;
    }

    selectedContentKey = contentKey;
    renderContentPicker();
    updateStatus(`Enviando código para ${recipient.label}...`);

    const response = await sendMessage({
      type: "lock:sendCode",
      contentKey,
      recipientKey
    });

    if (!response?.ok) {
      updateStatus(response?.error || "Nao foi possivel enviar o codigo.");
      return;
    }

    await applyLockState(response?.state || null);
    await ensureContentPicker({ force: true, silent: true });

    if (elements.input) {
      elements.input.focus();
    }
  }

  async function ensureContentPicker({ force = false, silent = false } = {}) {
    if (contentPickerReady && !force) {
      return;
    }

    const picker = elements.recipientPicker;

    if (!picker) {
      return false;
    }

    if (!silent) {
      updateStatus("Carregando conteúdos...");
    }

    if (accessContents.length === 0) {
      contentPickerReady = false;
      hideContentPicker();
      updateStatus(contentConfigError || "Nenhum conteúdo foi configurado para este acesso.");
      return false;
    }

    contentPickerReady = true;
    renderContentPicker();
    return true;
  }

  function renderContentPicker() {
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    const selectedContent = accessContents.find((item) => item.key === selectedContentKey);

    if (selectedContent) {
      renderRecipientPicker(picker, selectedContent);
      return;
    }

    renderContentsPicker(picker);
  }

  function renderContentsPicker(picker) {
    picker.innerHTML = `
      <p>Escolha o conteúdo:</p>
      <div class="recipient-search">
        <svg class="recipient-search-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="6"></circle>
          <path d="m16 16 4 4"></path>
        </svg>
        <input id="recipient-search" type="search" autocomplete="off" aria-label="Buscar conteúdo" placeholder="Buscar conteúdo..." />
      </div>
      <div id="recipient-actions">
        <ul id="recipient-list" aria-label="Conteúdos"></ul>
        <p id="recipient-empty" role="status" aria-live="polite" hidden>Nenhum conteúdo encontrado.</p>
      </div>
    `;
    attachContentPickerListeners(picker);

    const searchInput = picker.querySelector("#recipient-search");
    const list = picker.querySelector("#recipient-list");
    const emptyState = picker.querySelector("#recipient-empty");

    if (!(searchInput instanceof HTMLInputElement) || !(list instanceof HTMLUListElement) || !(emptyState instanceof HTMLElement)) {
      return;
    }

    searchInput.value = contentQuery;
    const visibleContents = filterContents(accessContents, contentQuery);

    list.innerHTML = visibleContents.map((item) => {
      const key = String(item.key || "");
      const label = String(item.label || key);

      return `
        <li class="recipient-item">
          <button
            class="recipient-option"
            type="button"
            data-content-key="${escapeAttribute(key)}"
            aria-label="Escolher ${escapeAttribute(label)}"
          >
            <span class="recipient-copy">
              <span class="recipient-name">${escapeHtml(label)}</span>
              <span class="recipient-activity">Clique para escolher um destinatário</span>
            </span>
          </button>
        </li>
      `;
    }).join("");
    emptyState.hidden = visibleContents.length > 0;
    picker.style.display = "block";
  }

  function renderRecipientPicker(picker, content) {
    const recipients = Array.isArray(content.recipients) ? content.recipients : [];

    picker.innerHTML = `
      <button id="content-back" class="content-back-button" type="button">← Voltar aos conteúdos</button>
      <p>Escolha o destinatário para <strong>${escapeHtml(content.label)}</strong>:</p>
      <div class="recipient-search">
        <svg class="recipient-search-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="6"></circle>
          <path d="m16 16 4 4"></path>
        </svg>
        <input id="recipient-search" type="search" autocomplete="off" aria-label="Buscar destinatário" placeholder="Buscar destinatário..." />
      </div>
      <div id="recipient-actions">
        <ul id="recipient-list" aria-label="Destinatários"></ul>
        <p id="recipient-empty" role="status" aria-live="polite" hidden>Nenhum destinatário encontrado.</p>
        <p id="recipient-unavailable" role="status" ${recipients.length > 0 ? "hidden" : ""}>Nenhum destinatário está liberado para este conteúdo.</p>
      </div>
    `;
    attachContentPickerListeners(picker);

    const searchInput = picker.querySelector("#recipient-search");
    const list = picker.querySelector("#recipient-list");
    const emptyState = picker.querySelector("#recipient-empty");

    if (!(searchInput instanceof HTMLInputElement) || !(list instanceof HTMLUListElement) || !(emptyState instanceof HTMLElement)) {
      return;
    }

    searchInput.value = recipientQuery;
    const visibleRecipients = filterRecipients(recipients, recipientQuery);

    list.innerHTML = visibleRecipients.map((item) => `
      <li class="recipient-item">
        <button
          class="recipient-option"
          type="button"
          data-content-key="${escapeAttribute(content.key)}"
          data-recipient-key="${escapeAttribute(item.key)}"
          aria-label="Enviar código para ${escapeAttribute(item.label)}"
        >
          <span class="recipient-copy">
            <span class="recipient-name">${escapeHtml(item.label)}</span>
            <span class="recipient-activity">Clique para enviar o código</span>
          </span>
        </button>
      </li>
    `).join("");
    emptyState.hidden = recipients.length === 0 || visibleRecipients.length > 0;
    picker.style.display = "block";
  }

  function attachContentPickerListeners(picker) {
    if (contentPickerListenersAttached) {
      return;
    }

    picker.addEventListener("input", (event) => {
      const target = event.target;

      if (target instanceof HTMLInputElement && target.id === "recipient-search") {
        if (selectedContentKey) {
          recipientQuery = target.value;
        } else {
          contentQuery = target.value;
        }
        renderContentPicker();
      }
    });

    picker.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const backButton = target.closest("#content-back");

      if (backButton instanceof HTMLButtonElement && picker.contains(backButton)) {
        selectedContentKey = "";
        recipientQuery = "";
        renderContentPicker();
        updateStatus("Escolha um conteúdo abaixo para solicitar um novo código.");
        return;
      }

      const recipientButton = target.closest("button[data-recipient-key]");

      if (recipientButton instanceof HTMLButtonElement && picker.contains(recipientButton)) {
        const contentKey = recipientButton.getAttribute("data-content-key");
        const recipientKey = recipientButton.getAttribute("data-recipient-key");

        if (contentKey && recipientKey) {
          void requestCode(contentKey, recipientKey);
        }
        return;
      }

      const button = target.closest("button[data-content-key]");

      if (!(button instanceof HTMLButtonElement) || !picker.contains(button)) {
        return;
      }

      const key = button.getAttribute("data-content-key");

      if (key === null) {
        return;
      }

      selectedContentKey = String(key || "");
      recipientQuery = "";
      renderContentPicker();

      const content = accessContents.find((item) => item.key === selectedContentKey);
      updateStatus(`Escolha o destinatário para ${content?.label || "este conteúdo"}.`);
    });

    picker.addEventListener("keydown", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement) || !target.matches("button[data-content-key], button[data-recipient-key]")) {
        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        target.click();
      }
    });

    contentPickerListenersAttached = true;
  }

  function filterContents(items, query) {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => normalizeSearchText(item.label).includes(normalizedQuery));
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

  function hideContentPicker() {
    const picker = elements.recipientPicker;

    if (!picker) {
      return;
    }

    picker.style.display = "none";
    picker.textContent = "";
    contentQuery = "";
    recipientQuery = "";
    selectedContentKey = "";
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
        ? "Escolha um conteúdo abaixo para solicitar o código e depois valide-o para liberar esta sessão."
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
      let settled = false;
      const finish = (response) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolve(response);
      };
      const timeoutId = globalThis.setTimeout(() => {
        finish({
          ok: false,
          error: "A extensão não respondeu em 30 segundos. Recarregue-a e tente novamente."
        });
      }, MESSAGE_RESPONSE_TIMEOUT_MS);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            finish({
              ok: false,
              error: chrome.runtime.lastError.message || "Falha ao comunicar com a extensao."
            });
            return;
          }

          finish(response);
        });
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error.message : "Falha ao comunicar com a extensao."
        });
      }
    });
  }

  async function refreshLockState() {
    const response = await sendMessage({ type: "lock:getState" });
    await applyLockState(response);
  }

  function startPermissionPolling() {
    if (permissionPollId !== null) {
      return;
    }

    permissionPollId = globalThis.setInterval(async () => {
      const response = await sendMessage({ type: "lock:getState" });

      if (response?.siteAccessGranted !== false) {
        await applyLockState(response);
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
        await ensureContentPicker({ force: true, silent: true });
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
      selectedContentKey = "";
      renderContentPicker();
      updateStatus("Escolha um conteúdo e depois um destinatário para solicitar o código.");
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
