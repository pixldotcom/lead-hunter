import {authenticateWorkspace} from './browserAuth.mjs';
// Controlled browser workflow plus a separately labelled live public URL smoke check.
// No search results are scraped. Chrome uses a new disposable profile.
import assert from 'node:assert/strict';
import {launchBrowser} from './browserHarness.mjs';
const b=await launchBrowser();const {send,evaluate,wait,click,input,pause}=b;
const base=process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173';
const queue=()=>evaluate("JSON.parse(localStorage.getItem('pixldot-discovery-v1'))");
const leads=()=>evaluate("JSON.parse(localStorage.getItem('pixldot-lead-hunter-v1')||'{\"leads\":[]}').leads");
let proposal='';
const card=domain=>`document.querySelector('[data-candidate="${domain}"]')`;
const reload=async()=>{await evaluate("document.documentElement.dataset.smokeReload='old'");await send('Page.reload');await wait("document.documentElement?.dataset.smokeReload!=='old'&&document.querySelector('header')&&document.querySelector('h1')?.textContent==='Find Websites'")};
try{
 await send('Page.navigate',{url:base});await authenticateWorkspace({evaluate,input,click,wait});await wait("document.querySelector('header')&&document.querySelector('h1')?.textContent==='Find Websites'");await click('Discover Prospects');
 await input('[aria-label="Discovery target type"]','Direct business');await input('[aria-label="Candidate source"]','Synthetic public directory fixture');
 await input('[aria-label="Candidate URLs"]','https://www.one.example/path one.example two.example');
 // Only the analyzer response is controlled. UI, processing, persistence and promotion are real.
 await evaluate(`window.__fetch=window.fetch;window.__scans=0;window.fetch=async(url,options)=>{if(url!=='/api/audit')return window.__fetch(url,options);window.__scans++;const website=JSON.parse(options.body).url;return new Response(JSON.stringify({website,submittedUrl:website,status:200,redirects:[],analyzedAt:new Date().toISOString(),htmlVerified:true,title:'<img src=x onerror=window.__injected=1>',description:'Fixture',canonical:website,h1Count:0,viewport:false,wordPress:'WordPress detected',wordPressEvidence:'Generator tag fixture',summary:'Controlled static HTML fixture',findings:[{id:crypto.randomUUID(),title:'H1 not observed',category:'Content',severity:'medium',confidence:'confirmed',explanation:'No H1 in fixture',evidence:'0 H1 elements',pageUrl:website,recommendation:'Review heading structure.',timestamp:new Date().toISOString()}]}),{status:200,headers:{'content-type':'application/json'}})}`);
 await click('Process Candidates');await wait("document.querySelectorAll('[data-candidate]').length===2&&!document.body.textContent.includes('Cancel processing')");
 let data=await queue();assert.equal(data.batches[0].duplicates,1);assert.equal(data.candidates.filter(c=>c.status==='Scanned').length,2);assert.equal((await leads()).length,0);
 await click('Process Candidates');assert.equal(await evaluate('window.__scans'),2);
 await input('[aria-label="Decision for two.example"]','Rejected');
 await input('[aria-label="Candidate URLs"]','two.example');await click('Process Candidates');await wait("!document.body.textContent.includes('Cancel processing')");assert.equal((await queue()).candidates.length,2);assert.equal(await evaluate('window.__scans'),2);
 await click('Review findings & qualify',card('one.example'));assert.ok(await evaluate('!window.__injected'));
 await input('[aria-label="Verified business name"]','Verified Fixture Business');await input('[aria-label="Public contact route URL"]','https://one.example/contact');await input('[aria-label="Contact route evidence"]','Public enquiry form reviewed in fixture');await input('[aria-label="Commercial rationale"]','Clarify the primary service heading and enquiry journey.');
 await evaluate("document.querySelector('[aria-label=\"Service Website fixes\"]').click()");await click('Save review & qualify',card('one.example'));await wait(`${card('one.example')}.textContent.includes('Promote to Leads')`);
 await click('Generate redesign preview',card('one.example'));await wait("!!document.querySelector('iframe.concept-preview')");assert.equal(await evaluate("document.querySelector('iframe').getAttribute('sandbox')"),'');assert.ok(await evaluate("document.querySelector('iframe').srcdoc.includes('PROPOSAL CONCEPT')"));assert.ok(await evaluate("document.querySelector('iframe').srcdoc.includes('Placeholder headline')"));proposal=await evaluate("document.querySelector('iframe').srcdoc");
 await click('Promote to Leads',card('one.example'));await wait(`${card('one.example')}.textContent.includes('Prepare outreach')`);assert.equal((await leads()).length,1);assert.equal((await leads())[0].stage,'Qualified');
 await click('Prepare outreach',card('one.example'));await wait("!!document.querySelector('textarea')");assert.ok(await evaluate("document.querySelector('textarea').value.includes('0 H1 elements')"));assert.ok(await evaluate("document.querySelector('textarea').value.includes('lightweight homepage proposal')"));
 await reload();await wait("document.querySelector('header')&&document.querySelector('h1')?.textContent==='Find Websites'");await click('Discover Prospects');await wait(`${card('one.example')}.textContent.includes('Prepare outreach')`);assert.equal((await queue()).candidates.find(c=>c.domain==='two.example').decision,'Rejected');
 await click('Mark message reviewed',card('one.example'));assert.ok((await queue()).candidates.find(c=>c.domain==='one.example').messageReviewedAt);
 await click('Record actual contact',card('one.example'));assert.equal((await leads())[0].attempts,1);assert.equal((await queue()).candidates.find(c=>c.domain==='one.example').decision,'Already contacted');
 // Discovery failure cannot overwrite the separate lead/draft keys.
 const originalLeads=await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),originalDrafts=await evaluate("localStorage.getItem('pixldot-outreach-drafts-v1')");
 await evaluate("localStorage.setItem('pixldot-discovery-v1','broken')");await reload();await wait("document.querySelector('header')&&document.querySelector('h1')?.textContent==='Find Websites'");await click('Discover Prospects');await wait("document.body.textContent.includes('Discovery needs recovery')");assert.equal(await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),originalLeads);assert.equal(await evaluate("localStorage.getItem('pixldot-outreach-drafts-v1')"),originalDrafts);
 await evaluate('window.confirm=()=>true');await click('Reset unreadable discovery data');await wait("!!document.querySelector('[aria-label=\"Candidate URLs\"]')");assert.ok(await evaluate("Object.keys(localStorage).some(k=>k.startsWith('pixldot-discovery-v1-recovery-')&&localStorage.getItem(k)==='broken')"));
 // Real supported source: user-supplied public URL analysis, not automated search.
 await input('[aria-label="Candidate URLs"]','https://example.com');await click('Process Candidates');await wait("!document.body.textContent.includes('Cancel processing')");data=await queue();const live=data.candidates.find(c=>c.domain==='example.com');console.log(`LIVE URL ANALYSIS: ${live.status}; HTTP ${live.evidence?.status??'not available'}; ${live.error||live.evidence?.summary||''}`);
 if(live.status!=='Scanned')console.log('Live public-site analysis did not succeed in this environment; no live discovery success is claimed.');
 await input('[aria-label="Candidate URLs"]','http://127.0.0.1');await click('Process Candidates');await wait("!document.body.textContent.includes('Cancel processing')");assert.equal((await queue()).candidates.find(c=>c.domain==='127.0.0.1').status,'Error');
 assert.equal(await evaluate("localStorage.getItem('pixldot-lead-hunter-v1')"),originalLeads);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(100);assert.ok(await evaluate("document.querySelector('.prospect-card').getBoundingClientRect().width<=390"));
 await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent(proposal)});await wait("document.body.textContent.includes('PROPOSAL CONCEPT')");assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));console.log('PASS: standalone concept rendered at mobile width without horizontal overflow.');
 console.log('PASS: controlled paste/dedup/scan/cache/reject/qualify/concept/promote/persistent-pitch/contact/reload/recovery workflow; actual local analyzer rejects private target; mobile card width checked. No automatic search provider was tested or claimed.');console.log(`Disposable profile: ${b.profile}`);
}finally{await b.close()}
