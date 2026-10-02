'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'combo-auth-session.js'), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(authSource + '\nthis.__regex=COMBO_AUTH_TRANSIT_REGEX; this.__filters=COMBO_AUTH_TRANSIT_URL_FILTERS;', context);

const callback = 'https://hotmart.com/oauth2.0/callbackAuthorize?code=test&state=test';
assert(new RegExp(context.__regex, 'i').test(callback), 'callbackAuthorize must stay inside the tab lease');
assert(context.__filters.includes('|https://hotmart.com/oauth2.0/callbackAuthorize?'), 'callback DNR filter missing');

const forbidden = [
  'https://hotmart.com/marketplace',
  'https://hotmart.com/oauth2.0/anything-else',
  'https://example.com/oauth2.0/callbackAuthorize'
];
for (const url of forbidden) {
  assert(!new RegExp(context.__regex, 'i').test(url), 'scope broadened unexpectedly: ' + url);
}

console.log('PASS: exact Hotmart callbackAuthorize is allowed only inside the existing Combo auth lease.');
