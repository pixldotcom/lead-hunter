import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createSupabaseHandler} from './supabaseApp.ts';

const ownerId='11111111-1111-4111-8111-111111111111';
const ownerEmail='owner@example.com';
async function serve(test:(base:string,headers:Record<string,string>,importer:ReturnType<typeof vi.fn>)=>Promise<void>){
 const importer=vi.fn(async(url:string)=>({website:url,name:'Example',description:'Example site',observedAt:'2026-01-01T00:00:00.000Z'}));
 const client=()=>({auth:{
  getUser:vi.fn(async(token:string)=>({data:{user:token==='owner-token'?{id:ownerId,email:ownerEmail,is_anonymous:false}:null},error:null})),
  refreshSession:vi.fn(async()=>({data:{session:null},error:null}))
 }}) as unknown as SupabaseClient;
 let handler:ReturnType<typeof createSupabaseHandler>;
 const server=createServer((req,res)=>void handler(req,res));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 handler=createSupabaseHandler({url:'https://example.supabase.co',key:'sb_publishable_fixture',origin:base,secure:false,ownerUserId:ownerId,ownerEmail},{client,websiteImporter:importer});
 const headers={'content-type':'application/json',origin:base};
 try{await test(base,headers,importer)}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
}
describe('authenticated website import',()=>{
 it('rejects anonymous import without fetching any website',async()=>serve(async(base,headers,importer)=>{
  const response=await fetch(base+'/api/import/website',{method:'POST',headers,body:JSON.stringify({websiteUrl:'https://example.com'})});
  expect(response.status).toBe(401);expect(importer).not.toHaveBeenCalled();
 }));
 it('rejects cross-origin requests before fetching',async()=>serve(async(base,headers,importer)=>{
  const response=await fetch(base+'/api/import/website',{method:'POST',headers:{...headers,origin:'https://attacker.example',cookie:'lh-access=owner-token'},body:JSON.stringify({websiteUrl:'https://example.com'})});
  expect(response.status).toBe(403);expect(importer).not.toHaveBeenCalled();
 }));
 it('allows verified owner and returns extracted metadata',async()=>serve(async(base,headers,importer)=>{
  const response=await fetch(base+'/api/import/website',{method:'POST',headers:{...headers,cookie:'lh-access=owner-token'},body:JSON.stringify({websiteUrl:'https://example.com'})});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({website:'https://example.com',name:'Example'});expect(importer).toHaveBeenCalledTimes(1);
 }));
 it('rejects oversized or invalid input before calling importer',async()=>serve(async(base,headers,importer)=>{
  const auth={...headers,cookie:'lh-access=owner-token'};
  const bad=await fetch(base+'/api/import/website',{method:'POST',headers:auth,body:JSON.stringify({websiteUrl:42})});
  expect(bad.status).toBe(400);
  const large=await fetch(base+'/api/import/website',{method:'POST',headers:auth,body:JSON.stringify({websiteUrl:'x'.repeat(9000)})});
  expect(large.status).toBe(413);expect(importer).not.toHaveBeenCalled();
 }));
});
