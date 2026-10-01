// Shared by the two extensions. DNR permissions must exist in BOTH extensions.
const COMBO_AUTH_TRANSIT_REGEX = '^https://(?:(?:sso\\.hotmart\\.com|sso-surrogate\\.hotmart\\.com|consumer\\.hotmart\\.com)/(?:$|[?#]|(?:login|logout|oidc|oauth|oauth2|auth|authorize|callback|sso)(?:[/?#]|$))|hotmart\\.com/[pP][tT]-[bB][rR]/(?:club/?(?:[?#]|$)|area-de-membros/?(?:[?#]|$)))';

function createComboAuthSessions(ruleId) {
  const key = 'comboAuthLeasesV2';
  const alarm = 'combo-auth-expiry';
  let queue = Promise.resolve();
  function serial(task) {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  }
  async function apply(leases) {
    const now = Date.now();
    for (const id of Object.keys(leases)) if (leases[id] <= now) delete leases[id];
    const tabIds = Object.keys(leases).map(Number);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: tabIds.length ? [{ id: ruleId, priority: 300, action: { type: 'allow' },
        condition: { regexFilter: COMBO_AUTH_TRANSIT_REGEX, resourceTypes: ['main_frame'], tabIds } }] : []
    });
    await chrome.storage.session.set({ [key]: leases });
    await chrome.alarms.clear(alarm);
    if (tabIds.length) await chrome.alarms.create(alarm, { when: Math.min(...Object.values(leases)) });
  }
  async function read() { return (await chrome.storage.session.get(key))[key] || {}; }
  chrome.alarms.onAlarm.addListener(info => {
    if (info.name === alarm) void serial(async () => apply(await read())).catch(console.error);
  });
  return {
    set(tabId, active) {
      if (!Number.isInteger(tabId) || tabId < 0) return Promise.resolve(false);
      return serial(async () => {
        const leases = await read();
        if (active && !(leases[tabId] > Date.now())) leases[tabId] = Date.now() + 10 * 60 * 1000;
        if (!active) delete leases[tabId];
        await apply(leases);
        return true;
      });
    },
    has(tabId) { return serial(async () => {
      const leases = await read();
      await apply(leases);
      return leases[tabId] > Date.now();
    }); },
    clear() { return serial(() => apply({})); }
  };
}
