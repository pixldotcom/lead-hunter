import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function launchBrowser(){
 const profile=await mkdtemp(join(tmpdir(),'pixldot-discovery-'));
 const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const pause=ms=>new Promise(r=>setTimeout(r,ms));let target,ws,seq=0;const pending=new Map();
 try{
  for(let i=0;i<100;i++){try{const port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');if(target)break}catch{}await pause(100)}
  if(!target)throw Error('Disposable Chrome profile did not start.');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
 }catch(e){child.kill();throw e}
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`))},50000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const wait=async expression=>{for(let i=0;i<500;i++){if(await evaluate(expression))return;await pause(100)}throw Error(`Timed out waiting for: ${expression}`)};
 const click=async(text,scope='document')=>{await evaluate(`(()=>{const el=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.click()})()`);await pause(100)};
 const input=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input '+${JSON.stringify(selector)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;el.focus();Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await pause(100)};
 const close=async()=>{try{if(ws.readyState===1)await send('Browser.close')}catch{}finally{ws.close();for(const p of pending.values())clearTimeout(p.timer)}};
 await send('Page.enable');await send('Runtime.enable');return {profile,send,evaluate,wait,click,input,pause,close};
}
