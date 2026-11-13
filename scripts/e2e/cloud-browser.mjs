// Cloud failure and recovery journey using isolated synthetic Auth and PGlite.
// Never connects to a hosted Supabase project or uses production prospects.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {testCloudFixture} from '../testCloudFixture.mjs';
import {launchBrowser} from '../archive/browserHarness.mjs';
import {createSupabaseHandler} from '../../server/supabaseApp.ts';

const fixture=await testCloudFixture(),origin='http://127.0.0.1:5187',root=resolve('dist');
const handler=createSupabaseHandler({origin,url:'https://fixture.supabase.co',key:'sb_publishable_fixture',secure:false,ownerUserId:fixture.users[0].id,ownerEmail:fixture.users[0].email},{client:fixture.client});
const settings=JSON.parse(await readFile('vercel.json','utf8'));let failWorkspaceRead=false;
const server=createServer(async(req,res)=>{for(const h of settings.headers[0].headers)res.setHeader(h.key,h.value);const path=new URL(req.url??'/',origin).pathname;if(path==='/api/workspace'&&req.method==='GET'&&failWorkspaceRead){failWorkspaceRead=false;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Synthetic workspace loading failure'}));return}if(path.startsWith('/api/'))return handler(req,res);const file=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}try{const data=await readFile(file);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(5187,'127.0.0.1',r));const browsers=[];
async function browser(){const b=await launchBrowser();browsers.push(b);await b.send('Page.navigate',{url:origin});await b.wait("!!document.querySelector('[name=email]')");return b}
async function login(b){await b.input('[name=email]',fixture.users[0].email);await b.input('[name=password]',fixture.users[0].password);await b.click('Log in')}
async function importBusiness(b,line){await b.input('.quick-import-panel textarea',line);await b.click('Review import');await b.wait("document.body.textContent.includes('Review 1 business')");await b.click('Save to workspace')}
async function captureDownload(b){await b.evaluate("window.__download='';window.__originalURLCreateObjectURL??=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.text().then(text=>window.__download=text);return window.__originalURLCreateObjectURL(blob)}")}
try{
 const first=await browser();assert.equal(await first.evaluate("fetch('/api/workspace').then(r=>r.status)"),401);
 await login(first);await first.wait("!!document.querySelector('.quick-import-panel')");
 await importBusiness(first,'Cloud fixture prospect | Leeds | https://cloud-fixture.example');
 await first.wait("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==='Cloud fixture prospect'))");
 await captureDownload(first);await first.click('Export full cloud backup');await first.wait("window.__download.includes('Cloud fixture prospect')");

 fixture.fail();await importBusiness(first,'Failed save prospect | Leeds | https://failed-save-fixture.example');
 await first.wait("document.querySelector('.cloud-status-label')?.textContent==='Not saved to cloud'");
 assert.equal(await first.evaluate("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==='Failed save prospect'))"),false,'failed write must not be reported as saved');
 await first.click('Retry pending save');await first.wait("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==='Failed save prospect'))");

 const other=await browser();await login(other);await other.wait("!!document.querySelector('.quick-import-panel')");
 await importBusiness(other,'Concurrent update prospect | Leeds | https://concurrent-fixture.example');
 await other.wait("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==='Concurrent update prospect'))");
 await importBusiness(first,'Stale revision prospect | Leeds | https://stale-revision-fixture.example');
 await first.wait("document.querySelector('.cloud-status')?.textContent.includes('Cloud records changed in another browser')");
 assert.equal(await first.evaluate("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==='Stale revision prospect'))"),false,'revision conflict must not overwrite newer cloud data');
 await first.evaluate('window.confirm=()=>true');await first.click('Log out');await first.wait("!!document.querySelector('[name=email]')");
 failWorkspaceRead=true;await login(first);await first.wait("document.querySelector('.private-login [role=alert]')?.textContent.includes('Synthetic workspace loading failure')");
 await captureDownload(first);await first.click('Download original cloud data');await first.wait("window.__download.includes('Concurrent update prospect')");
 await first.click('Retry loading');await first.wait("!!document.querySelector('.quick-import-panel')");
 console.log('PASS: cloud backup export, server-error save without false success, retry, revision-conflict protection and loading-recovery UI. Synthetic Supabase fixture only.');
}catch(error){console.log('Cloud recovery diagnostic:',await browsers.at(-1)?.evaluate("document.querySelector('.cloud-status')?.textContent||document.querySelector('[role=alert]')?.textContent||document.querySelector('h1')?.textContent"));throw error}
finally{for(const b of browsers)await b.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fixture.close()}
