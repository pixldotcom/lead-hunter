import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {analyze} from './audit.ts';
import {AuditError} from './network.ts';
import {emptyCloud,validateCloud} from '../src/cloudModel.ts';
import {logServerError} from './diagnostics.ts';

export type SupabaseConfig={url:string;key:string;origin:string;secure:boolean};
export function supabaseConfig(env:NodeJS.ProcessEnv=process.env):SupabaseConfig{
 const url=new URL(env.SUPABASE_URL??''),origin=new URL(env.APP_ORIGIN??'');const key=env.SUPABASE_PUBLISHABLE_KEY??'';
 const secure=env.NODE_ENV==='production'||env.VERCEL==='1';
 let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString()).role}catch{/* Modern publishable key. */}
 if(!key||key.startsWith('sb_secret_')||role==='service_role'||(!key.startsWith('sb_publishable_')&&role!=='anon')||url.protocol!=='https:'||url.origin!==url.href.replace(/\/$/,'')||origin.origin!==env.APP_ORIGIN||(secure&&origin.protocol!=='https:')||!['http:','https:'].includes(origin.protocol))throw Error('Invalid Supabase configuration.');
 return {url:url.origin,key,origin:origin.origin,secure};
}
type Request=IncomingMessage & {body?:unknown};
type Deps={client?:(token?:string)=>SupabaseClient;analyzer?:typeof analyze};
export function createSupabaseHandler(config?:SupabaseConfig,deps:Deps={}){
 const client=(token?:string)=>deps.client?.(token)??createClient(config!.url,config!.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(12000)])})}});
 const prefix=config?.secure?'__Host-lh-':'lh-';
 const readCookies=(req:Request)=>Object.fromEntries((req.headers.cookie??'').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));
 const cookie=(name:string,value:string,age:number)=>`${prefix}${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config?.secure?'; Secure':''}`;
 const setSession=(res:ServerResponse,session:Session)=>res.setHeader('Set-Cookie',[cookie('access',session.access_token,session.expires_in),cookie('refresh',session.refresh_token,30*86400)]);
 const clear=(res:ServerResponse)=>res.setHeader('Set-Cookie',[cookie('access','',0),cookie('refresh','',0)]);
 let loginCount=0,recoveryCount=0,windowEnd=0;
 const limit=(kind:'login'|'recovery',res:ServerResponse)=>{if(Date.now()>=windowEnd){loginCount=0;recoveryCount=0;windowEnd=Date.now()+900000}const n=kind==='login'?++loginCount:++recoveryCount;if(n>(kind==='login'?10:3)){res.setHeader('Retry-After',String(Math.ceil((windowEnd-Date.now())/1000)));return true}return false};
 return async(req:Request,res:ServerResponse)=>{
  const reply=(status:number,data:unknown)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
  if(!config)return reply(503,{error:'Cloud access is not configured. Contact the workspace owner.'});
  const path=new URL(req.url??'/',config.origin).pathname;
  if(req.headers.host!==new URL(config.origin).host||(req.headers.origin&&req.headers.origin!==config.origin)||req.headers['sec-fetch-site']==='cross-site'||(!['GET','HEAD'].includes(req.method??'')&&req.headers.origin!==config.origin))return reply(403,{error:'Use the configured application address.'});
  const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort()});
  const timer=setTimeout(()=>{abort.abort();reply(504,{error:'Request timed out. Your pending edits can be retried.'})},35000);
  try{
   let data:Record<string,unknown>={};
   if(req.method==='POST'){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return reply(415,{error:'Submit JSON data.'});
    const max=path==='/api/workspace'?3_200_000:8192;let raw='';
    if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    else{let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>max)return reply(413,{error:'Request exceeds the size limit.'});raw+=String(chunk)}}
    if(Buffer.byteLength(raw)>max)return reply(413,{error:'Request exceeds the size limit.'});
    try{data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error()}catch{return reply(400,{error:'Submit a valid JSON object.'})}
   }
   if(path==='/api/auth/login'&&req.method==='POST'){
    if(limit('login',res))return reply(429,{error:'Too many login attempts. Wait 15 minutes and retry.'});
    if(typeof data.email!=='string'||data.email.length>254||!/^\S+@\S+\.\S+$/.test(data.email)||typeof data.password!=='string'||data.password.length>512)return reply(400,{error:'Enter a valid email and password.'});
    const {data:result,error}=await client().auth.signInWithPassword({email:data.email,password:data.password});
    if(error||!result.session)return reply(error?.status===429?429:401,{error:'Email or password was not accepted.'});
    setSession(res,result.session);return reply(200,{authenticated:true,userId:result.user.id,email:result.user.email,expiresAt:Date.now()+result.session.expires_in*1000});
   }
   if(path==='/api/auth/recover'&&req.method==='POST'){
    if(limit('recovery',res))return reply(429,{error:'Too many recovery attempts. Wait 15 minutes and retry.'});
    if(typeof data.email!=='string'||data.email.length>254||!/^\S+@\S+\.\S+$/.test(data.email))return reply(400,{error:'Enter a valid email address.'});
    const {error}=await client().auth.resetPasswordForEmail(data.email,{redirectTo:config.origin+'/?recovery=1'});if(error)return reply(error.status===429?429:503,{error:'Recovery is unavailable. Try later or contact the workspace owner.'});
    return reply(200,{message:'If an account exists for this email, check its inbox for the recovery link.'});
   }
   if(path==='/api/auth/recovery'&&req.method==='POST'){
    if(limit('login',res))return reply(429,{error:'Too many recovery attempts. Wait and retry.'});
    if(typeof data.tokenHash!=='string'||!/^[a-f0-9]{32,128}$/i.test(data.tokenHash))return reply(400,{error:'Recovery link is invalid or expired.'});
    const {data:result,error}=await client().auth.verifyOtp({token_hash:data.tokenHash,type:'recovery'});if(error||!result.session)return reply(401,{error:'Recovery link is invalid or expired.'});setSession(res,result.session);return reply(200,{authenticated:true,userId:result.user!.id,expiresAt:Date.now()+result.session.expires_in*1000});
   }
   const cookies=readCookies(req);let access=cookies[prefix+'access'],refresh=cookies[prefix+'refresh'];
   let user=null;
   if(access&&access.length<8192){const result=await client().auth.getUser(access);if(result.error&&(!result.error.status||result.error.status>=500))return reply(503,{error:'Authentication is temporarily unavailable. Try again.'});user=result.data.user}
   let expiresAt=Date.now()+300000;
   if(!user&&refresh&&refresh.length<2048){const result=await client().auth.refreshSession({refresh_token:refresh});if(result.error&&(!result.error.status||result.error.status>=500))return reply(503,{error:'Session restoration is temporarily unavailable.'});if(result.data.session){access=result.data.session.access_token;refresh=result.data.session.refresh_token;const verified=await client().auth.getUser(access);user=verified.data.user;if(user){setSession(res,result.data.session);expiresAt=Date.now()+result.data.session.expires_in*1000}}}
   if(path==='/api/auth/logout'&&req.method==='POST'){
    if(user&&access&&refresh){const auth=client();await auth.auth.setSession({access_token:access,refresh_token:refresh});const {error}=await auth.auth.signOut({scope:'local'});if(error)return reply(503,{error:'Logout could not be confirmed. Try again.'})}clear(res);return reply(200,{authenticated:false});
   }
   if(user&&(user.is_anonymous||!user.email))return reply(403,{error:'Use a confirmed email/password account.'});
   if(!user||!access){clear(res);return reply(401,{code:'AUTH_REQUIRED',authenticated:false,error:'Please log in again.'})}
   if(path==='/api/auth/session'&&req.method==='GET')return reply(200,{authenticated:true,userId:user.id,email:user.email,expiresAt});
   if(path==='/api/auth/password'&&req.method==='POST'){
    if(typeof data.password!=='string'||data.password.length<12||data.password.length>512)return reply(400,{error:'Use a password with 12-512 characters.'});
    const auth=client();const loaded=await auth.auth.setSession({access_token:access,refresh_token:refresh});if(loaded.error)return reply(401,{error:'Recovery session expired. Request another link.'});const {error}=await auth.auth.updateUser({password:data.password});if(error)return reply(400,{error:'Password could not be updated. Try another password or request a new recovery link.'});return reply(200,{message:'Password updated.'});
   }
   if(path==='/api/health'&&req.method==='GET')return reply(200,{status:'ok'});
   if(path==='/api/audit'&&req.method==='POST'){if(typeof data.url!=='string')return reply(400,{error:'Enter a public website URL.'});return reply(200,await (deps.analyzer??analyze)(data.url,abort.signal))}
   if(path==='/api/workspace/backup'&&req.method==='GET'){const result=await client(access).rpc('lh_load_workspace');if(result.error)return reply(503,{error:'Cloud backup is unavailable. Try again later.'});return reply(200,{...result.data,userId:user.id})}
   if(path==='/api/workspace'&&['GET','POST'].includes(req.method??'')){
    const db=client(access);let response;
    if(req.method==='POST'){
     if(data.userId!==user.id)return reply(403,{error:'The account changed. Export pending work and log in to its original account.'});
     if(!Number.isSafeInteger(data.expectedRevision)||(data.expectedRevision as number)<0||typeof data.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.operationId)||(data.importHash!==undefined&&(typeof data.importHash!=='string'||!/^[a-f0-9]{64}$/.test(data.importHash))))return reply(400,{error:'Invalid save operation.'});
     let payload;try{payload=validateCloud(data.data)}catch{return reply(400,{error:'Invalid workspace data. Export the pending copy for review.'})}
     response=await db.rpc('lh_save_workspace',{p_expected_revision:data.expectedRevision,p_operation_id:data.operationId,p_payload:payload,p_import_hash:data.importHash??null,p_payload_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')});
    }else response=await db.rpc('lh_load_workspace');
    if(response.error){const conflict=response.error.code==='40001';console.warn('[cloud]',JSON.stringify({code:response.error.code,operation:req.method}));return reply(conflict?409:503,{error:conflict?'Cloud records changed in another browser. Export unsaved work, reload and reapply it.':'Cloud request failed. Pending work can be retried; contact the owner if it continues.'})}
    const result=response.data??{revision:0,data:emptyCloud()};return reply(200,{userId:user.id,revision:result.revision,data:validateCloud(result.data)});
   }
   return reply(404,{error:'Route not found.'});
  }catch(error){if(error instanceof AuditError)return reply(error.code==='TIMEOUT'?504:400,{code:error.code,error:error.message});logServerError('REQUEST_FAILED',error);return reply(503,{error:'The service is unavailable. Unsaved work can be retried.'})}finally{clearTimeout(timer)}
 };
}
