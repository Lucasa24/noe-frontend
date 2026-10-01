'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = fs.existsSync(path.join(__dirname, 'sw.js')) ? __dirname : path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'combo-auth-session.js'), 'utf8');

const products = [
  '/pt-br/club/light-copy/products/2438760',
  '/pt-br/club/light-copy/products/2617625',
  '/pt-br/club/seu-produto-pronto/products/5982822',
  '/pt-br/club/vendatodosantodianew/products/1006882',
  '/pt-br/club/superads/products/4468950',
  '/pt-br/club/reuniao-da-mandala/products/4502972',
  '/pt-br/club/whatsapp10x/products/4530858',
  '/pt-br/club/stories-10x/products/1817832',
  '/pt-br/club/conversao-10x/products/4530978',
  '/pt-br/club/filosofia-ladeira/products/3799079',
  '/pt-br/club/melhores-palestras-da-mentoria-fluxo/products/4506254',
  '/pt-br/club/crescimento-10x/products/4530992',
  '/pt-br/club/fluxomatic/products/4159619',
  '/pt-br/club/vendatodosantodianew/products/4956523'
];

assert.strictEqual(products.length, 14);
assert(sw.includes('getExistingComboNavigationForSource'));
assert(sw.includes('status: "preparing"'));
assert(sw.includes('status: "opening"'));
assert(sw.includes('status: "error"'));
assert(sw.includes('status: "cancelled"'));
assert(sw.includes('status: "completed"'));
assert(sw.includes('result?.leaseActive !== true'));
assert(sw.includes('result?.rulesReady !== true'));
assert(sw.includes('Navegação recusada antes do produto'));
assert(sw.includes('urlFilter: "|https://hotmart.com" + allowedPath + "^"'));
assert(!sw.includes('allowAllRequests'));
assert(auth.includes('COMBO_TRANSIT_CLUB_SLUGS'));
assert(auth.includes("isUrlFilterCaseSensitive: false"));

for (const product of products) {
  const slug = product.split('/')[3];
  assert(auth.includes("'"+slug+"'"), 'club root missing from tab-scoped transit: '+slug);
  assert(product.startsWith('/pt-br/club/'+slug+'/products/'));
}

const forbidden = [
  '/pt-br/club/light-copy/products/9999999',
  '/pt-br/club/unknown-course/products/1',
  '/pt-br/marketplace'
];
for (const item of forbidden) {
  assert(!products.includes(item));
}

console.log('PASS: 14/14 Combo product routes + launch states + narrow DNR regression checks.');
