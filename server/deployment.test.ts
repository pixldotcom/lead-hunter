import {afterEach,expect,it,vi} from 'vitest';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';

const factory=vi.hoisted(()=>({client:null as null|((token?:string)=>unknown)}));
vi.mock('@supabase/supabase-js',()=>({createClient:(_url:string,_key:string,options?:{global?:{headers?:Record<string,string>}})=>factory.client!(options?.global?.headers?.Authorization?.slice(7))}));
afterEach(()=>vi.unstubAllEnvs());
it('runs the actual Vercel entry points with parsed bodies and enforces HTTPS-origin authentication',async()=>{
 // @ts-expect-error Executable test fixture module.
 const {testCloudFixture}=await import('../scripts/testCloudFixture.mjs');const fixture=await testCloudFixture();factory.client=fixture.client;
 vi.stubEnv('SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_fixture');vi.stubEnv('APP_ORIGIN','https://leads.example.com');vi.stubEnv('VERCEL','1');
 const routes:Record<string,(req:IncomingMessage & {body?:unknown},res:ServerResponse)=>Promise<void>>={
  '/api/auth/login':(await import('../api/auth/login')).default,
  '/api/auth/logout':(await import('../api/auth/logout')).default,
  '/api/auth/session':(await import('../api/auth/session')).default,
  '/api/health':(await import('../api/health')).default,
  '/api/audit':(await import('../api/audit')).default,
 };
 const server=createServer(async(req:IncomingMessage & {body?:unknown},res)=>{
  // Emulate the Vercel Node front door's host and parsed-JSON body helper.
  req.headers.host='leads.example.com';if(req.method==='POST'){let body='';for await(const chunk of req)body+=String(chunk);req.body=JSON.parse(body||'{}')}
  const handler=routes[new URL(req.url??'/','https://leads.example.com').pathname];if(!handler){res.writeHead(404);res.end();return}await handler(req,res);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('No port');const url=`http://127.0.0.1:${address.port}`;
 const headers={origin:'https://leads.example.com','content-type':'application/json'};
 try{
  for(const path of ['/api/auth/session','/api/health','/api/audit'])expect((await fetch(url+path,{headers})).status).toBe(401);
  const login=await fetch(url+'/api/auth/login',{method:'POST',headers,body:JSON.stringify(fixture.users[0])});expect(login.status).toBe(200);const cookie=login.headers.get('set-cookie')!;expect(cookie).toContain('__Host-lh-access');expect(cookie).toContain('Secure');
  const authenticated={...headers,cookie:login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};expect((await fetch(url+'/api/health',{headers:authenticated})).status).toBe(200);
  expect((await fetch(url+'/api/audit',{method:'POST',headers:authenticated,body:JSON.stringify({url:'http://169.254.169.254'})})).status).toBe(400);
  expect((await fetch(url+'/api/auth/logout',{method:'POST',headers:authenticated,body:'{}'})).headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await fetch(url+'/api/auth/session',{headers})).status).toBe(401);
  const deployment=JSON.parse(readFileSync('vercel.json','utf8'));expect(deployment.outputDirectory).toBe('dist');expect(deployment.functions['api/**/*.ts'].maxDuration).toBeGreaterThan(35);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await fixture.close()}
},30000);
