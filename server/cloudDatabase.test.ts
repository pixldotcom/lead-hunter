import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {emptyCloud,validateCloud,mergeCloud} from '../src/cloudModel';
import {makeLead,createDraft} from '../src/domain';
import {prepareDraft} from '../src/draftPersistence';
import {importCandidates,emptyDiscovery} from '../src/discovery';
import {emptyManualReview} from '../src/manualReview';
import {readLegacy} from '../src/MigrationPanel';
const userA='11111111-1111-4111-8111-111111111111',userB='22222222-2222-4222-8222-222222222222';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${userA}'),('${userB}');`);await db.exec(readFileSync('supabase/migrations/202610170001_cloud_workspace.sql','utf8'))},30000);
afterAll(async()=>{await db.close()});
async function asUser<T>(user:string,run:()=>Promise<T>){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`);try{return await run()}finally{await db.exec('reset role')}}
async function load(){return (await db.query<{value:unknown}>('select public.lh_load_workspace() value')).rows[0].value as {revision:number;data:ReturnType<typeof emptyCloud>}}
async function save(data:ReturnType<typeof emptyCloud>,revision:number,operation=crypto.randomUUID(),hash:string|null=null){return (await db.query<{value:unknown}>('select public.lh_save_workspace($1,$2,$3::jsonb,$4,$5) value',[revision,operation,JSON.stringify(data),hash,'a'.repeat(64)])).rows[0].value as {revision:number;data:ReturnType<typeof emptyCloud>}}
describe('real PostgreSQL migration, transactional saves and RLS',()=>{
 it('enables RLS on every exposed table and denies anonymous functions/rows',async()=>{
  const tables=(await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class where relname like 'lh_%' and relkind='r'")).rows;expect(tables.length).toBe(10);expect(tables.every(t=>t.relrowsecurity)).toBe(true);
  await db.exec('set role anon');try{await expect(load()).rejects.toThrow();await expect(db.query('select * from public.lh_leads')).rejects.toThrow()}finally{await db.exec('reset role')}
 });
 it('roundtrips leads, history, discovery/reviews, drafts and preferences without local writes',async()=>asUser(userA,async()=>{
  const data=emptyCloud(),lead=makeLead({name:'Cloud A',website:'https://a.example'});lead.id='shared-record-id';data.leads.leads=[lead];data.discovery=importCandidates(emptyDiscovery(),[{website:'prospect.example'}],[],emptyDiscovery().preferences);data.discovery.candidates[0].manualReview={...emptyManualReview(),notes:'Private review',reviewedAt:new Date().toISOString()};
  data.drafts.drafts=[prepareDraft(createDraft(lead,'Direct business','Initial outreach'))];data.preferences.textScale=150;
  const result=await save(validateCloud(data),0);expect(result.revision).toBe(1);expect(validateCloud(result.data)).toEqual(data);expect((await load()).data.leads.leads[0].activities).toEqual(lead.activities);
 }));
 it('isolates a second user even when record ids overlap and denies direct writes/ownership changes',async()=>asUser(userB,async()=>{
  const a=await load();expect(a.data.leads.leads).toEqual([]);expect((await db.query('select * from public.lh_leads')).rows).toEqual([]);
  const data=emptyCloud();data.leads.leads=[{...makeLead({name:'Cloud B',website:'b.example'}),id:'shared-record-id'}];await save(data,0);
  expect((await db.query('select user_id from public.lh_leads')).rows).toEqual([{user_id:userB}]);
  for(const table of ['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups'])expect((await db.query(`select * from public.${table} where user_id=$1`,[userA])).rows).toEqual([]);
  await expect(db.query('update public.lh_leads set user_id=$1',[userA])).rejects.toThrow();await expect(db.query('delete from public.lh_leads')).rejects.toThrow();
 }));
 it('rejects stale revisions, rolls back invalid payloads and makes lost-response retries idempotent',async()=>asUser(userA,async()=>{
  const before=await load();await expect(save(before.data,0)).rejects.toThrow('Revision conflict');expect((await load()).revision).toBe(before.revision);
  const bad=structuredClone(before.data);bad.discovery.candidates[0].batchId='missing';await expect(save(bad,before.revision)).rejects.toThrow();expect(await load()).toEqual(before);
  const operation=crypto.randomUUID();const saved=await save(before.data,before.revision,operation);expect((await save(before.data,before.revision,operation)).revision).toBe(saved.revision);
 }));
 it('backs up the pre-import cloud data and prevents the same source importing twice',async()=>asUser(userA,async()=>{
  const before=await load(),source=emptyCloud();source.leads.leads=[makeLead({name:'Imported',website:'new.example'})];const merged=mergeCloud(before.data,source);const hash='f'.repeat(64);const result=await save(merged.data,before.revision,crypto.randomUUID(),hash);expect((await save(merged.data,before.revision,crypto.randomUUID(),hash)).revision).toBe(result.revision);expect((await db.query('select payload from public.lh_backups where revision=$1',[before.revision])).rows).toEqual([{payload:before.data}]);
 }));
 it('keeps exact legacy stores untouched during preview and preserves orphan drafts',()=>{
  const source=emptyCloud();source.leads.leads=[makeLead({name:'Legacy',website:'legacy.example'})];source.drafts.drafts=[prepareDraft({...createDraft(source.leads.leads[0],'Direct business','Initial outreach'),leadId:'deleted-lead'})];const raw=new Map([['pixldot-lead-hunter-v1',JSON.stringify(source.leads)],['pixldot-outreach-drafts-v1',JSON.stringify(source.drafts)]]);const before=JSON.stringify([...raw]);const preview=readLegacy({getItem:k=>raw.get(k)??null});expect(JSON.stringify([...raw])).toBe(before);expect(mergeCloud(emptyCloud(),preview).data.drafts.drafts[0].leadId).toBe('deleted-lead');
 });
 it('deleting a test account cascades all owned records without affecting another user',async()=>{
  await asUser(userB,async()=>{const current=await load();current.data.discovery=importCandidates(emptyDiscovery(),[{website:'cleanup.example'}],[],emptyDiscovery().preferences);await save(current.data,current.revision)});
  await db.query('delete from auth.users where id=$1',[userB]);
  for(const table of ['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups'])expect((await db.query(`select * from public.${table} where user_id=$1`,[userB])).rows).toEqual([]);
  await asUser(userA,async()=>expect((await load()).data.leads.leads.length).toBeGreaterThan(0));
 });

});
