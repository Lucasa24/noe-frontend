(() => {
  const BASE_HOST = "hotmart.com";
  const STYLE_ID = "combo-vitalicio-clean-style";
  const ALLOWED_PRODUCT_PATHS = new Set([
    "/pt-br/club/light-copy/products/2438760",
    "/pt-br/club/light-copy/products/2617625",
    "/pt-br/club/seu-produto-pronto/products/5982822",
    "/pt-br/club/vendatodosantodianew/products/1006882",
    "/pt-br/club/superads/products/4468950",
    "/pt-br/club/reuniao-da-mandala/products/4502972",
    "/pt-br/club/whatsapp10x/products/4530858",
    "/pt-br/club/stories-10x/products/1817832",
    "/pt-br/club/conversao-10x/products/4530978",
    "/pt-br/club/filosofia-ladeira/products/3799079",
    "/pt-br/club/melhores-palestras-da-mentoria-fluxo/products/4506254",
    "/pt-br/club/crescimento-10x/products/4530992",
    "/pt-br/club/fluxomatic/products/4159619",
    "/pt-br/club/vendatodosantodianew/products/4956523"
  ]);

  function normalizePath(pathname) {
    return String(pathname || "/").replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function isAllowedPage() {
    try {
      if (location.protocol !== "https:" || location.hostname.toLowerCase() !== BASE_HOST) return false;
      const path = normalizePath(location.pathname);
      for (const allowedPath of ALLOWED_PRODUCT_PATHS) {
        if (path === allowedPath || path.startsWith(allowedPath + "/")) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  if (!isAllowedPage()) return;

  chrome.storage.local.get(["browserReadApproved"], ({ browserReadApproved }) => {
    if (browserReadApproved !== true) return;

    const CSS = `
      .hot-application-menu__icon:has(hot-avatar),
      .hot-application-menu__icon:has([data-test="avatar"]),
      hot-menu-item[data-test="dropdown-button-start"],
      [data-test="avatar-highlight"] {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      [data-test="dropdown-info-user-content"] {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      [data-test="total-points-card"],
      [data-test="position-card"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;

    function injectCSS() {
      const root = document.documentElement || document.head;
      if (!root) return;
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        root.appendChild(style);
      }
      if (style.textContent !== CSS) style.textContent = CSS;
    }

    injectCSS();
    const observer = new MutationObserver(injectCSS);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
