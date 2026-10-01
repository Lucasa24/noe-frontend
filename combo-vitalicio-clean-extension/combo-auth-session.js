// Shared by the two extensions. DNR permissions must exist in BOTH extensions.
const COMBO_TRANSIT_HOSTS = ['sso.hotmart.com', 'sso-surrogate.hotmart.com', 'consumer.hotmart.com'];
const COMBO_TRANSIT_ROUTES = ['login', 'logout', 'oidc', 'oauth', 'oauth2', 'auth', 'authorize', 'callback', 'sso'];
const COMBO_TRANSIT_HOTMART_ROOTS = ['club', 'area-de-membros'];

// JS listeners use this only for classification, with the i flag to mirror
// DNR's case-insensitive urlFilter. It is never passed as a DNR regexFilter.
const COMBO_AUTH_TRANSIT_REGEX =
  '^https://(?:(?:sso\\.hotmart\\.com|sso-surrogate\\.hotmart\\.com|consumer\\.hotmart\\.com)/' +
  '(?:$|[?#]|(?:login|logout|oidc|oauth|oauth2|auth|authorize|callback|sso)(?:[/?#]|$))|' +
  'hotmart\\.com/pt-br/(?:club|area-de-membros)/?(?:[?#]|$))';

// Keep DNR free of regexFilter. Chrome's RE2 compiled-size limit can reject even a
// short-looking expression, which left the click waiting on a missing allow rule.
const COMBO_AUTH_TRANSIT_URL_FILTERS = [
  ...COMBO_TRANSIT_HOSTS.flatMap(host => [
    `|https://${host}/|`, `|https://${host}/?`, `|https://${host}/#`,
    ...COMBO_TRANSIT_ROUTES.flatMap(route => {
      const root = `|https://${host}/${route}`;
      return [root + '|', root + '/', root + '?', root + '#'];
    })
  ]),
  ...COMBO_TRANSIT_HOTMART_ROOTS.flatMap(path => {
    const root = `|https://hotmart.com/pt-br/${path}`;
    return [root + '|', root + '?', root + '#', root + '/|', root + '/?', root + '/#'];
  })
];

function createComboAuthSessions(ruleId) {
  const key = 'comboAuthLeasesV2';
  const alarm = 'combo-auth-expiry';
  const ruleIds = COMBO_AUTH_TRANSIT_URL_FILTERS.map((_, index) => ruleId + index);
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
      removeRuleIds: ruleIds,
      addRules: tabIds.length ? COMBO_AUTH_TRANSIT_URL_FILTERS.map((urlFilter, index) => ({
        id: ruleId + index, priority: 300, action: { type: 'allow' },
        condition: { urlFilter, resourceTypes: ['main_frame'], tabIds }
      })) : []
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
