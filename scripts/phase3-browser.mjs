import {authenticateWorkspace} from './browserAuth.mjs';
// Local browser smoke test. Requires Chrome and the frontend at 127.0.0.1:5173.
// Uses a temporary browser profile, never the user's workspace storage.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(join(tmpdir(),'pixldot-phase3-'));
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,seq=0;const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;};
const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(50)}throw Error(`Timed out: ${expression}`)};
const reload=async()=>{await evaluate("document.documentElement.dataset.smokeReload='old'");await send('Page.reload');await wait("document.documentElement?.dataset.smokeReload!=='old'&&!!document.querySelector('.quick-search')")};
const click=async text=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent.trim()===${JSON.stringify(text)}||(b.classList.contains('nav')&&b.textContent.trim().startsWith(${JSON.stringify(text)}))));if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click()})()`);await pause(100)};
const input=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;el.focus();Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await pause(50)};
const blur=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`);await pause(100)};
const data=()=>evaluate("JSON.parse(localStorage.getItem('pixldot-lead-hunter-v1')).leads");
try{
 let target;for(let i=0;i<100;i++){try{const port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');if(target)break}catch{}await pause(100)}
 if(!target)throw Error('Chrome debugging endpoint unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}};
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173'});await authenticateWorkspace({evaluate,input,click,wait});await wait("!!document.querySelector('.quick-search')");
 await evaluate(`(async()=>{const {makeLead,today}=await import('/src/domain.ts');const a=makeLead({name:'Alpha',website:'alpha.example',nextFollowUp:today()});const b=makeLead({name:'Beta Agency',website:'beta.example',type:'Agency',nextFollowUp:today()});localStorage.setItem('pixldot-lead-hunter-v1',JSON.stringify({version:1,leads:[a,b]}))})()`);
 await reload();await wait("!!document.querySelector('.quick-search')");
 await click('Pipeline');await (async()=>{await evaluate("[...document.querySelectorAll('.deal button')].find(b=>b.textContent.includes('Beta Agency')).click()");await pause(100)})();
 assert.equal(await evaluate("document.querySelector('.detailtitle h1')?.textContent"),'Beta Agency');
 await input('[aria-label="Business name"]','Beta Updated');await blur('[aria-label="Business name"]');assert.equal((await data())[1].name,'Beta Updated');
 await input('[aria-label="Website"]','alpha.example');await blur('[aria-label="Website"]');assert.equal((await data())[1].website,'https://beta.example');assert.ok(await evaluate("document.body.textContent.includes('already belongs')"));
 await input('[aria-label="Website"]','beta-new.example');await blur('[aria-label="Website"]');assert.equal((await data())[1].website,'https://beta-new.example');
 await input('.detail-meta select','Replied');let leads=await data();assert.equal(leads[1].stage,'Replied');assert.equal(leads[1].activities.filter(a=>a.type==='Reply received').length,1);assert.equal(leads[0].stage,'New');
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Draft outreach')).click()");await wait("!!document.querySelector('textarea')");assert.ok(await evaluate("document.querySelector('textarea').value.includes('Beta Updated')"));
 await input('textarea','Edited retained message');await click('Overview');await click('Outreach');assert.equal(await evaluate("document.querySelector('textarea').value"),'Edited retained message');
 // Durable drafts: reload, independent lead messages, and intentional replacement.
 const betaId=(await data())[1].id,alphaId=(await data())[0].id;
 await reload();await wait("!!document.querySelector('.quick-search')");await click('Outreach');await input('[aria-label="Outreach lead"]',betaId);await wait("document.querySelector('textarea')?.value==='Edited retained message'");
 await input('[aria-label="Outreach lead"]',alphaId);await click('Generate draft');await input('textarea','Independent Alpha message');
 await input('[aria-label="Outreach lead"]',betaId);assert.equal(await evaluate("document.querySelector('textarea').value"),'Edited retained message');
 await evaluate("window.confirm=()=>false");await click('Generate draft');assert.equal(await evaluate("document.querySelector('textarea').value"),'Edited retained message');
 await evaluate("window.confirm=()=>true");
 await input('[aria-label="Outreach type"]','Direct business');await input('[aria-label="Message purpose"]','Polite follow-up');await click('Generate draft');assert.ok(await evaluate("document.querySelector('textarea').value.includes('check whether')"));
 await reload();await wait("!!document.querySelector('.quick-search')");await click('Outreach');await input('[aria-label="Outreach lead"]',betaId);await wait("!!document.querySelector('textarea')");assert.equal(await evaluate("document.querySelector('[aria-label=\"Outreach type\"]').value"),'Direct business');assert.equal(await evaluate("document.querySelector('[aria-label=\"Message purpose\"]').value"),'Polite follow-up');assert.ok(await evaluate("document.querySelector('textarea').value.includes('check whether')"));
 await input('[aria-label="Outreach lead"]',alphaId);assert.equal(await evaluate("document.querySelector('textarea').value"),'Independent Alpha message');await input('[aria-label="Outreach lead"]',betaId);
 // A quota error retains unsaved edits, leaves leads intact and can be retried.
 const beforeQuota=JSON.stringify(await data());
 await evaluate("window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pixldot-outreach-drafts-v1')throw new DOMException('Quota exceeded','QuotaExceededError');return window.__setItem.call(this,k,v)}");
 await input('textarea','Unsaved quota test');await wait("document.body.textContent.includes('Draft not saved')");assert.equal(JSON.stringify(await data()),beforeQuota);assert.equal(await evaluate("document.querySelector('textarea').value"),'Unsaved quota test');
 await evaluate("Storage.prototype.setItem=window.__setItem");await click('Retry saving drafts');assert.ok(await evaluate("JSON.parse(localStorage.getItem('pixldot-outreach-drafts-v1')).drafts.some(d=>d.body==='Unsaved quota test')"));
 
 await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})");await click('Copy complete draft');await wait("document.body.textContent.includes('Copy failed')");
 await evaluate("window.__message='';URL.createObjectURL=(blob)=>{blob.text().then(t=>window.__message=t);return 'blob:test'};HTMLAnchorElement.prototype.click=function(){};");await click('Download message');await wait("window.__message.includes('Beta Updated')");await evaluate("URL.createObjectURL=()=>{throw Error('blocked')}");await click('Download message');await wait("document.body.textContent.includes('Download failed')");
 await click('Follow-ups');await evaluate("[...document.querySelectorAll('.scheduled')].find(r=>r.textContent.includes('Beta Updated')).querySelector('.rowtext').click()");await wait("document.querySelector('.detailtitle h1')?.textContent==='Beta Updated'");
 await click('Follow-ups');await evaluate("window.prompt=()=> '2026-12-31';[...document.querySelectorAll('.scheduled')].find(r=>r.textContent.includes('Beta Updated')).querySelectorAll('.secondary')[1].click()");await pause(100);leads=await data();assert.equal(leads[1].nextFollowUp,'2026-12-31');assert.notEqual(leads[0].nextFollowUp,'2026-12-31');
 await evaluate("[...document.querySelectorAll('.scheduled')].find(r=>r.textContent.includes('Beta Updated')).querySelector('.secondary').click()");await pause(100);leads=await data();assert.equal(leads[1].nextFollowUp,'');assert.equal(leads[1].activities.filter(a=>a.type==='Follow-up completed').length,1);
 await click('Leads');await input('label select','name');await evaluate("const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Descending');if(b)b.click()");await pause(100);assert.equal(await evaluate("document.querySelector('.tr strong').textContent"),'Alpha');
 // Real timezone emulation covers both UTC date boundaries without changing the host clock.
 for(const [zone,iso,expected] of [['Asia/Kolkata','2026-01-01T20:00:00Z','2026-01-02'],['America/Los_Angeles','2026-01-01T01:00:00Z','2025-12-31']]){await send('Emulation.setTimezoneOverride',{timezoneId:zone});assert.equal(await evaluate(`import('/src/domain.ts').then(m=>m.today(new Date('${iso}')))`),expected)}
 const leadRawBeforeRecovery=await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')");
 await evaluate("localStorage.setItem('pixldot-outreach-drafts-v1','malformed draft data')");await reload();await wait("!!document.querySelector('.quick-search')");await click('Outreach');await wait("document.body.textContent.includes('Drafts could not be loaded')");assert.equal(await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),leadRawBeforeRecovery);
 await evaluate("window.confirm=()=>false");await click('Reset unreadable draft storage');assert.equal(await evaluate("localStorage.getItem('pixldot-outreach-drafts-v1')"),'malformed draft data');
 await evaluate("window.confirm=()=>true");await click('Reset unreadable draft storage');assert.ok(await evaluate("Object.keys(localStorage).some(k=>k.startsWith('pixldot-outreach-drafts-v1-recovery-')&&localStorage.getItem(k)==='malformed draft data')"));assert.equal(await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),leadRawBeforeRecovery);
 console.log('PASS: durable per-lead drafts after reload, independent messages, replacement/cancellation, quota failure/retry, malformed-draft recovery isolation, browser navigation, identity edits/duplicate rejection, intended stage, retained editable handoff, template purpose/type, clipboard failure, complete export content, follow-up association/reschedule/completion, sorting, Kolkata/Los Angeles date boundaries.');
 console.log(`Disposable profile: ${profile}`);
}finally{if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close()}else chrome.kill();}
