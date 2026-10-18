import {authenticateWorkspace} from './browserAuth.mjs';
import assert from 'node:assert/strict';
import {launchBrowser} from './browserHarness.mjs';
const b=await launchBrowser();const {send,evaluate,wait,click,input,pause}=b;
const base=process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173';
const data=()=>evaluate("JSON.parse(localStorage.getItem('pixldot-discovery-v1'))");
const card=domain=>`document.querySelector('[data-candidate="${domain}"]')`;
const reload=async()=>{await evaluate("document.documentElement.dataset.smokeReload='old'");await send('Page.reload');await wait("document.documentElement?.dataset.smokeReload!=='old'&&!!document.querySelector('.quick-search')")};
try{
 await send('Page.navigate',{url:base});await authenticateWorkspace({evaluate,input,click,wait});await wait("!!document.querySelector('.quick-search')");
 assert.equal(await evaluate("document.querySelector('h1').textContent"),'Find Websites');assert.ok(await evaluate("!document.querySelector('.welcome')"));
 assert.ok(await evaluate("!document.body.textContent.includes('Brave')&&!document.body.textContent.includes('Automatic search needs setup')"));

 await input('[aria-label="Search location"]','Mumbai');assert.ok(await evaluate("document.querySelector('.query-preview').textContent.includes('dentists Mumbai')"));
 await evaluate("document.querySelector('.manual-import').open=true");await input('[aria-label="Candidate URLs"]','manual.example https://www.manual.example/path');await click('Save pasted websites');
 await wait("!!document.querySelector('[data-candidate=\"manual.example\"]')");assert.equal((await data()).candidates.length,1);assert.equal((await data()).batches[0].duplicates,1);assert.equal((await data()).candidates[0].evidence,null);
 await click('Worth Pursuing',card('manual.example'));assert.equal((await data()).candidates[0].decision,'High priority');assert.equal((await data()).candidates[0].qualifiedAt,'');assert.equal(await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),null);
 await click('Review',card('manual.example'));await input('[aria-label="Manual review notes"]','Human observation only, no automated visual audit.');await input('[aria-label="Review Contact journey"]','Needs work');
 await evaluate("[...document.querySelectorAll('.prospect-review details')].find(d=>d.querySelector('summary')?.textContent==='Add an individual human finding').open=true");await input('[aria-label="Manual finding title"]','Ambiguous contact label');await input('[aria-label="Manual finding evidence"]','The contact link label was unclear in this controlled fixture.');await click('Add finding',card('manual.example'));await click('Save manual review',card('manual.example'));
 assert.equal((await data()).candidates[0].manualReview.findings.length,1);assert.equal((await data()).candidates[0].manualReview.visualInspectionPerformed,false);
 await evaluate("document.querySelector('.audit-tools').open=true");const links=await evaluate("[...document.querySelectorAll('.audit-tools a')].map(a=>({text:a.textContent,url:a.href,target:a.target}))");assert.equal(links.length,4);assert.ok(links.every(l=>l.target==='_blank'&&!l.url.includes('manual.example')));
 await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})");await click('Copy website URL',card('manual.example'));await wait("document.body.textContent.includes('Copy failed')");
 await evaluate("window.__csv='';URL.createObjectURL=blob=>{blob.text().then(t=>window.__csv=t);return 'blob:csv-test'};HTMLAnchorElement.prototype.click=function(){}");await click('Export CSV');await wait("window.__csv.includes('Ambiguous contact label')");assert.ok(await evaluate("window.__csv.includes('High priority')"));
 await evaluate("(()=>{const file=new File([window.__csv],'prospects.csv',{type:'text/csv'});const transfer=new DataTransfer();transfer.items.add(file);const el=document.querySelector('.manual-import input[type=file]');el.files=transfer.files;el.dispatchEvent(new Event('change',{bubbles:true}))})()");await wait("document.body.textContent.includes('0 candidates added; 1 duplicates skipped')");assert.equal((await data()).candidates.length,1);

 await reload();await wait("!!document.querySelector('.quick-search')");assert.equal((await data()).candidates[0].manualReview.notes,'Human observation only, no automated visual audit.');
 await evaluate("document.querySelector('[aria-label=\"Select all visible prospects\"]').click()");await click('Selected: Review Later');assert.ok((await data()).candidates.every(c=>c.decision==='Review later'));
 await click('Skip',card('manual.example'));assert.equal((await data()).candidates.find(c=>c.domain==='manual.example').decision,'Rejected');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(100);assert.ok(await evaluate("document.querySelector('.prospect-card').getBoundingClientRect().width<=390"));assert.ok(await evaluate("[...document.querySelectorAll('.sidebar .nav')].every(el=>getComputedStyle(el).display!=='none')"));
 console.log('PASS: key-free search UI, manual URL dedup, saved review, audit links, CSV roundtrip, reload persistence, bulk decisions and mobile navigation.');console.log(`Disposable profile: ${b.profile}`);
}finally{await b.close()}
