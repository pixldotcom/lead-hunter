import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {createServer} from 'node:http';
import {createSupabaseHandler,supabaseConfig} from './supabaseApp';
import {emptyCloud} from '../src/cloudModel';
import {makeLead} from '../src/domain';
// @ts-expect-error The test fixture is an executable .mjs browser/server helper.
import {testCloudFixture} from '../scripts/testCloudFixture.mjs';
let fixture:Awaited<ReturnType<typeof testCloudFixture>>,base:string,server:ReturnType<typeof createServer>;
let cookies='';
beforeAll(async()=>{fixture=await testCloudFixture();let handler:ReturnType<typeof createSupabaseHandler>;server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('No port');base=`http://127.0.0.1:${address.port}`;handler=createSupabaseHandler({origin:base,url:'https://fixture.supabase.co',key:'sb_publishable_fixture',secure:false},{client:fixture.client})},30000);
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await fixture.close()});
async function call(path:string,body?:unknown,auth=cookies){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin:base,'content-type':'application/json',cookie:auth},body:body===undefined?undefined:JSON.stringify(body)});const set=r.headers.getSetCookie();if(set.length)cookies=set.map(c=>c.split(';')[0]).join('; ');return r}
describe('Supabase auth adapter and authenticated cloud APIs',()=>{
 it('fails closed on missing config, rejects secret keys and enforces production HTTPS',()=>{expect(()=>supabaseConfig({})).toThrow();expect(()=>supabaseConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_use',APP_ORIGIN:base})).toThrow();expect(()=>supabaseConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',APP_ORIGIN:base,VERCEL:'1'})).toThrow()});
 it('denies anonymous data/analyzer access and provides no signup route',async()=>{cookies='';expect((await call('workspace')).status).toBe(401);expect((await call('audit',{url:'http://127.0.0.1'})).status).toBe(401);expect((await call('auth/signup',{})).status).not.toBe(200)});
 it('handles invalid login, valid login, session restoration and HTTP-only cookies without exposing tokens',async()=>{
  expect((await call('auth/login',{email:fixture.users[0].email,password:'wrong'})).status).toBe(401);
  const response=await call('auth/login',fixture.users[0]);expect(response.status).toBe(200);const body=await response.text();expect(body).not.toContain('access_token');expect(body).not.toContain('refresh_token');expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect((await call('auth/session')).status).toBe(200);
  const old=cookies;fixture.accesses.clear();expect((await call('auth/session')).status).toBe(200);expect(cookies).not.toBe(old);
 });
 it('saves through a user-scoped transaction, detects conflicts and leaves data intact on failure',async()=>{
  const initial=await (await call('workspace')).json(),data=emptyCloud();data.leads.leads=[makeLead({name:'Online',website:'online.example'})];
  const body={userId:fixture.users[0].id,expectedRevision:initial.revision,operationId:crypto.randomUUID(),data};const saved=await call('workspace',body);expect(saved.status).toBe(200);expect((await saved.json()).revision).toBe(1);
  expect((await call('workspace',body)).status).toBe(200);expect((await call('workspace',{...body,operationId:crypto.randomUUID()})).status).toBe(409);
  fixture.fail();expect((await call('workspace',{...body,expectedRevision:1,operationId:crypto.randomUUID()})).status).toBe(503);expect((await (await call('workspace')).json()).data.leads.leads[0].name).toBe('Online');
  expect((await call('audit',{url:'http://169.254.169.254'})).status).toBe(400);
 });
 it('isolates a second account and logs out without enabling unauthorized API reuse',async()=>{
  const first=cookies;await call('auth/login',fixture.users[1]);expect((await (await call('workspace')).json()).data.leads.leads).toEqual([]);expect((await call('auth/logout',{})).status).toBe(200);cookies='';expect((await call('workspace')).status).toBe(401);cookies=first;expect((await call('workspace')).status).toBe(200);
 });
 it('handles password recovery, rejects reused/invalid links and updates the authenticated password',async()=>{
  const email=fixture.users[1].email;expect((await call('auth/recover',{email})).status).toBe(200);const tokenHash=fixture.recoveries.get(email);
  expect((await call('auth/recovery',{tokenHash:'0'.repeat(64)})).status).toBe(401);expect((await call('auth/recovery',{tokenHash})).status).toBe(200);expect((await call('auth/recovery',{tokenHash})).status).toBe(401);
  expect((await call('auth/password',{password:'short'})).status).toBe(400);expect((await call('auth/password',{password:'replacement-fixture-password'})).status).toBe(200);
 });
 it('rejects foreign origins, malformed data and invalid snapshots',async()=>{
  expect((await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status).toBe(403);
  expect((await call('workspace',{userId:fixture.users[1].id,expectedRevision:0,operationId:crypto.randomUUID(),data:{version:9}})).status).toBe(400);expect((await call('workspace',{userId:fixture.users[0].id,expectedRevision:0,operationId:crypto.randomUUID(),data:emptyCloud()})).status).toBe(403);
 });
 it('exports an original malformed cloud snapshot and restores validated data with revision protection',async()=>{
  await call('auth/login',fixture.users[0]);const before=await (await call('workspace')).json();await fixture.corrupt(fixture.users[0].id);expect((await call('workspace')).status).toBe(503);const original=await call('workspace/backup');expect(original.status).toBe(200);const snapshot=await original.json();expect(snapshot.data.leads.leads[0].name).toBe(5);
  expect((await call('workspace',{userId:fixture.users[0].id,expectedRevision:snapshot.revision,operationId:crypto.randomUUID(),data:before.data})).status).toBe(200);expect((await (await call('workspace')).json()).data.leads.leads[0].name).toBe('Online');
 });
 it('rate limits concurrent login attempts without exposing credentials',async()=>{
  const attempts=await Promise.all(Array.from({length:12},()=>call('auth/login',{email:'nobody@fixture.example',password:'wrong'})));const blocked=attempts.find(r=>r.status===429);expect(blocked).toBeTruthy();expect(blocked!.headers.get('retry-after')).toBeTruthy();expect(await blocked!.text()).not.toContain('synthetic-fixture-password');
 });

});
