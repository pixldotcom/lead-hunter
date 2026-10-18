import {authenticateWorkspace} from './browserAuth.mjs';
import assert from 'node:assert/strict';
import {launchBrowser} from './browserHarness.mjs';
const b=await launchBrowser();const {send,evaluate,wait,click,input,pause}=b;
try{
 await send('Page.navigate',{url:process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173'});await authenticateWorkspace({evaluate,input,click,wait});await wait("!!document.querySelector('.external-search select')");
 assert.equal(await evaluate('getComputedStyle(document.documentElement).fontSize'),'28px');await wait("[...document.querySelectorAll('.search-brand-plate img')].length===2&&[...document.querySelectorAll('.search-brand-plate img')].every(img=>img.complete&&img.naturalWidth>0)");
 await input('[aria-label="Search location"]','Pune & Mumbai / \u65e5\u672c');
 const queries=await evaluate("[...document.querySelectorAll('.external-search option')].map(o=>o.textContent)");assert.ok(queries.length>1);
 const before=await evaluate('JSON.stringify({...localStorage})');
 for(let i=0;i<queries.length;i++){await input('[aria-label="Query to search"]',String(i));const links=await evaluate("[...document.querySelectorAll('.search-engine-button')].map(a=>({url:a.href,target:a.target,rel:a.rel,name:a.getAttribute('aria-label')}))");for(let j=0;j<2;j++){const url=new URL(links[j].url);assert.equal(url.hostname,j?'www.bing.com':'www.google.com');assert.equal(url.searchParams.get('q'),queries[i]);assert.equal(links[j].target,'_blank');assert.ok(links[j].rel.includes('noopener'));assert.ok(links[j].name.includes('opens in a new tab'))}}
 // Capture a real new-tab creation without depending on external network navigation.
 await send('Target.setDiscoverTargets',{discover:true});await evaluate("document.querySelector('.search-engine-button').click()");const targets=await send('Target.getTargets');assert.ok(targets.targetInfos.some(t=>t.type==='page'&&t.url.startsWith('https://www.google.com/search')));
 await evaluate("document.querySelector('.search-engine-button:nth-child(2)').click()");const bingTargets=await send('Target.getTargets');assert.ok(bingTargets.targetInfos.some(t=>t.type==='page'&&t.url.startsWith('https://www.bing.com/search')));
 await evaluate("document.querySelector('.search-engine-button').focus()");assert.equal(await evaluate('document.activeElement.className'),'search-engine-button');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await evaluate("document.activeElement.textContent.includes('Search with Bing')"));
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(100);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));assert.equal(await evaluate("getComputedStyle(document.querySelector('.search-engine-buttons')).gridTemplateColumns.split(' ').length"),width===390?1:2)}
 assert.equal(await evaluate('JSON.stringify({...localStorage})'),before);
 await send('Page.bringToFront');await evaluate("document.querySelector('.paste-prospects-link').click()");await pause(100);assert.ok(await evaluate("document.querySelector('.manual-import').open"));assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Candidate URLs');
 await evaluate("[...document.querySelectorAll('.quick-search details')].find(d=>d.textContent.includes('Editable keywords')).open=true");await input('[aria-label="Search keywords"]','');assert.ok(await evaluate("[...document.querySelectorAll('.search-engine-button')].every(b=>b.disabled)"));
 console.log('PASS: every generated variant encoded for Google/Bing, actual new tabs, keyboard focus, 175% desktop/mobile layout, disabled invalid input, manual paste handoff and no storage mutation.');
}finally{await b.close()}
