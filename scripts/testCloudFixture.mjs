// Test-only controlled Auth provider + real embedded PostgreSQL. Never imported by application entry points.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
export async function testCloudFixture(){
 const users=[{id:'11111111-1111-4111-8111-111111111111',email:'one@fixture.example',password:'synthetic-fixture-password-one'},{id:'22222222-2222-4222-8222-222222222222',email:'two@fixture.example',password:'synthetic-fixture-password-two'}];
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${users[0].id}'),('${users[1].id}');`);await db.exec(await readFile('supabase/migrations/202610170001_cloud_workspace.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610180001_single_owner.sql','utf8'));await db.query('insert into lead_hunter_private.owner(user_id) values($1)',[users[0].id]);
 const accesses=new Map(),refreshes=new Map(),recoveries=new Map();let queue=Promise.resolve(),failNext=false;
 const error=()=>({message:'Invalid fixture credentials',status:401});
 const session=user=>{const access_token='fixture-access-'+randomUUID(),refresh_token='fixture-refresh-'+randomUUID();accesses.set(access_token,user);refreshes.set(refresh_token,user);return {access_token,refresh_token,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user.id,email:user.email}}};
 const client=(token)=>{let active;
  return {auth:{
   async signInWithPassword({email,password}){const u=users.find(u=>u.email===email&&u.password===password);return u?{data:{user:u,session:(active=session(u))},error:null}:{data:{user:null,session:null},error:error()}},
   async getUser(access){const user=accesses.get(access);return {data:{user:user?{id:user.id,email:user.email}:null},error:user?null:error()}},
   async refreshSession({refresh_token}){const user=refreshes.get(refresh_token);return {data:{session:user?session(user):null},error:user?null:error()}},
   async setSession(value){active=value;const user=accesses.get(value.access_token);return {data:{session:user?value:null},error:user?null:error()}},
   async signOut(){if(active)refreshes.delete(active.refresh_token);return {error:null}},
   async resetPasswordForEmail(email){const user=users.find(u=>u.email===email);if(user)recoveries.set(email,randomBytes(32).toString('hex'));return {data:{},error:null}},
   async verifyOtp({token_hash}){const found=[...recoveries].find(([,hash])=>hash===token_hash);if(!found)return {data:{session:null},error:error()};recoveries.delete(found[0]);const user=users.find(u=>u.email===found[0]);return {data:{session:(active=session(user)),user},error:null}},
   async updateUser({password}){const user=active&&accesses.get(active.access_token);if(user)user.password=password;return {data:{user},error:user?null:error()}},
  },async rpc(name,args){
   const user=accesses.get(token);if(!user)return {data:null,error:{code:'42501'}};
   const operation=queue.then(async()=>{await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user.id}',false)`);try{
    if(failNext){failNext=false;throw Object.assign(Error('Controlled offline save'),{code:'TEST_OFFLINE'})}
    const result=name==='lh_load_workspace'?await db.query('select public.lh_load_workspace() value'):await db.query('select public.lh_save_workspace($1,$2,$3::jsonb,$4,$5) value',[args.p_expected_revision,args.p_operation_id,JSON.stringify(args.p_payload),args.p_import_hash,args.p_payload_hash]);return {data:result.rows[0].value,error:null};
   }catch(e){return {data:null,error:{code:e.code??'TEST_ERROR'}}}finally{await db.exec('reset role')}});queue=operation.then(()=>{});return operation;
  }};
 };
 return {client,users,recoveries,accesses,refreshes,corrupt:async(userId)=>{await queue;await db.query("update public.lh_leads set payload=jsonb_set(payload,'{name}','5'::jsonb) where user_id=$1",[userId])},fail:()=>{failNext=true},close:()=>db.close()};
}
