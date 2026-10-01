const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const B = 'miipjameglmiodjjgghegcidmkiefmlg', C = 'cccccccccccccccccccccccccccccccc';
const product = 'https://hotmart.com/pt-br/club/light-copy/products/2438760';
const menu = `chrome-extension://${B}/combo-links.html`;
const state = { unlocked:true, contentKey:'combo-vitalicio-leandro-ladeira', recipientKey:'test',
  allowedContentUrl:'https://hotmart.com/pt-br/club/', allowedContentOrigin:'https://hotmart.com', sessionId:'test' };
const report=[];
let checks=0;
function ok(value, label) { assert(value,label); checks++; }
function create(which, baseline=false) {
  const dir=baseline ? path.join(process.env.COMBO_BASELINE_DIR,which) : path.join(__dirname,'..',which==='browser'?'browser-read-any-site-extension':'combo-vitalicio-clean-extension');
  const events={}, dynamic=new Map(), session=new Map(), local={}, memory={}, alarms=new Map(), tabs=new Map(), updates=[];
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  const event=n=>({addListener(fn){(events[n] ||= []).push(fn);}});
  const storage=data=>({async get(k){ if(typeof k==='string')return {[k]:data[k]}; if(Array.isArray(k))return Object.fromEntries(k.map(x=>[x,data[x]])); return {...data}; },async set(x){Object.assign(data,x);},async remove(k){ for(const x of [].concat(k))delete data[x];}});
  const rules=map=>async ({removeRuleIds=[],addRules=[]})=>{for(const id of removeRuleIds)map.delete(id);for(const r of addRules){new RegExp(r.condition.regexFilter);map.set(r.id,r);}};
  const chrome={
    runtime:{id:which==='browser'?B:C,getURL:p=>`chrome-extension://${which==='browser'?B:C}/${p}`,onMessage:event('internal'),onMessageExternal:event('external'),onInstalled:event('installed'),onStartup:event('startup'),sendMessage:async()=>({ok:false})},
    storage:{local:storage(local),session:storage(memory),onChanged:event('storage')},
    tabs:{onCreated:event('created'),onUpdated:event('updated'),onRemoved:event('removed'),onActivated:event('activated'),async query(){return [...tabs.values()];},async get(id){if(!tabs.has(id))throw Error('missing tab');return {...tabs.get(id)};},async update(id,change){updates.push({id,...change});tabs.set(id,{...tabs.get(id),...change});return tabs.get(id);},async reload(){throw Error('unexpected reload');}},
    declarativeNetRequest:{updateDynamicRules:rules(dynamic),updateSessionRules:rules(session),async getDynamicRules(){return [...dynamic.values()];},async getSessionRules(){return [...session.values()];}},
    alarms:{onAlarm:event('alarm'),async clear(n){alarms.delete(n);},async create(n,v){alarms.set(n,v);}},
    action:{onClicked:event('action'),async setBadgeText(){}},
    management:{onEnabled:event('enabled'),onDisabled:event('disabled'),onInstalled:event('management-installed'),onUninstalled:event('uninstalled'),async get(id){return {id,type:'extension',enabled:true,name:id===B?'Browser Read Any Site':'Combo vitalicio'};},async getAll(){return [await this.get(B),await this.get(C)];}},
    windows:{onFocusChanged:event('focus')},permissions:{onAdded:event('permissions-added'),onRemoved:event('permissions-removed')}
  };
  const context=vm.createContext({chrome,console,URL,Set,Map,Date,setTimeout,clearTimeout,fetch:async()=>{throw Error('network disabled');}});
  context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
  let source=fs.readFileSync(path.join(dir,'sw.js'),'utf8').replace('void injectZoomAutomationIntoOpenTabs().catch(() => undefined);','');
  vm.runInContext(source,context);
  context.testState=state;
  if(which==='browser')vm.runInContext('ensureCurrentLockState = async () => testState; getLockState = async () => testState; hasRequiredSiteAccess = async () => true;',context);
  function run(code){return vm.runInContext(code,context);}
  async function external(message,sender){return new Promise((resolve,reject)=>{let handled=false;for(const fn of events.external||[])if(fn(message,sender,resolve)===true)handled=true;if(!handled)resolve(undefined);setTimeout(()=>reject(Error('message timeout')),2000).unref();});}
  return {context,run,chrome,events,dynamic,session,local,memory,alarms,tabs,updates,manifest,external};
}
function action(ext,url,tabId){
  const candidates=[...ext.dynamic.values(),...ext.session.values()].filter(r=>!r.condition.tabIds||r.condition.tabIds.includes(tabId)).filter(r=>new RegExp(r.condition.regexFilter,r.condition.isUrlFilterCaseSensitive?'':'i').test(url));
  candidates.sort((a,b)=>b.priority-a.priority || (a.action.type==='allow'?-1:1));
  return candidates[0]?.action.type||'none';
}
(async()=>{
  if (process.env.COMBO_BASELINE_DIR) {
  const oldB=create('browser',true),oldC=create('combo',true);
  await oldB.run('configureScopedNetworkRules(testState)');
  await oldC.run('enableGate({contentKey:CONTENT_KEY,contentUrl:BASE_URL,browserReadExtensionId:'+JSON.stringify(B)+'})');
  ok(await oldB.run(`isAllowedTabAfterUnlock(1,${JSON.stringify(product)},testState)`),'baseline product accepted');
  ok(action(oldB,product,1)==='allow'&&action(oldC,product,1)==='allow','baseline 14-link example is not blocked directly');
  ok(!(await oldB.run(`isAuthorizedComboCompanionSender({id:${JSON.stringify(C)}})`)),'baseline undefined normalizer rejects sender');
  ok(!oldB.manifest.externally_connectable.ids.includes(C),'baseline manifest prevents Combo messages');
  await oldB.run('setComboAuthTabAuthorized(1,true)');
  await oldB.run(`isAllowedTabAfterUnlock(1,${JSON.stringify(product)},testState)`);
  ok(!(await oldB.run('isComboAuthTabAuthorized(1)')),'baseline product check prematurely revokes lease');
  const login='https://sso.hotmart.com/login';
  ok(action(oldB,login,1)==='block','baseline rule 9101 blocks unprepared SSO');
  oldB.tabs.set(1,{id:1,url:product});
  await oldB.run('enforceLockedTab(1,"about:blank")');
  ok(oldB.updates.some(x=>x.url===menu),'baseline stale tabs event reproduces menu redirect');
  report.push('Baseline: direct product allowed; manifest/normalizer break auth sync; product checks revoke auth; stale event reproduces exact menu fallback.');
  }
  const login='https://sso.hotmart.com/login';
  const b=create('browser'),c=create('combo');
  b.local.comboVitalicioIsolationExtensionId=C;
  function connect(from,to,id){from.chrome.runtime.sendMessage=async(target,message,callback)=>{assert.equal(target,id);const ids=to.manifest.externally_connectable?.ids;if(ids&&!ids.includes('*')&&!ids.includes(from.chrome.runtime.id))throw Error('manifest denied');const result=await to.external(message,{id:from.chrome.runtime.id}); if(callback)callback(result); return result;};}
  connect(b,c,C);connect(c,b,B);
  for(const e of [b,c])e.tabs.set(1,{id:1,url:menu});
  b.context.sender={id:B,url:menu,tab:{id:1,url:menu}};
  await b.run(`openComboProduct(${JSON.stringify(product)},sender)`);
  ok(b.updates.at(-1).url===product,'preflight navigates after both acks');
  ok(await b.run(`isAuthorizedComboCompanionSender({id:${JSON.stringify(C)}})`),'normalizer and stored identity accept companion');
  const urls=[...fs.readFileSync(path.join(__dirname,'../browser-read-any-site-extension/combo-links.html'),'utf8').matchAll(/class="card" href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(urls.length,14);
  for(const url of urls){for(const u of [url,url.replace('/pt-br/','/pt-BR/'),url.split('?')[0]+'/lessons/1']){
    ok(action(b,u,1)==='allow'&&action(c,u,1)==='allow','both extensions allow '+u);
    ok(await b.run(`isAllowedTabAfterUnlock(1,${JSON.stringify(u)},testState)`),'listener allows '+u);
  }}
  ok(await b.run('isComboAuthTabAuthorized(1)'),'product classification does not revoke lease');
  for(const u of [login,'https://sso.hotmart.com/oidc/authorize?state=test','https://sso-surrogate.hotmart.com/login','https://consumer.hotmart.com/auth/callback','https://hotmart.com/pt-BR/club/light-copy/auth/login?realm=club']){
    ok(action(b,u,1)==='allow'&&action(c,u,1)==='allow','prepared auth allowed '+u);
    ok(await b.run(`isAllowedTabAfterUnlock(1,${JSON.stringify(u)},testState)`),'auth listener agrees '+u);
  }
  for(const u of ['https://example.com/','https://hotmart.com/pt-br/club/other/products/1',product+'0',product.replace('https:','http:'),product.replace('hotmart.com','hotmart.com.evil.test'),'https://consumer.hotmart.com/my-products','https://consumer.hotmart.com/course/99']){
    ok(action(b,u,1)==='block'&&action(c,u,1)==='block','unauthorized page remains blocked '+u);
  }
  ok(action(b,login,2)==='block'&&action(c,login,2)==='block','auth is tab-scoped');
  b.tabs.set(1,{id:1,url:product});
  const before=b.updates.length;
  await b.run('enforceLockedTab(1,"about:blank")');
  ok(b.updates.length===before,'stale event cannot redirect new product');
  await Promise.all([b.run('setComboAuthTabAuthorized(2,true)'),b.run('setComboAuthTabAuthorized(3,true)')]);
  ok(await b.run('isComboAuthTabAuthorized(2)')&&await b.run('isComboAuthTabAuthorized(3)'),'concurrent leases survive');
  b.memory.comboAuthLeasesV2[2]=Date.now()-1;
  ok(!(await b.run('isComboAuthTabAuthorized(2)'))&&action(b,login,2)==='block','expired lease removed from DNR');
  await b.run('setComboAuthTabAuthorized(1,false)');await c.run('setLocalAuthTab(1,false)');
  ok(action(b,login,1)==='block'&&action(c,login,1)==='block','auth revocation blocks SSO in both');
  // Reapproval must never reload or redirect a product/auth tab.
  c.tabs.set(1,{id:1,url:login});
  await c.run('enableGate({contentKey:CONTENT_KEY,contentUrl:BASE_URL,browserReadExtensionId:'+JSON.stringify(B)+'})');
  ok(c.updates.length===0,'gate reapproval has no navigation side effects');
  // Invalid state fails closed before navigation/rules preparation.
  b.tabs.set(1,{id:1,url:menu});
  b.context.testState={...state,allowedContentOrigin:'https://evil.test'};
  await assert.rejects(b.run(`openComboProduct(${JSON.stringify(product)},sender)`));checks++;
  b.context.testState=state;
  await assert.rejects(b.run('openComboProduct("https://example.com",sender)'));checks++;
  c.tabs.set(1,{id:1,url:menu});
  b.context.senderNoTab={id:B,url:menu};
  await b.run(`openComboProduct(${JSON.stringify(product)},senderNoTab,1)`);
  ok(b.updates.at(-1).url===product,'extension-page sender without sender.tab supported');
  // Broken cross-extension sync must be reported as failure, not false success.
  c.chrome.runtime.sendMessage=async()=>({ok:false,error:'denied'});
  const failed=await c.run('setAuthFlowForTab(1,true)');
  ok(failed.ok===false&&action(c,login,1)==='block','failed sync rolls back local auth');
  const refused=await b.external({type:'combo-vitalicio:auth-flow',active:true,tabId:1},{id:'dddddddddddddddddddddddddddddddd'});
  ok(refused.ok===false,'other extension identity cannot authorize auth');
  report.push(`Fixed: ${checks} assertions passed, covering all 14 products, auth preflight, two-extension DNR arbitration, stale navigation, concurrent leases, expiry, revoked/foreign tabs, negative URLs and invalid state.`);
  console.log(report.join('\n'));

})().catch(e=>{console.error(e);process.exitCode=1;});

