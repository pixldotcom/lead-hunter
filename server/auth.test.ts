import {describe,it,expect} from 'vitest';
import {createServer,request,type IncomingMessage} from 'node:http';
import {createAuth,authConfig,type AuthConfig} from './auth';
import {createApiHandler} from './app';

const config:AuthConfig={username:'fixture-owner',password:'synthetic-test-password-only',secret:'synthetic-session-secret-at-least-32-characters',origin:'http://127.0.0.1:5173',secure:false,ttlSeconds:60};
async function serve(run:(url:string,auth:ReturnType<typeof createAuth>,advance:(ms:number)=>void)=>Promise<void>,settings:Partial<AuthConfig>={}){
 let time=Date.now();let handler:ReturnType<typeof createApiHandler>;
 const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('No test port');
 const url=`http://127.0.0.1:${address.port}`;headers.host=new URL(url).host;headers.origin=url;const auth=createAuth({...config,...settings,origin:url},()=>time);handler=createApiHandler({auth,disableSearch:true});
 try{await run(url,auth,ms=>{time+=ms})}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
}
const headers={host:'127.0.0.1:5173',origin:config.origin,'content-type':'application/json'};
const login=(url:string,password=config.password)=>fetch(url+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({username:config.username,password})});
const cookie=(response:Response)=>response.headers.get('set-cookie')!.split(';')[0];

describe('private login and protected Node handler',()=>{
 it('fails closed without configured credentials and rejects insecure production setup',async()=>{
  for(const env of [{},{AUTH_USERNAME:'u',AUTH_PASSWORD:config.password,AUTH_SESSION_SECRET:config.secret,NODE_ENV:'production',APP_ORIGIN:'http://localhost'},{AUTH_USERNAME:'u',AUTH_PASSWORD:'short',AUTH_SESSION_SECRET:config.secret,APP_ORIGIN:config.origin}])expect(()=>authConfig(env)).toThrow();
  expect(authConfig({AUTH_USERNAME:'u',AUTH_PASSWORD:config.password,AUTH_SESSION_SECRET:config.secret,NODE_ENV:'production',APP_ORIGIN:'https://leads.example.com'})).toMatchObject({secure:true,ttlSeconds:28800});
  const server=createServer(createApiHandler());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();try{expect((await fetch(`http://127.0.0.1:${typeof address==='object'&&address?address.port:0}/api/audit`)).status).toBe(503)}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
 });
 it('protects audit, health, legacy search and unknown APIs before any handler work',async()=>serve(async url=>{
  for(const path of ['/api/audit','/api/health','/api/search','/api/search/status','/api/debug']){const r=await fetch(url+path,{method:'POST',headers,body:'{}'});expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('access-control-allow-origin')).toBeNull()}
  expect((await fetch(url+'/api/auth/session',{headers})).status).toBe(401);
 }));
 it('uses generic errors for invalid username/password and issues an HttpOnly same-site session',async()=>serve(async url=>{
  const wrong=await login(url,'wrong');expect(wrong.status).toBe(401);expect(await wrong.text()).toContain('Incorrect username or password');expect(wrong.headers.get('set-cookie')).toBeNull();
  const wrongUser=await fetch(url+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({username:'other',password:config.password})});expect(wrongUser.status).toBe(401);
  const success=await login(url);expect(success.status).toBe(200);expect(success.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict; Max-Age=60/);const body=await success.text();expect(body).not.toContain(config.password);expect(body).not.toContain(config.secret);
  const session=await fetch(url+'/api/auth/session',{headers:{...headers,cookie:cookie(success)}});expect(await session.json()).toMatchObject({authenticated:true});
  expect((await fetch(url+'/api/health',{headers:{...headers,cookie:cookie(success)}})).status).toBe(200);
  const blocked=await fetch(url+'/api/audit',{method:'POST',headers:{...headers,cookie:cookie(success)},body:JSON.stringify({url:'http://127.0.0.1'})});expect(blocked.status).toBe(400);expect(await blocked.json()).toMatchObject({code:'PROHIBITED_TARGET'});
  expect((await fetch(url+'/api/search/status',{headers:{...headers,cookie:cookie(success)}})).status).toBe(404);
 }));
 it('expires sessions, rejects tampering and invalidates sessions after credential rotation',async()=>serve(async(url,_auth,advance)=>{
  const success=await login(url),token=cookie(success);const altered=token.slice(0,-1)+(token.endsWith('a')?'b':'a');
  expect((await fetch(url+'/api/auth/session',{headers:{...headers,cookie:altered}})).status).toBe(401);
  const rotated=createAuth({...config,password:config.password+'changed'});expect(rotated.session({headers:{cookie:token}} as IncomingMessage)).toBeNull();
  advance(60000);expect((await fetch(url+'/api/auth/session',{headers:{...headers,cookie:token}})).status).toBe(401);
 }));
 it('clears logout cookies without deleting browser data and sets Secure/host-only cookies for HTTPS',async()=>serve(async url=>{
  const success=await login(url);expect(success.headers.get('set-cookie')).toContain('__Host-pixldot-session=');expect(success.headers.get('set-cookie')).toContain('; Secure');expect(success.headers.get('set-cookie')).not.toContain('Domain=');
  const logout=await fetch(url+'/api/auth/logout',{method:'POST',headers,body:'{}'});expect(logout.status).toBe(200);expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');expect(logout.headers.get('clear-site-data')).toBeNull();
 },{secure:true}));
 it('rejects foreign or missing origins, spoofed forwarded origins, wrong hosts and oversized bodies',async()=>serve(async url=>{
  for(const h of [{...headers,origin:'https://evil.example'},{...headers,origin:''},{...headers,'sec-fetch-site':'cross-site'}])expect((await fetch(url+'/api/auth/login',{method:'POST',headers:h,body:'{}'})).status).toBe(403);
  expect((await fetch(url+'/api/auth/login',{method:'POST',headers:{...headers,origin:'https://evil.example','x-forwarded-host':'127.0.0.1:5173'},body:'{}'})).status).toBe(403);
  const wrongHost=await new Promise<number>(resolve=>{const req=request(url+'/api/auth/session',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode??0)});req.end()});expect(wrongHost).toBe(403);
  expect((await fetch(url+'/api/auth/login',{method:'POST',headers,body:'x'.repeat(4097)})).status).toBe(413);
  expect((await fetch(url+'/api/auth/login',{method:'POST',headers,body:'bad json'})).status).toBe(400);
 }));
 it('limits attempts before password work and unlocks after the documented window',async()=>serve(async(url,_auth,advance)=>{
  const responses=await Promise.all(Array.from({length:12},()=>login(url,'wrong')));expect(responses.filter(r=>r.status===401)).toHaveLength(10);expect(responses.filter(r=>r.status===429)).toHaveLength(2);const blocked=await login(url);expect(blocked.status).toBe(429);expect(blocked.headers.get('retry-after')).toBeTruthy();advance(15*60*1000);expect((await login(url)).status).toBe(200);
 }));
});
