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
    recipientPickerReady: false,
    recipients: [],
    recipientQuery: "",
    selectedRecipientKey: "",
    recipientPickerListenersAttached: false,
    currentExtensionId: "",
    pixPollingId: null,
    pendingOverlay: null,
    clearedPendingProfileKeys: new Set(),
    pendingProfiles: {}
  };

  const RENEWAL_CLEARANCES_KEY = "renewalClearances";

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

    #recipient-picker {
      display: grid;
      gap: 10px;
    }

    .bras-recipient-search {
      position: relative;
    }

    .bras-recipient-search-icon {
      position: absolute;
      top: 50%;
      left: 12px;
      width: 18px;
      height: 18px;
      color: #94a3b8;
      pointer-events: none;
      transform: translateY(-50%);
    }

    #bras-lock-card #bras-lock-recipient-search {
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 11px 12px 11px 40px;
      border-radius: 10px;
      border: 1px solid #475569;
      background: #020617;
      color: #f8fafc;
      font-size: 16px;
    }

    #bras-lock-card #bras-lock-recipient-search::placeholder {
      color: #94a3b8;
    }

    #bras-lock-recipient-actions {
      display: grid;
      gap: 8px;
      max-height: min(320px, 40vh);
      margin: 0;
      padding: 0 2px 0 0;
      overflow-y: auto;
      scrollbar-color: #475569 transparent;
      scrollbar-width: thin;
    }

    .bras-recipient-item {
      list-style: none;
    }

    .bras-recipient-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 64px;
      gap: 12px;
      padding: 12px;
      border: 1px solid #334155;
      border-radius: 10px;
      background: #111827;
      color: #f8fafc;
      text-align: left;
      cursor: pointer;
      transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
    }

    .bras-recipient-option:hover {
      border-color: #60a5fa;
      background: #172554;
    }

    .bras-recipient-option:focus-visible,
    #bras-lock-recipient-search:focus-visible {
      outline: 3px solid rgba(96, 165, 250, 0.75);
      outline-offset: 2px;
    }

    .bras-recipient-option.is-selected {
      border-color: #3b82f6;
      background: #1d4ed8;
    }

    .bras-recipient-copy {
      display: grid;
      min-width: 0;
      gap: 3px;
    }

    .bras-recipient-name {
      overflow: hidden;
      color: #f8fafc;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bras-recipient-activity {
      color: #cbd5e1;
      font-size: 13px;
      line-height: 1.35;
    }

    .bras-recipient-badge {
      flex: 0 0 auto;
      padding: 4px 7px;
      border-radius: 999px;
      background: #0f766e;
      color: #ecfeff;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    #bras-lock-recipient-empty {
      margin: 0;
      padding: 18px 10px;
      color: #cbd5e1;
      text-align: center;
    }

    @media (max-width: 480px) {
      #bras-lock-overlay {
        align-items: flex-start;
        padding: 12px;
        overflow-y: auto;
      }

      #bras-lock-card {
        margin: auto 0;
        padding: 18px;
      }

      #bras-lock-recipient-actions {
        max-height: 38vh;
      }

      .bras-recipient-option {
        min-height: 60px;
      }
    }

    #bras-lock-pending-overlay {
      display: none;
      margin-top: 14px;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #374151;
      background: rgba(15, 23, 42, 0.95);
    }

    .bras-pending-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
      font-size: 17px;
      font-weight: 700;
      color: #fbbf24;
    }

    .bras-pending-info {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }

    .bras-pending-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(30, 41, 59, 0.7);
      font-size: 14px;
      color: #e2e8f0;
    }

    .bras-pending-info-label {
      color: #94a3b8;
      font-weight: 600;
    }

    .bras-pending-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      font-size: 13px;
      font-weight: 700;
      animation: bras-pulse-badge 2s ease-in-out infinite;
    }

    @keyframes bras-pulse-badge {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .bras-pending-message {
      margin: 12px 0 16px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      font-size: 14px;
      line-height: 1.5;
    }

    .bras-pending-pay-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      gap: 8px;
      padding: 14px;
      border: 0;
      border-radius: 10px;
      background: linear-gradient(135deg, #059669, #10b981);
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 150ms ease, box-shadow 150ms ease;
    }

    .bras-pending-pay-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
    }

    .bras-pending-pay-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .bras-pending-back-button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      padding: 0;
      border: 0;
      background: none;
      color: #94a3b8;
      font-size: 13px;
      cursor: pointer;
      transition: color 150ms ease;
    }

    .bras-pending-back-button:hover {
      color: #e2e8f0;
    }

    .bras-pix-container {
      text-align: center;
    }

    .bras-pix-title {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 17px;
      font-weight: 700;
      color: #34d399;
    }

    .bras-pix-qr-wrapper {
      display: inline-block;
      padding: 12px;
      border-radius: 12px;
      background: #fff;
      margin-bottom: 14px;
    }

    .bras-pix-qr-wrapper img {
      display: block;
      width: 200px;
      height: 200px;
    }

    .bras-pix-copy-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      gap: 6px;
      padding: 10px;
      border: 1px solid #475569;
      border-radius: 10px;
      background: #1e293b;
      color: #e2e8f0;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 150ms ease, background 150ms ease;
    }

    .bras-pix-copy-button:hover {
      border-color: #60a5fa;
      background: #172554;
    }

    .bras-pix-polling {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 14px;
      padding: 10px;
      border-radius: 8px;
      background: rgba(251, 191, 36, 0.1);
      color: #fbbf24;
      font-size: 14px;
      font-weight: 600;
    }

    .bras-pix-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(251, 191, 36, 0.3);
      border-top-color: #fbbf24;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .bras-pix-expired {
      margin-top: 14px;
      padding: 10px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
      font-size: 14px;
      text-align: center;
    }

    .bras-payment-success {
      text-align: center;
    }

    .bras-payment-success-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .bras-payment-success-title {
      font-size: 20px;
      font-weight: 700;
      color: #34d399;
      margin-bottom: 8px;
    }

    .bras-payment-success-text {
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .bras-payment-wait-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border-radius: 10px;
      background: rgba(251, 191, 36, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.3);
      color: #fbbf24;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 18px;
    }

    .bras-support-section {
      display: grid;
      gap: 10px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #374151;
    }

    .bras-support-section-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    .bras-support-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border: 1px solid #374151;
      border-radius: 10px;
      background: #1e293b;
      color: #e2e8f0;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: border-color 150ms ease, background 150ms ease;
    }

    .bras-support-link:hover {
      border-color: #60a5fa;
      background: #172554;
    }

    .bras-support-link-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .bras-support-link-whatsapp {
      border-color: rgba(37, 211, 102, 0.3);
    }

    .bras-support-link-whatsapp:hover {
      border-color: #25d366;
      background: rgba(37, 211, 102, 0.1);
    }

    .bras-recipient-badge-pending {
      flex: 0 0 auto;
      padding: 4px 7px;
      border-radius: 999px;
      background: #991b1b;
      color: #fecaca;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
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
    await loadPendingProfileClearances();
    await loadExtensionConfig();
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
        <div id="bras-lock-pending-overlay"></div>
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
    state.pendingOverlay = overlay.querySelector("#bras-lock-pending-overlay");
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

    state.descriptionText = null;
    state.statusText = null;
    state.input = null;
    state.submitButton = null;
    state.recipientPicker = null;
    state.pendingOverlay = null;
    stopPixPolling();
    state.recipientPickerReady = false;
    state.recipientPickerListenersAttached = false;
    state.recipients = [];
    state.recipientQuery = "";
    state.selectedRecipientKey = "";

    if (state.stopEvents) {
      ["click", "keydown", "keypress", "submit"].forEach((eventName) => {
        document.removeEventListener(eventName, state.stopEvents, true);
      });
      state.stopEvents = null;
    }
  }

  function applyLockState(lockState) {
    state.currentExtensionId = lockState?.extensionId || state.currentExtensionId || "";
    hidePendingOverlay();

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

function getPendingProfile(key) {
  const normalizedKey = String(key || "").trim().toLowerCase();

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
      state.pendingProfiles = {};
      return;
    }

    state.pendingProfiles = normalizePendingProfiles(response.config?.pendingProfiles);
  }

  function normalizePendingProfiles(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value).reduce((result, [key, profile]) => {
      const normalizedKey = String(key || "").trim();

      if (!normalizedKey || !profile || typeof profile !== "object" || Array.isArray(profile)) {
        return result;
      }

      result[normalizedKey] = {
        email: String(profile.email || ""),
        renewalDate: String(profile.renewalDate || ""),
        monthlyPrice: String(profile.monthlyPrice || ""),
        chargeAmountCents: Number(profile.chargeAmountCents || 0),
        supportEmail: String(profile.supportEmail || ""),
        supportWhatsApp: String(profile.supportWhatsApp || "")
      };

      return result;
    }, {});
  }

  async function loadPendingProfileClearances() {
    try {
      const data = await chrome.storage.local.get(RENEWAL_CLEARANCES_KEY);
      const clearances = data[RENEWAL_CLEARANCES_KEY] || {};
      state.clearedPendingProfileKeys = new Set(
        Object.keys(clearances).map((key) => normalizePendingProfileKey(key))
      );
    } catch (_error) {
      state.clearedPendingProfileKeys = new Set();
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
    state.clearedPendingProfileKeys.add(normalizedKey);
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

    state.selectedRecipientKey = recipientKey;
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
    state.input?.focus();
  }

  async function ensureRecipientPicker({ force = false, silent = false } = {}) {
    const picker = state.recipientPicker;

    if (!picker || (state.recipientPickerReady && !force)) {
      return;
    }

    if (!silent) {
      updateStatus("Carregando destinatarios...");
    }

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
      state.recipients = [{ key: "", label: "Enviar codigo", lastSentAt: null }];
      renderRecipientPicker();
      return;
    }

    state.recipientPickerReady = true;
    state.recipients = recipients;
    renderRecipientPicker();
  }

  function renderRecipientPicker() {
    const picker = state.recipientPicker;

    if (!picker) {
      return;
    }

    if (!picker.querySelector("#recipient-picker")) {
      picker.innerHTML = `
        <section id="recipient-picker" aria-label="Escolha do destinatario">
          <p>Escolha o destinatario:</p>
          <div class="bras-recipient-search">
            <svg class="bras-recipient-search-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="6"></circle>
              <path d="m16 16 4 4"></path>
            </svg>
            <input id="bras-lock-recipient-search" type="search" autocomplete="off" aria-label="Buscar destinatário" placeholder="Buscar destinatário..." />
          </div>
          <div id="recipient-actions">
            <ul id="bras-lock-recipient-actions" aria-label="Destinatarios"></ul>
            <p id="bras-lock-recipient-empty" role="status" aria-live="polite" hidden>Nenhum destinatário encontrado.</p>
          </div>
        </section>
      `;
      attachRecipientPickerListeners(picker);
    }

    const searchInput = picker.querySelector("#bras-lock-recipient-search");
    const list = picker.querySelector("#bras-lock-recipient-actions");
    const emptyState = picker.querySelector("#bras-lock-recipient-empty");

    if (!(searchInput instanceof HTMLInputElement) || !(list instanceof HTMLUListElement) || !(emptyState instanceof HTMLElement)) {
      return;
    }

    searchInput.value = state.recipientQuery;
    const sortedRecipients = sortRecipientsByActivity(state.recipients);
    const recipients = filterRecipients(sortedRecipients, state.recipientQuery);
    const mostRecentRecipient = sortedRecipients.find((item) => getRecipientTimestamp(item) > 0);

    list.innerHTML = recipients.map((item) => {
      const key = String(item.key || "");
      const label = String(item.label || key);
      const isSelected = key === state.selectedRecipientKey;
      const isMostRecent = key === mostRecentRecipient?.key;

      return `
        <li class="bras-recipient-item">
          <button
            class="bras-recipient-option${isSelected ? " is-selected" : ""}"
            type="button"
            data-key="${escapeAttribute(key)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="bras-recipient-copy">
              <span class="bras-recipient-name">${escapeHtml(label)}</span>
              <span class="bras-recipient-activity" ${getPendingProfile(key) ? 'style="color:#fca5a5"' : ''}>${getPendingProfile(key) ? escapeHtml("⚠️ Atrasado há " + calculateDaysLate(getPendingProfile(key).renewalDate) + " dias") : escapeHtml(formatRecipientActivity(item.lastSentAt))}</span>
            </span>
            ${getPendingProfile(key) ? '<span class="bras-recipient-badge-pending">⚠️ Renovar</span>' : isMostRecent ? '<span class="bras-recipient-badge">Mais recente</span>' : ""}
          </button>
        </li>
      `;
    }).join("");
    emptyState.hidden = recipients.length > 0;
    picker.style.display = "block";
  }

  function attachRecipientPickerListeners(picker) {
    if (state.recipientPickerListenersAttached) {
      return;
    }

    picker.addEventListener("input", (event) => {
      const target = event.target;

      if (target instanceof HTMLInputElement && target.id === "bras-lock-recipient-search") {
        state.recipientQuery = target.value;
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

    state.recipientPickerListenersAttached = true;
  }

  function sortRecipientsByActivity(recipients) {
    return [...(Array.isArray(recipients) ? recipients : [])]
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

  function filterRecipients(recipients, query) {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return recipients;
    }

    return recipients.filter((item) => normalizeSearchText(item.label).includes(normalizedQuery));
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
    const picker = state.recipientPicker;

    if (!picker) {
      return;
    }

    picker.style.display = "none";
    picker.textContent = "";
    state.recipients = [];
    state.recipientQuery = "";
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

  function calculateDaysLate(renewalDate) {
    const renewal = new Date(renewalDate + "T00:00:00");
    const now = new Date();
    const diffMs = now.getTime() - renewal.getTime();
    const days = Math.floor(diffMs / 86400000);
    return days > 0 ? days : 0;
  }

  function hidePendingOverlay() {
    stopPixPolling();
    if (state.pendingOverlay) {
      state.pendingOverlay.style.display = "none";
      state.pendingOverlay.innerHTML = "";
    }
  }

  function showPendingProfile(profile, recipientKey) {
    const picker = state.recipientPicker;
    if (picker) {
      picker.style.display = "none";
    }

    const overlay = state.pendingOverlay;
    if (!overlay) {
      return;
    }

    const daysLate = calculateDaysLate(profile.renewalDate);
    const renewalFormatted = new Date(profile.renewalDate + "T00:00:00").toLocaleDateString("pt-BR");

    overlay.innerHTML = `
      <div class="bras-pending-header">⚠️ PENDÊNCIA DE RENOVAÇÃO</div>
      <div class="bras-pending-info">
        <div class="bras-pending-info-row">
          <span class="bras-pending-info-label">Perfil</span>
          <span>${escapeHtml(recipientKey)}</span>
        </div>
        <div class="bras-pending-info-row">
          <span class="bras-pending-info-label">E-mail</span>
          <span>${escapeHtml(profile.email)}</span>
        </div>
        <div class="bras-pending-info-row">
          <span class="bras-pending-info-label">Renovação</span>
          <span>${escapeHtml(renewalFormatted)}</span>
        </div>
        <div class="bras-pending-info-row">
          <span class="bras-pending-info-label">Valor</span>
          <span>${escapeHtml(profile.monthlyPrice)} / mês</span>
        </div>
        <div class="bras-pending-info-row">
          <span class="bras-pending-info-label">Status</span>
          <span class="bras-pending-status-badge">⚠️ ATRASADO HÁ ${daysLate} DIAS</span>
        </div>
      </div>
      <div class="bras-pending-message">
        Seu acesso está <strong>BLOQUEADO</strong> por falta de renovação. Pague agora via PIX para regularizar.
      </div>
      <button class="bras-pending-pay-button" id="bras-pending-pay-btn" type="button">
        🟢 PAGAR ${escapeHtml(profile.monthlyPrice)} VIA PIX
      </button>
      <button class="bras-pending-back-button" id="bras-pending-back-btn" type="button">
        ← Voltar aos destinatários
      </button>
    `;

    overlay.querySelector("#bras-pending-pay-btn")?.addEventListener("click", () => {
      void startPixPayment(profile, recipientKey);
    });

    overlay.querySelector("#bras-pending-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      if (picker) {
        picker.style.display = "block";
      }
    });

    overlay.style.display = "block";
    updateStatus("");
  }

  async function startPixPayment(profile, recipientKey) {
    const overlay = state.pendingOverlay;
    if (!overlay) {
      return;
    }

    const payBtn = overlay.querySelector("#bras-pending-pay-btn");
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = "Gerando cobrança...";
    }

    const response = await sendMessage({
      type: "lock:createPixCharge",
      extensionId: state.currentExtensionId,
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
    const overlay = state.pendingOverlay;
    if (!overlay) {
      return;
    }

    overlay.innerHTML = `
      <div class="bras-pix-container">
        <div class="bras-pix-title">💳 PAGAMENTO PIX — ${escapeHtml(profile.monthlyPrice)}</div>
        <p style="color:#cbd5e1;font-size:14px;margin:0 0 14px">Escaneie o QR Code ou copie o código:</p>
        <div class="bras-pix-qr-wrapper">
          <img src="${escapeAttribute(data.qrCodeBase64)}" alt="QR Code PIX" />
        </div>
        <button class="bras-pix-copy-button" id="bras-pix-copy-btn" type="button">📋 Copiar código PIX</button>
        <div class="bras-pix-polling" id="bras-pix-polling-indicator">
          <span class="bras-pix-spinner"></span>
          Aguardando pagamento...
        </div>
        <button class="bras-pending-back-button" id="bras-pix-back-btn" type="button">
          ← Voltar
        </button>
      </div>
    `;

    overlay.querySelector("#bras-pix-copy-btn")?.addEventListener("click", () => {
      void copyPixCode(data.qrCode);
    });

    overlay.querySelector("#bras-pix-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      const picker = state.recipientPicker;
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
      const btn = state.pendingOverlay?.querySelector("#bras-pix-copy-btn");
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

    state.pixPollingId = globalThis.setInterval(async () => {
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
        const indicator = state.pendingOverlay?.querySelector("#bras-pix-polling-indicator");
        if (indicator) {
          indicator.className = "bras-pix-expired";
          indicator.innerHTML = 'QR Code expirado. <button class="bras-pending-back-button" style="margin-top:8px" id="bras-pix-retry-btn" type="button">Gerar novo QR Code</button>';
          state.pendingOverlay?.querySelector("#bras-pix-retry-btn")?.addEventListener("click", () => {
            void startPixPayment(profile, recipientKey);
          });
        }
      }
    }, 5000);
  }

  function stopPixPolling() {
    if (state.pixPollingId !== null) {
      globalThis.clearInterval(state.pixPollingId);
      state.pixPollingId = null;
    }
  }

  function showPaymentSuccess(profile, recipientKey) {
    const overlay = state.pendingOverlay;
    if (!overlay) {
      return;
    }

    overlay.innerHTML = `
      <div class="bras-payment-success">
        <div class="bras-payment-success-icon">✅</div>
        <div class="bras-payment-success-title">PAGAMENTO CONFIRMADO!</div>
        <p class="bras-payment-success-text">
          Seu pagamento de <strong>${escapeHtml(profile.monthlyPrice)}</strong> foi recebido com sucesso.
        </p>
        <div class="bras-payment-wait-badge">Pagamento confirmado. Agora solicite o codigo de acesso.</div>
        <button class="bras-pending-pay-button" id="bras-payment-request-code-btn" type="button">
          Solicitar codigo para ${escapeHtml(recipientKey)}
        </button>
        <button class="bras-pending-back-button" id="bras-payment-back-btn" type="button">
          Voltar aos destinatarios
        </button>
        <div class="bras-support-section">
          <div class="bras-support-section-title">Se precisar, entre em contato:</div>
          <a class="bras-support-link" href="mailto:${escapeAttribute(profile.supportEmail)}">
            <span class="bras-support-link-icon">📧</span>
            Suporte: ${escapeHtml(profile.supportEmail)}
          </a>
          <a class="bras-support-link bras-support-link-whatsapp" href="${escapeAttribute(profile.supportWhatsApp)}" target="_blank" rel="noopener noreferrer">
            <span class="bras-support-link-icon">📱</span>
            Falar no WhatsApp
          </a>
        </div>
      </div>
    `;

    overlay.querySelector("#bras-payment-request-code-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      void requestCode(recipientKey);
    });

    overlay.querySelector("#bras-payment-back-btn")?.addEventListener("click", () => {
      hidePendingOverlay();
      const picker = state.recipientPicker;
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
