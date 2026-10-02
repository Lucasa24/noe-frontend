'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'combo-auth-session.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const context = { console };
vm.createContext(context);
vm.runInContext(authSource + '\nthis.__regex=COMBO_AUTH_TRANSIT_REGEX; this.__filters=COMBO_AUTH_TRANSIT_URL_FILTERS;', context);

const allowed = [
  'https://hotmart.com/pt-br/club/light-copy/auth/login',
  'https://hotmart.com/pt-br/club/light-copy/auth/logout',
  'https://hotmart.com/pt-BR/club/fluxomatic/auth/logout?next=1'
];

for (const url of allowed) {
  assert(new RegExp(context.__regex, 'i').test(url), 'expected allowed auth transit: ' + url);
}

const forbidden = [
  'https://hotmart.com/pt-br/club/light-copy/auth/delete',
  'https://hotmart.com/pt-br/club/unknown-course/auth/logout',
  'https://hotmart.com/pt-br/club/light-copy/settings',
  'https://example.com/pt-br/club/light-copy/auth/logout'
];

for (const url of forbidden) {
  assert(!new RegExp(context.__regex, 'i').test(url), 'unexpectedly broadened auth transit: ' + url);
}

assert(sw.includes('/auth/(?:login|logout)'));
assert(!sw.includes('allowAllRequests'));

console.log('PASS: auth/login + auth/logout only for authorized Combo club slugs.');
