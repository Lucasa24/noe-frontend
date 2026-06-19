(() => {
  const elements = {
    description: document.querySelector("#description"),
    status: document.querySelector("#status"),
    optionsButton: document.querySelector("#options-action"),
    reloadButton: document.querySelector("#reload-action"),
    extensionsButton: document.querySelector("#extensions-action"),
    closeButton: document.querySelector("#close-action")
  };

  init();

  function init() {
    if (elements.description) {
      elements.description.textContent = "A blocked.html nao trava mais a navegacao e pode ser fechada a qualquer momento.";
    }

    updateStatus("Tela de manutencao carregada.");

    elements.optionsButton?.addEventListener("click", () => {
      void openOptionsPage();
    });

    elements.reloadButton?.addEventListener("click", () => {
      reloadExtension();
    });

    elements.extensionsButton?.addEventListener("click", () => {
      void openExtensionsPage();
    });

    elements.closeButton?.addEventListener("click", () => {
      closeCurrentTab();
    });
  }

  function updateStatus(text) {
    if (elements.status) {
      elements.status.textContent = text;
    }
  }

  async function openOptionsPage() {
    try {
      await chrome.runtime.openOptionsPage();
      updateStatus("Pagina de configuracoes aberta.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Nao foi possivel abrir as configuracoes.");
    }
  }

  async function openExtensionsPage() {
    try {
      await chrome.tabs.create({ url: "chrome://extensions/" });
      updateStatus("Gerenciador de extensoes aberto.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Nao foi possivel abrir o gerenciador de extensoes.");
    }
  }

  function reloadExtension() {
    updateStatus("Recarregando a extensao...");
    globalThis.setTimeout(() => {
      chrome.runtime.reload();
    }, 150);
  }

  function closeCurrentTab() {
    try {
      window.close();
      globalThis.setTimeout(() => {
        updateStatus("Se a aba nao fechar sozinha, pode fecha-la manualmente.");
      }, 250);
    } catch (_error) {
      updateStatus("Voce pode fechar esta aba manualmente.");
    }
  }
})();
