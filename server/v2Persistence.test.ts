import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {emptyCloud,validateCloud} from '../src/cloudModel';
import {parseQuickImport,importBusinessRows} from '../src/quickImport';
import {buildQualifiedShortlist} from '../src/prospectQualification';
import {detectOpportunities} from '../src/opportunityDetection';

const owner='11111111-1111-4111-8111-111111111111';
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('"+owner+"');");
  await db.exec(readFileSync('supabase/migrations/202610170001_cloud_workspace.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/202610180001_single_owner.sql','utf8'));
  await db.query('insert into lead_hunter_private.owner(user_id) values($1)',[owner]);
  await db.exec(readFileSync('supabase/migrations/202611130001_v2_opportunity_persistence.sql','utf8'));
},30000);
afterAll(async()=>{if(db)await db.close()});
async function asOwner<T>(run:()=>Promise<T>){
  await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
  try{return await run()}finally{await db.exec('reset role')}
}
async function load(){
  return (await db.query<{value:unknown}>('select public.lh_load_workspace() value')).rows[0].value as {revision:number;data:ReturnType<typeof emptyCloud>};
}
async function save(data:ReturnType<typeof emptyCloud>,revision:number){
  return (await db.query<{value:unknown}>('select public.lh_save_workspace($1,$2,$3::jsonb,$4,$5) value',[revision,crypto.randomUUID(),JSON.stringify(data),null,'a'.repeat(64)])).rows[0].value as {revision:number;data:ReturnType<typeof emptyCloud>};
}
describe('Quick Import V2 cloud migration',()=>{
  it('persists imported businesses, analyses and follow-ups through fresh PostgreSQL loads and backups',async()=>asOwner(async()=>{
    const start=await load();
    expect(start.revision).toBe(0);
    expect(start.data.discovery.businesses).toEqual([]);
    const lines='https://www.google.com/maps/place/Example+Studio | Example Studio | Ludhiana\nExample Studio | Ludhiana | https://example-studio.test';
    const imported=importBusinessRows(parseQuickImport(lines),[]);
    expect(imported).toMatchObject({added:1,merged:1});
    const business=imported.businesses[0];
    const analysis=detectOpportunities(business,[]);
    const now='2026-11-13T00:00:00.000Z';
    const activity={businessId:business.id,stage:'drafted' as const,channel:'email' as const,lastContactAt:'',nextFollowUpAt:'',note:'Prepare research prompt',updatedAt:now};
    const data=emptyCloud();
    data.discovery.businesses=imported.businesses;
    data.discovery.opportunityAnalyses=[analysis];
    data.discovery.outreachActivities=[activity];
    const saved=await save(validateCloud(data),0);
    expect(saved.revision).toBe(1);
    const restored=validateCloud((await load()).data);
    expect(restored.discovery.businesses).toHaveLength(1);
    expect(restored.discovery.businesses?.[0]).toMatchObject({name:'Example Studio',location:'Ludhiana',websiteUrl:'https://example-studio.test/',sourceUrl:'https://www.google.com/maps/place/Example+Studio',websiteStatus:'unknown'});
    expect(restored.discovery.opportunityAnalyses?.[0].businessId).toBe(business.id);
    expect(restored.discovery.outreachActivities?.[0]).toMatchObject({businessId:business.id,note:'Prepare research prompt'});
    expect(buildQualifiedShortlist(restored.discovery.businesses??[],restored.discovery.opportunityAnalyses??[]).some(row=>row.business.id===business.id)).toBe(true);
    const repeated=importBusinessRows(parseQuickImport(lines),restored.discovery.businesses??[]);
    expect(repeated.added).toBe(0);
    expect(repeated.merged).toBe(2);
    expect(repeated.businesses[0].id).toBe(business.id);
    const second=await save(validateCloud({...restored,discovery:{...restored.discovery,businesses:repeated.businesses}}),1);
    expect(second.revision).toBe(2);
    expect((await load()).data.discovery.businesses).toHaveLength(1);
    const backup=(await db.query<{payload:ReturnType<typeof emptyCloud>}>('select payload from public.lh_backups where revision=1')).rows[0];
    expect(backup.payload.discovery.businesses).toHaveLength(1);
  }));
});
