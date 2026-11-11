// Writes synthetic records ONLY to an explicitly confirmed, separate test project/accounts.
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {emptyCloud} from '../src/cloudModel.ts';
import {makeLead} from '../src/domain.ts';
const env=process.env,url=env.SUPABASE_TEST_URL,key=env.SUPABASE_TEST_PUBLISHABLE_KEY;
const required=['SUPABASE_TEST_URL','SUPABASE_TEST_PUBLISHABLE_KEY','SUPABASE_TEST_PROJECT_REF','SUPABASE_TEST_USER_A_EMAIL','SUPABASE_TEST_USER_A_PASSWORD','SUPABASE_TEST_USER_B_EMAIL','SUPABASE_TEST_USER_B_PASSWORD'];
if(required.some(k=>!env[k])){console.log('NOT RUN: configure the separate Supabase test project/accounts listed in docs/deployment.md. No hosted assertions were executed.');process.exit(2)}
assert.equal(env.SUPABASE_TEST_ALLOW_WRITES,'yes','Explicitly set SUPABASE_TEST_ALLOW_WRITES=yes for this disposable test project.');
assert.equal(new URL(url).hostname,env.SUPABASE_TEST_PROJECT_REF+'.supabase.co');assert.ok(key.startsWith('sb_publishable_'),'Use a publishable key, never a secret/service-role key.');assert.notEqual(url,env.SUPABASE_URL,'Use a different project from production.');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const a=createClient(url,key,opts),b=createClient(url,key,opts),anonymous=createClient(url,key,opts);
const settings=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(15000)});assert.ok(settings.ok);assert.equal((await settings.json()).disable_signup,true,'Disable public signup in the test project first.');
async function sign(client,letter){const r=await client.auth.signInWithPassword({email:env[`SUPABASE_TEST_USER_${letter}_EMAIL`],password:env[`SUPABASE_TEST_USER_${letter}_PASSWORD`]});assert.equal(r.error,null,'Test login failed; inspect private project configuration.');return r.data.user.id}
const userA=await sign(a,'A'),userB=await sign(b,'B');assert.notEqual(userA,userB);
const anon=await anonymous.rpc('lh_load_workspace');assert.ok(anon.error,'Anonymous workspace access must fail.');
async function load(client){const result=await client.rpc('lh_load_workspace');assert.equal(result.error,null);return result.data}
assert.equal((await a.rpc('lh_is_owner')).data,true,'Configure the test-only owner registry to user A.');
assert.equal((await b.rpc('lh_is_owner')).data,false);
assert.equal((await b.rpc('lh_load_workspace')).error?.code,'42501','Non-owner direct RPC must fail.');
const beforeA=await load(a);
assert.equal(beforeA.revision,0,'Use empty disposable accounts; existing test data is never replaced.');
const payload=emptyCloud(),lead=makeLead({name:'Supabase isolation fixture',website:'supabase-fixture.example'});payload.leads.leads=[lead];
const args={p_expected_revision:0,p_operation_id:randomUUID(),p_payload:payload,p_import_hash:null,p_payload_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
const saved=await a.rpc('lh_save_workspace',args);assert.equal(saved.error,null);assert.equal(saved.data.revision,1);
assert.equal((await a.rpc('lh_save_workspace',args)).data.revision,1,'Lost-response retry must be idempotent.');
assert.equal((await a.rpc('lh_save_workspace',{...args,p_operation_id:randomUUID()})).error?.code,'40001');
assert.equal((await b.rpc('lh_save_workspace',args)).error?.code,'42501');
for(const table of ['lh_workspaces','lh_leads','lh_activities','lh_batches','lh_prospects','lh_drafts','lh_preferences','lh_operations','lh_imports','lh_backups']){const result=await b.from(table).select('*').eq('user_id',userA);assert.equal(result.error,null);assert.deepEqual(result.data,[])}
assert.ok((await b.from('lh_leads').insert({user_id:userA,id:'forbidden',domain:'forbidden.example',payload:{}})).error,'Cross-user direct writes must fail.');
const another=createClient(url,key,opts);await sign(another,'A');assert.equal((await load(another)).data.leads.leads[0].id,lead.id);
const {error}=await another.auth.signOut({scope:'local'});assert.equal(error,null);assert.ok((await another.rpc('lh_load_workspace')).error,'Logged-out requests must be denied.');
await a.auth.signOut({scope:'local'});await b.auth.signOut({scope:'local'});
console.log('PASS: hosted Supabase login, signup disabled, anonymous rejection, transactional persistence/idempotency/conflict, same-account fresh session, single-owner RPC authorization and all-table cross-user RLS, forbidden write and logout. Synthetic fixture remains in disposable user A; delete the two test accounts through the test project dashboard to clean up. SMTP/recovery delivery requires the separate manual email acceptance check.');
