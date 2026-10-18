export type SupabaseConfig={url:string;key:string;origin:string;secure:boolean;ownerUserId:string;ownerEmail:string};
type ConfigField='SUPABASE_URL'|'SUPABASE_PUBLISHABLE_KEY'|'APP_ORIGIN'|'OWNER_USER_ID'|'OWNER_EMAIL';
type ConfigReason='missing'|'invalid_url'|'https_required'|'origin_required'|'local_origin_required'|'http_or_https_required'|'privileged_key_rejected'|'publishable_or_anon_key_required'|'invalid_uuid'|'invalid_email';
export type ConfigIssue={field:ConfigField;reason:ConfigReason};
export class SupabaseConfigError extends Error{
 readonly issues:readonly ConfigIssue[];
 constructor(issues:ConfigIssue[]){super('Invalid Supabase configuration.');this.issues=issues;}
}
export function supabaseConfig(env:NodeJS.ProcessEnv=process.env):SupabaseConfig{
 const issues:ConfigIssue[]=[];
 const secure=env.NODE_ENV==='production'||env.VERCEL==='1';
 const parse=(field:'SUPABASE_URL'|'APP_ORIGIN')=>{
  const value=env[field];if(!value?.trim()){issues.push({field,reason:'missing'});return}
  let url:URL;try{url=new URL(value)}catch{issues.push({field,reason:'invalid_url'});return}
  if(field==='SUPABASE_URL'){
   if(url.protocol!=='https:')issues.push({field,reason:'https_required'});
   if(url.origin!==url.href.replace(/\/$/,''))issues.push({field,reason:'origin_required'});
  }else{
   if(!['http:','https:'].includes(url.protocol))issues.push({field,reason:'http_or_https_required'});
   if(url.origin!==value)issues.push({field,reason:'origin_required'});
   if(secure&&url.protocol!=='https:')issues.push({field,reason:'https_required'});
   if(!secure&&value!=='http://127.0.0.1:5173')issues.push({field,reason:'local_origin_required'});
  }
  return url;
 };
 const url=parse('SUPABASE_URL'),origin=parse('APP_ORIGIN');
 const key=env.SUPABASE_PUBLISHABLE_KEY??'';
 let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString()).role}catch{/* Modern publishable key. */}
 if(!key.trim())issues.push({field:'SUPABASE_PUBLISHABLE_KEY',reason:'missing'});
 else if(key.startsWith('sb_secret_')||role==='service_role')issues.push({field:'SUPABASE_PUBLISHABLE_KEY',reason:'privileged_key_rejected'});
 else if(!key.startsWith('sb_publishable_')&&role!=='anon')issues.push({field:'SUPABASE_PUBLISHABLE_KEY',reason:'publishable_or_anon_key_required'});
 const ownerUserId=env.OWNER_USER_ID??'',ownerEmail=env.OWNER_EMAIL??'';
 if(!ownerUserId)issues.push({field:'OWNER_USER_ID',reason:'missing'});
 else if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ownerUserId)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(ownerUserId))issues.push({field:'OWNER_USER_ID',reason:'invalid_uuid'});
 if(!ownerEmail)issues.push({field:'OWNER_EMAIL',reason:'missing'});
 else if(ownerEmail.length>254||ownerEmail!==ownerEmail.trim()||!/^\S+@\S+\.\S+$/.test(ownerEmail))issues.push({field:'OWNER_EMAIL',reason:'invalid_email'});
 if(issues.length)throw new SupabaseConfigError(issues);
 return {url:url!.origin,key,origin:origin!.origin,secure,ownerUserId:ownerUserId.toLowerCase(),ownerEmail:ownerEmail.toLowerCase()};
}
