import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {createSupabaseHandler} from './supabaseApp.ts';
// @ts-expect-error Executable test-only fixture.
import {testCloudFixture} from '../scripts/testCloudFixture.mjs';
let fixture:Awaited<ReturnType<typeof testCloudFixture>>,server:ReturnType<typeof createServer>,base:string;
let handler:ReturnType<typeof createSupabaseHandler>;
const analyzer=vi.fn();
beforeAll(async()=>{fixture=await testCloudFixture();server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');base=`http://127.0.0.1:${address.port}`},30000);
beforeEach(()=>{analyzer.mockReset();handler=createSupabaseHandler({origin:base,url:'https://fixture.supabase.co',key:'sb_publishable_fixture',secure:false,ownerUserId:fixture.users[0].id,ownerEmail:fixture.users[0].email},{client:fixture.client,analyzer})});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await fixture.close()});
const call=(path:string,body?:unknown,cookie='')=>fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin:base,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function externalSession(index:number){const client=fixture.client();const {data}=await client.auth.signInWithPassword(fixture.users[index]);return {session:data.session,cookie:`lh-access=${data.session.access_token}; lh-refresh=${data.session.refresh_token}`}}
const protectedRoutes:[string,unknown?][]=[['auth/session'],['auth/logout',{}],['auth/password',{password:'must-not-be-applied'}],['workspace'],['workspace',{userId:'forged'}],['workspace/backup'],['audit',{url:'https://example.com'}],['health']];
it('returns 401 for direct anonymous protected API requests',async()=>{for(const [path,body] of protectedRoutes)expect((await call(path,body)).status,path).toBe(401);expect(analyzer).not.toHaveBeenCalled()});
it('returns 403 for a valid unauthorized Supabase session on every API and auth route',async()=>{
 const {cookie}=await externalSession(1);
 for(const [path,body] of [...protectedRoutes,['auth/login',fixture.users[0]],['auth/recover',{email:fixture.users[0].email}],['auth/recovery',{tokenHash:'0'.repeat(64)}]] as [string,unknown?][]){const response=await call(path,body,cookie);expect(response.status,path).toBe(403);expect((await response.json()).code).toBe('OWNER_REQUIRED');expect(response.headers.get('set-cookie')).toContain('Max-Age=0')}
 expect(analyzer).not.toHaveBeenCalled();
});
it('denies non-owner login without issuing tokens and revokes its newly issued refresh session',async()=>{
 const before=fixture.refreshes.size;const response=await call('auth/login',fixture.users[1]);expect(response.status).toBe(403);expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect(await response.text()).not.toMatch(/fixture-access|fixture-refresh/);expect(fixture.refreshes.size).toBe(before);
});
it('restores an expired owner session but rejects expired/non-owner sessions and clears revoked sessions',async()=>{
 const logged=await call('auth/login',fixture.users[0]);expect(logged.status).toBe(200);const cookie=cookies(logged);fixture.accesses.clear();
 const restored=await call('auth/session',undefined,cookie);expect(restored.status).toBe(200);expect(restored.headers.get('set-cookie')).toContain('HttpOnly');
 const refreshed=cookies(restored);expect((await call('auth/logout',{},refreshed)).status).toBe(200);fixture.accesses.clear();expect((await call('auth/session',undefined,refreshed)).status).toBe(401);
 const other=await externalSession(1);fixture.accesses.clear();const rejected=await call('auth/session',undefined,other.cookie);expect(rejected.status).toBe(403);expect(rejected.headers.get('set-cookie')).not.toContain('fixture-access');
});
it('only sends recovery for the owner, denies other-account links, and accepts an owner link once',async()=>{
 const other=fixture.users[1];fixture.recoveries.delete(other.email);
 const generic=await call('auth/recover',{email:other.email});expect(generic.status).toBe(200);expect(fixture.recoveries.has(other.email)).toBe(false);
 // Simulate a link issued outside this application; it must still be denied.
 await fixture.client().auth.resetPasswordForEmail(other.email);const token=fixture.recoveries.get(other.email);expect((await call('auth/recovery',{tokenHash:token})).status).toBe(403);
 expect((await call('auth/recover',{email:fixture.users[0].email})).status).toBe(200);const ownerToken=fixture.recoveries.get(fixture.users[0].email);
 const recovered=await call('auth/recovery',{tokenHash:ownerToken});expect(recovered.status).toBe(200);expect((await call('auth/password',{password:'updated-owner-fixture-password'},cookies(recovered))).status).toBe(200);expect((await call('auth/recovery',{tokenHash:ownerToken})).status).toBe(401);
});
