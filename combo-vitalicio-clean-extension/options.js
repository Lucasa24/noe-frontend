(() => {
  const CONFIG_KEY = "comboVitalicioAuthConfig";
  const emailInput = document.getElementById("email");
  const secretInput = document.getElementById("secret");
  const secretHint = document.getElementById("secretHint");
  const status = document.getElementById("status");
  const saveButton = document.getElementById("save");

  async function load() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const config = data[CONFIG_KEY] || {};
    emailInput.value = typeof config.email === "string" ? config.email : "";
    secretHint.textContent = config.secret ? "Uma senha já está salva localmente. Deixe em branco para mantê-la." : "Nenhuma senha salva ainda.";
  }

  async function save() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const previous = data[CONFIG_KEY] || {};
    const email = String(emailInput.value || "").trim();
    const typedSecret = String(secretInput.value || "");
    const secret = typedSecret || String(previous.secret || "");

    if (!email || !secret) {
      status.textContent = "Informe o e-mail e a senha da conta Combo Vitalício.";
      return;
    }

    await chrome.storage.local.set({
      [CONFIG_KEY]: {
        email,
        secret,
        enabled: true,
        updatedAt: Date.now()
      }
    });

    secretInput.value = "";
    secretHint.textContent = "Senha salva localmente.";
    status.textContent = "Configuração salva.";
  }

  saveButton.addEventListener("click", () => void save());
  void load();
})();
