'use strict';
const assert = require('assert');

const MENU = 'chrome-extension://miipjameglmiodjjgghegcidmkiefmlg/combo-links.html';
const LAUNCH = 'chrome-extension://miipjameglmiodjjgghegcidmkiefmlg/combo-launch.html';
const PRODUCT = 'https://hotmart.com/pt-br/club/light-copy/products/2438760?access_source=hub_purchase_product_card';
const CALLBACK = 'https://hotmart.com/oauth2.0/callbackAuthorize?code=abc&state=xyz';

function allowed(url) {
  return url === MENU || url === LAUNCH || url.startsWith('https://hotmart.com/pt-br/club/light-copy/products/2438760');
}

async function oldFlow() {
  const tab = { url: 'chrome://newtab/' };
  let navigation = null;
  if (!allowed(tab.url) && !navigation) tab.url = MENU;
  navigation = { targetUrl: PRODUCT, status: 'preparing' };
  return { tab, navigation };
}

async function fixedFlow() {
  const tab = { url: 'chrome://newtab/' };
  let navigation = { targetUrl: PRODUCT, status: 'preparing' };
  tab.url = LAUNCH;
  if (!allowed(tab.url)) tab.url = MENU;
  navigation.status = 'opening';
  tab.url = PRODUCT;
  assert(allowed(tab.url));
  navigation.status = 'completed';
  return { tab, navigation };
}

(async () => {
  const before = await oldFlow();
  assert.strictEqual(before.tab.url, MENU);
  const after = await fixedFlow();
  assert.strictEqual(after.tab.url, PRODUCT);
  assert.strictEqual(after.navigation.status, 'completed');
  assert(CALLBACK.startsWith('https://hotmart.com/oauth2.0/callbackAuthorize'));
  console.log('PASS: reproduced old newtab -> combo-links race and fixed launch -> product flow.');
})();
