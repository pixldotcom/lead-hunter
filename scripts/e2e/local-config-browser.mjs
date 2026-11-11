// Real local Vite proxy + Node backend + browser. Synthetic config only;
// anonymous checks never contact Supabase or claim a working hosted connection.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {launchBrowser} from './browserHarness.mjs';
const origin='http://127.0.0.1:15173';
if(process.argv.includes('--serve')){
 const {createProductionHandler}=await import('../server/production.ts');
 // Validate the required real dev origin, then relocate only this isolated harness.
 const productionHandler=createProductionHandler(async()=>{
  const app=await import('../server/supabaseApp.ts');
  return {...app,supabaseConfig:()=>({...app.supabaseConfig(),origin})};
 });
 const api=createServer(productionHandler);
 await new Promise(resolve=>api.listen(15174,'127.0.0.1',resolve));
 const {createServer:createViteServer}=await import('vite');
 const vite=await createViteServer({server:{host:'127.0.0.1',port:15173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:15174'}}}});
 await vite.listen();
 await new Promise(()=>{});
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const port of [15173,15174]){
 const {createConnection}=await import('node:net');
 const busy=await new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false))});
 assert.equal(busy,false,`Port ${port} is already occupied; stop the existing local server before this isolated test.`);
}
// Same env-file flags and real app/Vite modules; isolated ports leave the user's dev server running.
const args=['--env-file-if-exists=.env','--env-file-if-exists=.env.local','scripts/local-config-browser.mjs','--serve'];
for(const configured of [false,true]){
 const env={...process.env,NODE_ENV:'development',VERCEL:'',SUPABASE_URL:configured?'https://fixture.supabase.co':'',SUPABASE_PUBLISHABLE_KEY:configured?'sb_publishable_fixture':'',APP_ORIGIN:configured?'http://127.0.0.1:5173':'',OWNER_USER_ID:configured?'11111111-1111-4111-8111-111111111111':'',OWNER_EMAIL:configured?'one@fixture.example':''};
 const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',c=>{logs+=c});child.stderr.on('data',c=>{logs+=c});
 let browser;
 try{
  let ready=false;for(let i=0;i<150;i++){
   if(child.exitCode!==null)throw Error('Development command exited before readiness.');
   try{if((await fetch(origin+'/api/auth/session')).status===(configured?401:503)){ready=true;break}}catch{}
   await pause(100);
  }
  assert(ready,'Local Vite proxy did not become ready.');
  const response=await fetch(origin+'/api/auth/session');
  assert.equal(response.status,configured?401:503);
  assert.equal((await response.json()).code,configured?'AUTH_REQUIRED':'AUTH_CONFIG');
  assert.equal((await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,configured?400:503);
  browser=await launchBrowser();await browser.send('Page.navigate',{url:origin});
  await browser.wait("!!document.querySelector('[name=email]')");
  if(configured){
   assert.equal(await browser.evaluate("document.querySelector('[role=alert]')?.textContent??''"),'');
   // Verify a stale configuration warning clears when a later real 401 arrives.
   await browser.evaluate("window.__realFetch=fetch;window.fetch=async(...args)=>{if(args[0]==='/api/auth/session')return new Response(JSON.stringify({code:'AUTH_CONFIG'}),{status:503,headers:{'content-type':'application/json'}});return window.__realFetch(...args)}");
   await browser.click('Check connection');await browser.wait("document.body.textContent.includes('Cloud access is not configured.')");
   await browser.evaluate('window.fetch=window.__realFetch');await browser.click('Check connection');
   await browser.wait("!document.querySelector('[role=alert]')");
   await browser.evaluate("window.fetch=async()=>{throw TypeError('Controlled network failure')}");
   await browser.click('Check connection');
   await browser.wait("document.body.textContent.includes('Could not verify cloud access. Check your connection and retry.')");
   await browser.evaluate('window.fetch=window.__realFetch');await browser.click('Check connection');
   await browser.wait("!document.querySelector('[role=alert]')");
  }else{
   await browser.wait("document.body.textContent.includes('Cloud access is not configured. Contact the workspace owner.')");
   assert.equal(await browser.evaluate("document.body.textContent.includes('Check your connection and retry.')"),false);
   const diagnostic=logs.split('\n').find(line=>line.includes('"category":"AUTH_CONFIG"'));
   assert(diagnostic,'Missing safe configuration diagnostic.');
   for(const field of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN','OWNER_USER_ID','OWNER_EMAIL'])assert(diagnostic.includes(`"field":"${field}","reason":"missing"`));
  }
  console.log(`PASS: actual local Vite/Node/browser path, ${configured?'valid synthetic configuration: session 401, invalid login body 400, no configuration alert, stale warning clears':'missing configuration: session/login 503 AUTH_CONFIG, explicit UI warning, all missing fields logged safely'}.`);
 }finally{
  if(browser)await browser.close();
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  else child.kill('SIGTERM');
  await pause(600);
 }
}
