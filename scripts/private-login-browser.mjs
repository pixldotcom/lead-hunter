import assert from 'node:assert/strict';
import {launchBrowser} from './browserHarness.mjs';
const base=process.env.PIXLDOT_TEST_URL||'http://127.0.0.1:5173';
const username=process.env.PIXLDOT_TEST_USERNAME,password=process.env.PIXLDOT_TEST_PASSWORD;
if(!username||!password)throw Error('Set synthetic PIXLDOT_TEST_USERNAME and PIXLDOT_TEST_PASSWORD for the isolated test server.');
const b=await launchBrowser();const {send,evaluate,wait,click,input}=b;
const login=async()=>{await input('[name=username]',username);await input('[name=password]',password);await click('Log in');await wait("!!document.querySelector('.quick-search')")};
try{
 await send('Page.navigate',{url:base});await wait("!!document.querySelector('[name=password]')");
 assert.ok(await evaluate("!document.querySelector('.quick-search')"));assert.equal(await evaluate("fetch('/api/audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com'})}).then(r=>r.status)"),401);
 await input('[name=username]',username);await input('[name=password]','wrong-password');await click('Log in');await wait("document.body.textContent.includes('Incorrect username or password')");assert.equal(await evaluate("document.querySelector('[name=password]').value"),'');
 await login();assert.ok(await evaluate("!document.cookie.includes('pixldot-session')"));
 const session=await evaluate("fetch('/api/auth/session').then(r=>r.json())");assert.equal(session.authenticated,true);
 assert.equal(await evaluate("getComputedStyle(document.documentElement).fontSize"),'28px');
 await evaluate(`(async()=>{const {makeLead,createDraft}=await import('/src/domain.ts');const {prepareDraft}=await import('/src/draftPersistence.ts');const {emptyDiscovery,importCandidates}=await import('/src/discovery.ts');const lead=makeLead({name:'Private fixture',website:'private-fixture.example'});localStorage.setItem('pixldot-lead-hunter-v1',JSON.stringify({version:1,leads:[lead]}));const discovery=importCandidates(emptyDiscovery(),[{website:'prospect-fixture.example'}],[],emptyDiscovery().preferences);localStorage.setItem('pixldot-discovery-v1',JSON.stringify(discovery));localStorage.setItem('pixldot-outreach-drafts-v1',JSON.stringify({version:1,drafts:[prepareDraft(createDraft(lead,'Direct business','Initial outreach'))]}))})()`);
 await evaluate("document.documentElement.dataset.loginReload='old'");await send('Page.reload');await wait("document.documentElement.dataset.loginReload!=='old'&&!!document.querySelector('.quick-search')");
 const before=await evaluate('JSON.stringify({...localStorage})');
 await click('Leads');assert.ok(await evaluate("document.body.textContent.includes('Private fixture')"));await click('Outreach');assert.ok(await evaluate("!document.body.textContent.includes('Reset unreadable draft storage')"));
 await click('Log out');await wait("!!document.querySelector('[name=password]')");assert.equal(await evaluate('JSON.stringify({...localStorage})'),before);assert.equal(await evaluate("fetch('/api/health').then(r=>r.status)"),401);assert.ok(await evaluate("!document.querySelector('.content')"));
 await login();assert.equal(await evaluate('JSON.stringify({...localStorage})'),before);
 // Replace the cookie with a malformed token, then recheck through the real server.
 await send('Network.setCookie',{name:'pixldot-session',value:'tampered',url:base,httpOnly:true,sameSite:'Strict',path:'/'});
 await evaluate("window.dispatchEvent(new Event('focus'))");await wait("!!document.querySelector('[name=password]')");assert.equal(await evaluate('JSON.stringify({...localStorage})'),before);
 await login();
 // UI expiry is exercised by a controlled expired session response; server expiry has real clock tests.
 await evaluate("window.__realFetch=window.fetch;window.fetch=async(url,options)=>url==='/api/auth/session'?new Response(JSON.stringify({authenticated:false,error:'Please log in.'}),{status:401}):window.__realFetch(url,options);window.dispatchEvent(new Event('focus'))");await wait("!!document.querySelector('[name=password]')");assert.equal(await evaluate('JSON.stringify({...localStorage})'),before);
 console.log('PASS: private login, invalid credentials, HttpOnly cookie visibility, authenticated reload, blocked anonymous APIs, logout, tampered session and expiry UI; valid lead/discovery/draft fixtures retained. Isolated browser only.');
}finally{await b.close()}
