import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {emptyCloud} from '../src/cloudModel.ts';
import {makeLead} from '../src/domain.ts';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const tables=['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups'];
let db:PGlite;
async function asUser<T>(id:string,run:()=>Promise<T>){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);try{return await run()}finally{await db.exec('reset role')}}
async function save(){const data=emptyCloud();data.leads.leads=[makeLead({name:'Owner record',website:'owner.example'})];return db.query('select public.lh_save_workspace(0,$1,$2::jsonb,null,$3) value',[crypto.randomUUID(),JSON.stringify(data),'a'.repeat(64)])}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${owner}'),('${other}');`);
 await db.exec(readFileSync('supabase/migrations/202610170001_cloud_workspace.sql','utf8'));
 // Preserve pre-existing records belonging to an account that will be denied.
 await db.query('insert into public.lh_leads values($1,$2,$3,$4)',[other,'old-record','old.example',JSON.stringify({name:'Preserved private record'})]);
 await db.exec(readFileSync('supabase/migrations/202610180001_single_owner.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('fails closed with an empty owner registry and keeps every public table protected',async()=>{
 const result=await db.query<{relrowsecurity:boolean}>("select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'lh_%'");expect(result.rows).toHaveLength(10);expect(result.rows.every(r=>r.relrowsecurity)).toBe(true);
 await asUser(owner,async()=>{await expect(db.query('select public.lh_load_workspace()')).rejects.toThrow('Owner authorization required');await expect(save()).rejects.toThrow('Owner authorization required');expect((await db.query('select * from public.lh_leads')).rows).toEqual([])});
 await db.exec('set role anon');try{await expect(db.query('select public.lh_load_workspace()')).rejects.toThrow();await expect(db.query('select * from public.lh_leads')).rejects.toThrow()}finally{await db.exec('reset role')}
});
it('allows a manually configured owner to use transactions and denies the other authenticated account',async()=>{
 await db.query('insert into lead_hunter_private.owner(user_id) values($1)',[owner]);
 await asUser(owner,async()=>{expect((await db.query<{value:boolean}>('select public.lh_is_owner() value')).rows[0].value).toBe(true);await save();expect((await db.query('select * from public.lh_leads')).rows).toHaveLength(1)});
 await asUser(other,async()=>{
  expect((await db.query<{value:boolean}>('select public.lh_is_owner() value')).rows[0].value).toBe(false);
  await expect(db.query('select public.lh_load_workspace()')).rejects.toThrow('Owner authorization required');await expect(save()).rejects.toThrow('Owner authorization required');
  for(const table of tables)expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
 });
 expect((await db.query('select * from public.lh_leads where user_id=$1',[other])).rows).toHaveLength(1);
});
it('denies direct writes, private implementation access, owner changes and self-enrollment for both accounts',async()=>{
 for(const id of [owner,other])await asUser(id,async()=>{
  await expect(db.query('update public.lh_leads set user_id=$1',[id])).rejects.toThrow();
  await expect(db.query('select lead_hunter_private.load_workspace()')).rejects.toThrow();
  await expect(db.query('select lead_hunter_private.save_workspace(0,$1,$2::jsonb,null,$3)',[crypto.randomUUID(),JSON.stringify(emptyCloud()),'a'.repeat(64)])).rejects.toThrow();
  await expect(db.query('select * from lead_hunter_private.owner')).rejects.toThrow();
  await expect(db.query('insert into lead_hunter_private.owner(user_id) values($1)',[id])).rejects.toThrow();
 });
 await expect(db.query('insert into lead_hunter_private.owner(user_id) values($1)',[other])).rejects.toThrow();
});
