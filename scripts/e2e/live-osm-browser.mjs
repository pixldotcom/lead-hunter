// Live discovery check with real public OSM results saved only into disposable PGlite.
// No fabricated candidates and no hosted/prod database access.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {testCloudFixture} from '../testCloudFixture.mjs';
import {launchBrowser} from '../archive/browserHarness.mjs';
import {createSupabaseHandler} from '../../server/supabaseApp.ts';
import discover from '../../api/discover.ts';

const fixture=await testCloudFixture(),root=resolve('dist'),probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const cloud=createSupabaseHandler({origin,url:'https://fixture.supabase.co',key:'sb_publishable_fixture',secure:false,ownerUserId:fixture.users[0].id,ownerEmail:fixture.users[0].email},{client:fixture.client});
const server=createServer(async(req,res)=>{const path=new URL(req.url??'/',origin).pathname;if(path==='/api/discover')return discover(req,res);if(path.startsWith('/api/'))return cloud(req,res);const file=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}try{const data=await readFile(file);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));let browser;
try{
 browser=await launchBrowser();await browser.send('Page.navigate',{url:origin});await browser.wait("!!document.querySelector('[name=email]')");
 await browser.input('[name=email]',fixture.users[0].email);await browser.input('[name=password]',fixture.users[0].password);await browser.click('Log in');await browser.wait("!!document.querySelector('.quick-import-panel')");
 await browser.evaluate("document.querySelector('.experimental-osm').open=true");
 await browser.input('.experimental-osm input[list="v2-discovery-categories"]','dentist');await browser.input('.experimental-osm .formgrid label:nth-child(2) input','Leeds');await browser.click('Find businesses');
 await browser.wait("document.querySelectorAll('.discovery-review-card').length>0");
 const candidates=await browser.evaluate("[...document.querySelectorAll('.discovery-review-card')].map(card=>({name:card.querySelector('strong')?.textContent?.trim(),location:card.querySelector('small')?.textContent?.trim(),sourceUrl:card.querySelector('a[href*='+'\"openstreetmap.org/\"'+']')?.href}))");
 const candidate=candidates.find(value=>value.name&&(/(?:^|,\s*)leeds$/i).test(value.location??'')&&value.sourceUrl?.includes('openstreetmap.org/'));
 assert.ok(candidate,`live search should expose a reviewable Leeds OSM candidate; received ${JSON.stringify(candidates)}`);
 await browser.click('Clear selection');await browser.evaluate("(()=>{const card=[...document.querySelectorAll('.discovery-review-card')].find(item=>item.querySelector('strong')?.textContent?.trim()==="+JSON.stringify(candidate.name)+");if(!card)throw Error('Live candidate disappeared');const checkbox=card.querySelector('input[type=checkbox]');checkbox.click();const auto=[...document.querySelectorAll('.experimental-osm-body label')].find(label=>label.textContent.includes('Analyze newly imported businesses automatically'))?.querySelector('input[type=checkbox]');if(auto?.checked)auto.click()})()");
 await browser.pause(150);
 await browser.click('Import 1 selected businesses');
 await browser.wait("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.some(b=>b.name==="+JSON.stringify(candidate.name)+"&&b.sourceUrl==="+JSON.stringify(candidate.sourceUrl)+"))");
 const saved=await browser.evaluate("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.find(b=>b.name==="+JSON.stringify(candidate.name)+"&&b.sourceUrl==="+JSON.stringify(candidate.sourceUrl)+"))");
 await browser.send('Page.reload');await browser.wait("document.querySelector('.opportunities-page h1')?.textContent==='Business Opportunities'");
 await browser.send('Page.navigate',{url:origin+'/#/pipeline'});await browser.wait("document.querySelector('.pipeline-page h1')?.textContent==='Pipeline'&&document.body.textContent.includes("+JSON.stringify(candidate.name)+")");
 const afterReload=await browser.evaluate("fetch('/api/workspace').then(r=>r.json()).then(r=>r.data.discovery.businesses.find(b=>b.id==="+JSON.stringify(saved.id)+"))");
 assert.equal(afterReload?.sourceUrl,candidate.sourceUrl,'live candidate and its OSM reference must persist after reload');
 console.log(`PASS: live OSM candidate reviewed/imported/saved/reloaded in isolated cloud fixture: ${candidate.name} (${candidate.sourceUrl}).`);
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fixture.close()}
