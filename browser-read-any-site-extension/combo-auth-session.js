// Shared by the two extensions. DNR permissions must exist in BOTH extensions.
const COMBO_TRANSIT_HOSTS = ['sso.hotmart.com', 'sso-surrogate.hotmart.com', 'consumer.hotmart.com'];
const COMBO_TRANSIT_ROUTES = ['login', 'logout', 'oidc', 'oauth', 'oauth2', 'auth', 'authorize', 'callback', 'sso'];
const COMBO_TRANSIT_HOTMART_ROOTS = ['club', 'area-de-membros'];
const COMBO_TRANSIT_HOTMART_CALLBACK_PATHS = ['oauth2.0/callbackAuthorize'];
const COMBO_TRANSIT_CALLBACK_HOSTS = ['hotmart.com', ...COMBO_TRANSIT_HOSTS];
const COMBO_TRANSIT_CLUB_AUTH_ROUTES = ['auth/login', 'auth/logout'];
const COMBO_TRANSIT_CLUB_SLUGS = [
  'light-copy','seu-produto-pronto','vendatodosantodianew','superads','reuniao-da-mandala','whatsapp10x',
  'stories-10x','conversao-10x','filosofia-ladeira','melhores-palestras-da-mentoria-fluxo','crescimento-10x','fluxomatic'
];
const COMBO_TRANSIT_CLUB_SLUG_PATTERN = COMBO_TRANSIT_CLUB_SLUGS.join('|');
const COMBO_AUTH_TRANSIT_REGEX =
  '^https://(?:(?:sso\\.hotmart\\.com|sso-surrogate\\.hotmart\\.com|consumer\\.hotmart\\.com)/' +
  '(?:(?:oauth2\\.0/callbackAuthorize)(?:[/?#]|$)|$|[?#]|(?:login|logout|oidc|oauth|oauth2|auth|authorize|callback|sso)(?:[/?#]|$))|' +
  'hotmart\\.com/(?:(?:oauth2\\.0/callbackAuthorize)(?:[/?#]|$)|pt-br/(?:(?:club|area-de-membros)/?(?:[?#]|$)|club/(?:' +
  COMBO_TRANSIT_CLUB_SLUG_PATTERN + ')(?:/?(?:[?#]|$)|/auth/(?:login|logout)(?:[/?#]|$))))';
const COMBO_AUTH_TRANSIT_URL_FILTERS = [
  ...COMBO_TRANSIT_HOSTS.flatMap(host => [
    `|https://${host}/|`, `|https://${host}/?`, `|https://${host}/#`,
    ...COMBO_TRANSIT_ROUTES.flatMap(route => { const root=`|https://${host}/${route}`; return [root+'|',root+'/',root+'?',root+'#']; })
  ]),
  ...COMBO_TRANSIT_HOTMART_ROOTS.flatMap(path => { const root=`|https://hotmart.com/pt-br/${path}`; return [root+'|',root+'?',root+'#',root+'/|',root+'/?',root+'/#']; }),
  ...COMBO_TRANSIT_CALLBACK_HOSTS.flatMap(host => COMBO_TRANSIT_HOTMART_CALLBACK_PATHS.flatMap(path => { const root=`|https://${host}/${path}`; return [root+'|',root+'?',root+'#',root+'/|',root+'/?',root+'/#']; })),
  ...COMBO_TRANSIT_CLUB_SLUGS.flatMap(slug => {
    const root=`|https://hotmart.com/pt-br/club/${slug}`;
    const auth = COMBO_TRANSIT_CLUB_AUTH_ROUTES.flatMap(route => {
      const routeRoot=`${root}/${route}`;
      return [routeRoot+'|', routeRoot+'?', routeRoot+'#', routeRoot+'/|', routeRoot+'/?', routeRoot+'/#'];
    });
    return [root+'|',root+'?',root+'#',root+'/|',root+'/?',root+'/#', ...auth];
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
        condition: { urlFilter, isUrlFilterCaseSensitive: false, resourceTypes: ['main_frame'], tabIds }
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
    clear() { return serial(() => apply({})); },
    snapshot() { return serial(async () => {
      const leases = await read(); await apply(leases); return { ...leases };
    }); }
  };
}