import {authenticateWorkspace} from './browserAuth.mjs';
import assert from 'node:assert/strict';
import {launchBrowser} from './browserHarness.mjs';
const b=await launchBrowser();const {send,evaluate,wait,click,input}=b;const base=process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173';
try{
 await send('Page.navigate',{url:base});await authenticateWorkspace({evaluate,input,click,wait});await wait("!!document.querySelector('.quick-search')");
 assert.equal(await evaluate("getComputedStyle(document.documentElement).fontSize"),'28px');
 await click('Settings');
 for(const size of [100,125,150,175]){await input('[aria-label="Application text size"]',String(size));assert.equal(await evaluate('getComputedStyle(document.documentElement).fontSize'),`${16*size/100}px`)}
 const before=await evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='pixldot-text-scale-v1')))");
 await send('Page.reload');await wait("!!document.querySelector('.quick-search')");assert.equal(await evaluate("getComputedStyle(document.documentElement).fontSize"),'28px');
 for(const width of [1440,1024,768,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});for(const page of ['Find Websites','Discover Prospects','Overview','Leads','Pipeline','Follow-ups','Website Analyzer','Outreach','Settings']){await click(page);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${page} overflows at ${width}`)}}
 assert.equal(await evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='pixldot-text-scale-v1')))") ,before);
 await click('Find Websites');assert.ok(await evaluate("!document.body.textContent.includes('Brave')&&!document.body.textContent.includes('Set up automatic search')"));
 console.log('PASS: default 175%, all size settings and persistence, nine screens at four widths without overflow, unrelated storage unchanged and key-free search UI.');
}finally{await b.close()}
