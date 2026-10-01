(() => {
  const CONFIG_KEY = "comboVitalicioAuthConfig";
  const STATE_PREFIX = "comboVitalicioAutologinState:";
  const NO_ACCESS_TEXT = "Você está sem acesso a esse conteúdo";
  const SSO_ORIGIN = "https://sso.hotmart.com";
  const AUTH_HOSTS = new Set(["sso.hotmart.com","sso-surrogate.hotmart.com","consumer.hotmart.com"]);
  const ALLOWED_PATHS = new Set([
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
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const RUN_LOCK = "__COMBO_VITALICIO_AUTOLOGIN_RUNNING__";
  const STATUS_ID = "combo-vitalicio-autologin-status";
  const STYLE_ID = "combo-vitalicio-autologin-privacy";
  const TTL = 10 * 60 * 1000;
  let tabIdCache = null;

  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
  const normEmail = (v) => String(v || "").trim().toLowerCase();
  const normPath = (v) => String(v || "/").replace(/\/{2,}/g,"/").replace(/\/+$/,"").toLowerCase();
  const textOf = (el) => el ? (el instanceof HTMLInputElement ? el.value : el.textContent || "") : "";
  const enabled = (el) => !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";

  function isAllowedProductUrl(raw = location.href) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "hotmart.com") return false;
      const p = normPath(u.pathname);
      for (const allowed of ALLOWED_PATHS) if (p === allowed || p.startsWith(allowed + "/")) return true;
      return false;
    } catch (_) { return false; }
  }

  function isSso() {
    return location.origin === SSO_ORIGIN && location.pathname.startsWith("/login");
  }

  function isReturnPage() {
    if (location.protocol !== "https:" || location.hostname.toLowerCase() !== "hotmart.com") return false;
    const p = normPath(location.pathname);
    return p === "/pt-br/club" || p === "/pt-br/area-de-membros";
  }

  function isTransit() {
    return location.protocol === "https:" && AUTH_HOSTS.has(location.hostname.toLowerCase());
  }

  function click(el) {
    if (!el) return false;
    if (typeof el.click === "function") el.click();
    else el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,composed:true}));
    return true;
  }

  function setValue(input, value) {
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto,"value");
    if (d?.set) d.set.call(input,value); else input.value = value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  }

  function waitFor(fn, timeout = 30000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const run = () => {
        let result = null;
        try { result = fn(); } catch (_) {}
        if (result) return resolve(result);
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(run,200);
      };
      run();
    });
  }

  function status(message, tone = "info") {
    let n = document.getElementById(STATUS_ID);
    if (!n) {
      n = document.createElement("div");
      n.id = STATUS_ID;
      Object.assign(n.style,{position:"fixed",top:"16px",left:"50%",transform:"translateX(-50%)",zIndex:"2147483647",padding:"12px 16px",borderRadius:"10px",fontFamily:"system-ui,sans-serif",fontSize:"14px",maxWidth:"760px",boxShadow:"0 8px 30px rgba(0,0,0,.3)"});
      document.documentElement.appendChild(n);
    }
    n.textContent = message;
    n.style.color = "#fff";
    n.style.background = tone === "error" ? "#7f1d1d" : tone === "warning" ? "#78350f" : "#111827";
  }

  function privacy(email = "") {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        input[data-combo-email="1"] { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; text-shadow: none !important; }
        .js-show-password button[data-combo-reveal-blocked="1"] { pointer-events: none !important; opacity: .35 !important; }
        [data-combo-email-summary="1"] { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    for (const input of document.querySelectorAll('input[type="email"],input#username')) input.setAttribute("data-combo-email","1");
    for (const button of document.querySelectorAll(".js-show-password button")) {
      button.setAttribute("data-combo-reveal-blocked","1");
      button.setAttribute("aria-disabled","true");
      button.setAttribute("tabindex","-1");
    }
    const e = normEmail(email);
    if (e) for (const el of document.querySelectorAll("p,span,div,strong,small")) {
      if (el.children.length === 0 && normEmail(el.textContent).includes(e)) el.setAttribute("data-combo-email-summary","1");
    }
  }

  function installRevealGuard() {
    const stop = (ev) => {
      const b = ev.target instanceof Element ? ev.target.closest(".js-show-password button") : null;
      if (!b) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    };
    document.addEventListener("click",stop,true);
    document.addEventListener("mousedown",stop,true);
    document.addEventListener("pointerdown",stop,true);
    document.addEventListener("keydown",(ev) => { if (ev.key === "Enter" || ev.key === " ") stop(ev); },true);
  }

  async function config() {
    const d = await chrome.storage.local.get(CONFIG_KEY);
    const c = d[CONFIG_KEY] || {};
    const email = String(c.email || "").trim();
    const secret = String(c.secret || "");
    return c.enabled !== false && email && secret ? {email,secret} : null;
  }

  async function tabId() {
    if (Number.isInteger(tabIdCache)) return tabIdCache;
    const r = await chrome.runtime.sendMessage({type:"combo-autologin:get-tab-id"}).catch(() => null);
    if (Number.isInteger(r?.tabId)) tabIdCache = r.tabId;
    return tabIdCache;
  }

  async function key() {
    const id = await tabId();
    return Number.isInteger(id) ? STATE_PREFIX + id : null;
  }

  async function readState() {
    const k = await key();
    if (!k) return null;
    const d = await chrome.storage.local.get(k);
    const s = d[k] || null;
    if (s?.updatedAt && Date.now() - s.updatedAt > TTL) { await chrome.storage.local.remove(k); return null; }
    return s;
  }

  async function writeState(patch) {
    const k = await key();
    if (!k) return null;
    const cur = (await readState()) || {};
    const next = {...cur,...patch,updatedAt:Date.now()};
    await chrome.storage.local.set({[k]:next});
    return next;
  }

  async function clearState() {
    const k = await key();
    if (k) await chrome.storage.local.remove(k);
  }

  async function authFlow(active) {
    const id = await tabId();
    if (!Number.isInteger(id)) return false;
    const r = await chrome.runtime.sendMessage({type:"combo-autologin:set-auth-flow",active:active === true,tabId:id}).catch(() => null);
    return r?.ok === true;
  }

  function noAccess() {
    const wanted = norm(NO_ACCESS_TEXT);
    for (const h of document.querySelectorAll("h1")) if (norm(textOf(h)) === wanted) return true;
    return false;
  }

  function menuTrigger() {
    return document.querySelector('hot-dropdown[data-test="structure-header-dropdown"] hot-menu-item[slot="button"][data-test="dropdown-button-start"]')
      || document.querySelector('hot-menu-item[data-test="dropdown-button-start"]')
      || document.querySelector('[data-test="avatar-highlight"]')
      || document.querySelector(".hot-application-menu__icon");
  }

  function accountEmail() {
    const info = document.querySelector('[data-test="dropdown-info-user-content"]');
    if (!info) return null;
    for (const el of info.querySelectorAll("p,span,div,strong,small,a")) {
      if (el.children.length > 0) continue;
      const m = String(el.textContent || "").trim().match(EMAIL_RE);
      if (m) return m[0];
    }
    return null;
  }

  function logoutItem() {
    for (const el of document.querySelectorAll('hot-dropdown-menu-item[data-test="dropdown-items"]')) {
      if (norm(textOf(el)) === "sair") return el;
    }
    return null;
  }

  async function accountState(expected) {
    let email = accountEmail();
    const trigger = menuTrigger();
    if (!email && trigger) {
      click(trigger);
      email = await waitFor(() => accountEmail(),8000);
    }
    if (email) return normEmail(email) === normEmail(expected) ? "correct" : "wrong";
    return trigger ? "unknown" : "logged-out";
  }

  async function logout() {
    const trigger = await waitFor(() => menuTrigger(),10000);
    if (!trigger) return false;
    let item = logoutItem();
    if (!item) { click(trigger); item = await waitFor(() => logoutItem(),10000); }
    if (!item) return false;
    click(item);
    return true;
  }

  function enterButton() {
    const preferred = document.querySelector('button[data-test="button-start"]');
    if (preferred && norm(textOf(preferred)) === "entrar" && enabled(preferred)) return preferred;
    for (const el of document.querySelectorAll('button,a,[role="button"]')) if (norm(textOf(el)) === "entrar" && enabled(el)) return el;
    return null;
  }

  function exactControl(label, root = document) {
    const wanted = norm(label);
    for (const el of root.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"]')) if (enabled(el) && norm(textOf(el)) === wanted) return el;
    return null;
  }

  function inputByLabel(labelText) {
    const wanted = norm(labelText);
    for (const label of document.querySelectorAll("label")) {
      if (norm(textOf(label)) !== wanted) continue;
      const id = label.getAttribute("for");
      const byId = id ? document.getElementById(id) : null;
      if (byId instanceof HTMLInputElement) return byId;
      const nested = label.querySelector("input");
      if (nested instanceof HTMLInputElement) return nested;
    }
    return null;
  }

  function humanCheck() {
    return !!document.querySelector("#amzn-captcha-verify-button") || norm(document.body?.innerText || "").includes("vamos confirmar que voce e humano");
  }

  async function productStep() {
    if (!isAllowedProductUrl()) return;
    let s = await readState();

    if (s?.submittedSecret) {
      await authFlow(false);
      if (!noAccess()) { await clearState(); return; }
      await writeState({active:false,phase:"returned_without_access"});
      status("O login terminou, mas a Hotmart ainda informa que este conteúdo não está liberado para a conta atual.","warning");
      return;
    }

    if (!noAccess()) return;

    const c = await config();
    if (!c) {
      status("Configure as credenciais do Combo Vitalício nas opções da extensão antes de usar o autologin.","error");
      return;
    }

    privacy(c.email);
    if (!s?.active) s = await writeState({active:true,phase:"checking_account",returnUrl:location.href,submittedEmail:false,clickedSecretMode:false,submittedSecret:false});

    const account = await accountState(c.email);
    if (account === "correct") {
      await authFlow(false);
      await writeState({active:false,phase:"correct_account_no_access"});
      status("A conta Combo Vitalício já está conectada. A Hotmart ainda informa que este conteúdo não está liberado para essa conta.","warning");
      return;
    }
    if (account === "unknown") {
      status("Não foi possível confirmar com segurança qual conta Hotmart está conectada.","error");
      return;
    }

    if (!(await authFlow(true))) {
      status("Não foi possível preparar o login nas duas extensões. Atualize Browser Read e Combo Vitalício.", "error");
      return;
    }

    if (account === "wrong") {
      await writeState({phase:"logging_out"});
      if (!(await logout())) {
        status("Não foi possível localizar o botão Sair no menu da Hotmart.","error");
        return;
      }
      await writeState({phase:"logged_out"});
    }

    const enter = await waitFor(() => enterButton(),12000);
    if (enter) {
      await writeState({phase:"waiting_sso"});
      click(enter);
      return;
    }

    location.reload();
  }

  async function ssoStep() {
    if (!isSso()) return;
    const s = await readState();
    if (!s?.active) return;
    const c = await config();
    if (!c) return;

    await authFlow(true);
    privacy(c.email);

    if (humanCheck()) {
      await writeState({phase:"human_verification"});
      status("Conclua a verificação humana nesta mesma aba. O autologin continuará depois; a extensão não tentará contorná-la.","warning");
      return;
    }

    const username = document.querySelector('input#username[name="username"],input#username');
    const emailSubmit = document.querySelector("button#submit-button-enter");
    if (username instanceof HTMLInputElement && emailSubmit && s.submittedEmail !== true) {
      username.setAttribute("data-combo-email","1");
      setValue(username,c.email);
      privacy(c.email);
      await writeState({phase:"after_email",submittedEmail:true});
      click(emailSubmit);
      return;
    }

    const secretMode = exactControl("Entrar com senha");
    if (secretMode && s.clickedSecretMode !== true) {
      await writeState({phase:"secret_mode",clickedSecretMode:true});
      click(secretMode);
      return;
    }

    const emailInput = inputByLabel("Email") || document.querySelector('input[type="email"]');
    const secretInput = inputByLabel("Senha") || document.querySelector('input[type="password"]');
    if (!(secretInput instanceof HTMLInputElement)) return;

    if (emailInput instanceof HTMLInputElement) {
      emailInput.setAttribute("data-combo-email","1");
      setValue(emailInput,c.email);
    }
    secretInput.type = "password";
    setValue(secretInput,c.secret);
    privacy(c.email);

    const fresh = await readState();
    if (fresh?.submittedSecret) return;

    const form = secretInput.closest("form") || emailInput?.closest?.("form") || document;
    const submit = exactControl("Entrar",form);
    if (!submit) return;

    await writeState({phase:"waiting_return",submittedSecret:true});
    click(submit);
  }

  async function returnStep() {
    if (!isReturnPage()) return;
    const s = await readState();
    if (!s?.active || !s?.submittedSecret || !s?.returnUrl) return;
    await authFlow(true);
    try {
      const target = new URL(s.returnUrl);
      if (isAllowedProductUrl(target.href)) location.replace(target.href);
    } catch (_) {}
  }

  async function transitStep() {
    if (!isTransit() || isSso()) return;
    const s = await readState();
    if (s?.active) await authFlow(true);
  }

  async function tick() {
    if (window[RUN_LOCK]) return;
    window[RUN_LOCK] = true;
    try {
      if (isAllowedProductUrl()) await productStep();
      else if (isReturnPage()) await returnStep();
      else if (isSso()) await ssoStep();
      else if (isTransit()) await transitStep();
    } finally {
      window[RUN_LOCK] = false;
    }
  }

  installRevealGuard();
  void tick();
  const observer = new MutationObserver(() => void tick());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer = setInterval(() => void tick(),1000);
  window.addEventListener("pagehide",() => { observer.disconnect(); clearInterval(timer); },{once:true});
})();
