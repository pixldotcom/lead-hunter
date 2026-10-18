import {expect,it,vi,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {supabaseConfig,SupabaseConfigError} from './supabaseConfig.ts';
import {logServerError} from './diagnostics.ts';
const valid={OWNER_USER_ID:'11111111-1111-4111-8111-111111111111',OWNER_EMAIL:'one@fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',APP_ORIGIN:'http://127.0.0.1:5173'};
afterEach(()=>vi.restoreAllMocks());
function issues(env:NodeJS.ProcessEnv){try{supabaseConfig(env);throw Error('Expected configuration rejection')}catch(error){if(!(error instanceof SupabaseConfigError))throw error;return error.issues}}
it('accepts the exact local HTTP origin and uses non-Secure cookies locally',()=>{expect(supabaseConfig(valid)).toMatchObject({origin:valid.APP_ORIGIN,secure:false})});
it('reports every missing field without passing values to diagnostics',()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect(issues({})).toEqual(expect.arrayContaining(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN'].map(field=>({field,reason:'missing'}))));
 try{supabaseConfig({...valid,SUPABASE_URL:'private-invalid-url',SUPABASE_PUBLISHABLE_KEY:'sb_secret_private-key',APP_ORIGIN:'private-origin'})}catch(error){logServerError('AUTH_CONFIG',error)}
 const output=log.mock.calls[0][1];expect(output).toContain('SUPABASE_URL');expect(output).toContain('invalid_url');expect(output).toContain('privileged_key_rejected');expect(output).not.toContain('private-');
});
it.each([
 [{SUPABASE_URL:'not-a-url'},'SUPABASE_URL','invalid_url'],
 [{SUPABASE_URL:'http://fixture.supabase.co'},'SUPABASE_URL','https_required'],
 [{SUPABASE_URL:'https://fixture.supabase.co/path'},'SUPABASE_URL','origin_required'],
 [{SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'},'SUPABASE_PUBLISHABLE_KEY','privileged_key_rejected'],
 [{SUPABASE_PUBLISHABLE_KEY:'unsupported'},'SUPABASE_PUBLISHABLE_KEY','publishable_or_anon_key_required'],
 [{APP_ORIGIN:'http://127.0.0.1:5173/'},'APP_ORIGIN','origin_required'],
 [{OWNER_USER_ID:''},'OWNER_USER_ID','missing'],
 [{OWNER_USER_ID:'not-a-uuid'},'OWNER_USER_ID','invalid_uuid'],
 [{OWNER_EMAIL:''},'OWNER_EMAIL','missing'],
 [{OWNER_EMAIL:'not-email'},'OWNER_EMAIL','invalid_email'],
 [{APP_ORIGIN:'http://localhost:5173'},'APP_ORIGIN','local_origin_required'],
 [{APP_ORIGIN:'https://remote.example'},'APP_ORIGIN','local_origin_required'],
 [{NODE_ENV:'production'},'APP_ORIGIN','https_required'],
 [{VERCEL:'1'},'APP_ORIGIN','https_required'],
])('rejects invalid configuration with field/reason only: %j',(override,field,reason)=>{expect(issues({...valid,...override})).toContainEqual({field,reason})});
it('accepts HTTPS production origins and legacy anon keys, rejects legacy service roles',()=>{
 const jwt=(role:string)=>`e30.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
 expect(supabaseConfig({...valid,NODE_ENV:'production',APP_ORIGIN:'https://leads.example.com',SUPABASE_PUBLISHABLE_KEY:jwt('anon')})).toMatchObject({secure:true});
 expect(issues({...valid,SUPABASE_PUBLISHABLE_KEY:jwt('service_role')})).toContainEqual({field:'SUPABASE_PUBLISHABLE_KEY',reason:'privileged_key_rejected'});
});
it('loads .env then .env.local into child processes; shell variables win and .env.test.local is not loaded',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lead-hunter-env-'));
 try{
  writeFileSync(join(dir,'.env'),'SUPABASE_URL=https://base.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_base\nAPP_ORIGIN=http://127.0.0.1:5173\n');
  writeFileSync(join(dir,'.env.local'),'SUPABASE_PUBLISHABLE_KEY=sb_publishable_override\n');
  writeFileSync(join(dir,'.env.test.local'),'SUPABASE_URL=https://should-not-load.supabase.co\n');
  const env={...process.env};for(const key of Object.keys(valid))delete env[key];env.APP_ORIGIN='http://localhost:5173';
  const probe="const {spawnSync}=require('node:child_process');const child=spawnSync(process.execPath,['-e',`console.log(JSON.stringify(Object.fromEntries(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_ORIGIN'].map(k=>[k,process.env[k]]))))`],{encoding:'utf8'});process.stdout.write(child.stdout);process.exitCode=child.status";
  const child=spawnSync(process.execPath,['--env-file-if-exists=.env','--env-file-if-exists=.env.local','-e',probe],{cwd:dir,env,encoding:'utf8'});
  expect(child.status).toBe(0);expect(JSON.parse(child.stdout)).toEqual({SUPABASE_URL:'https://base.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_override',APP_ORIGIN:'http://localhost:5173'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});
