'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const OLD = process.env.EXTENSION_EMAIL_MAP;
const OLD_OVERRIDES = process.env.EXTENSION_EMAIL_MAP_OVERRIDES;
const OLD_BLACK = process.env.EXTENSION_EMAIL_MAP_BLACK2026;
const OLD_ALLOWED = process.env.ALLOWED_EXTENSION_IDS;

const CENTRAL = 'nicnjmokndbjnpjlikgmnfkihkklobce';
const PIXEL = 'aachjpoooepljhlphhaplfijppgbjdfp';
const LENDARIA = 'dmenpfckkeafegadpafdndbnhgfmiffb';
process.env.EXTENSION_EMAIL_MAP = JSON.stringify({[CENTRAL]: {Existing:'existing@example.com'}});
process.env.EXTENSION_EMAIL_MAP_OVERRIDES = JSON.stringify({[CENTRAL]: {PreviousOverride:'override@example.com'}});
process.env.EXTENSION_EMAIL_MAP_BLACK2026 = JSON.stringify({
  [CENTRAL]: {XPaiva2016:'x@example.com',FlavioJrEcom:'f@example.com'},
  [PIXEL]: {XPaiva2016:'x@example.com',FlavioJrEcom:'f@example.com'},
  [LENDARIA]: {XPaiva2016:'x@example.com'}
});
process.env.ALLOWED_EXTENSION_IDS = [CENTRAL,PIXEL,LENDARIA].join(',');

const core = require('../lib/access-service-core');
const content = require('../lib/content-access');

test('black 2026 recipients merge additively and preserve prior maps', () => {
  const recipients = core.listRecipientsForExtension(CENTRAL).map(r=>r.key);
  for(const k of ['Existing','PreviousOverride','XPaiva2016','FlavioJrEcom']) assert.ok(recipients.includes(k), k);
  assert.equal(core.resolveRecipientEmail({extensionId:CENTRAL,recipientKey:'XPaiva2016'}),'x@example.com');
  assert.equal(core.resolveRecipientEmail({extensionId:CENTRAL,recipientKey:'Existing'}),'existing@example.com');
});
test('extension-specific recipients do not spread to unrelated extensions', () => {
  const rec = core.listRecipientsForExtension(LENDARIA).map(r=>r.key);
  assert.ok(rec.includes('XPaiva2016'));
  assert.ok(!rec.includes('FlavioJrEcom'));
});
test('content selector limits the added recipients to actual selections', () => {
  const contents=content.getPublicAccessContents(CENTRAL);
  const keys=k=>contents.find(c=>c.key===k).recipients.map(r=>r.key);
  for (const k of ['pixel-ai-hub','claude-code-architect','academy-pass','mkt360-programa-marketing-360-camila-renaux']) {
    assert.ok(keys(k).includes('XPaiva2016'),k);
    assert.ok(keys(k).includes('FlavioJrEcom'),k);
  }
  for(const k of ['ai-coding','dtc-experience']) {
    assert.ok(!keys(k).includes('XPaiva2016'),k);
    assert.ok(keys(k).includes('FlavioJrEcom'),k);
  }
  for(const k of ['dtc-viral-lab','edu-led-growth']) {
    assert.ok(!keys(k).includes('XPaiva2016'),k);
    assert.ok(!keys(k).includes('FlavioJrEcom'),k);
  }
});
test.after(()=>{
 if(OLD===undefined) delete process.env.EXTENSION_EMAIL_MAP; else process.env.EXTENSION_EMAIL_MAP=OLD;
 if(OLD_OVERRIDES===undefined) delete process.env.EXTENSION_EMAIL_MAP_OVERRIDES; else process.env.EXTENSION_EMAIL_MAP_OVERRIDES=OLD_OVERRIDES;
 if(OLD_BLACK===undefined) delete process.env.EXTENSION_EMAIL_MAP_BLACK2026; else process.env.EXTENSION_EMAIL_MAP_BLACK2026=OLD_BLACK;
 if(OLD_ALLOWED===undefined) delete process.env.ALLOWED_EXTENSION_IDS; else process.env.ALLOWED_EXTENSION_IDS=OLD_ALLOWED;
});
