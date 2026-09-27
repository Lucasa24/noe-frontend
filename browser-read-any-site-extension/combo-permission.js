(() => {
  const button = document.getElementById("allowRead");
  const status = document.getElementById("status");

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false });
      });
    });
  }

  async function refresh() {
    const response = await sendMessage({ type: "combo:getReadPermission" });

    if (response?.granted === true) {
      status.textContent = "Leitura já permitida. Fechando...";
      button.disabled = true;
      const granted = await sendMessage({ type: "combo:grantReadPermission" });
      if (!granted?.ok) {
        status.textContent = granted?.error || "Não foi possível fechar esta página.";
      }
      return;
    }

    if (response?.siteAccessGranted === false) {
      status.textContent = 'Ative "Em todos os sites" nas permissões do Browser Read e tente novamente.';
    }
  }

  button?.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Confirmando permissão de leitura...";

    const response = await sendMessage({ type: "combo:grantReadPermission" });

    if (!response?.ok) {
      button.disabled = false;
      status.textContent = response?.error || "Não foi possível permitir a leitura.";
      return;
    }

    status.textContent = "Permissão confirmada. Fechando esta página...";
  });

  void refresh();
})();
