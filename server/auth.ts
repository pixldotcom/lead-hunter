// Historical fixed-login helper retained for regressions; production uses supabaseApp.ts.
import {createHash,createHmac,randomBytes,scrypt as scryptCallback,scryptSync,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {IncomingMessage,ServerResponse} from 'node:http';

const scrypt=promisify(scryptCallback);
const digest=(value:string)=>createHash('sha256').update(value).digest();
export type AuthConfig={username:string;password:string;secret:string;origin:string;secure:boolean;ttlSeconds:number};
export function authConfig(env:NodeJS.ProcessEnv=process.env):AuthConfig{
 const username=env.AUTH_USERNAME??'',password=env.AUTH_PASSWORD??'',secret=env.AUTH_SESSION_SECRET??'';
 const secure=env.NODE_ENV==='production'||env.VERCEL==='1';
 const origin=env.APP_ORIGIN??(secure?'':'http://127.0.0.1:5173');
 let url:URL;try{url=new URL(origin)}catch{throw Error('Private login is not configured.');}
 const ttlSeconds=Number(env.AUTH_SESSION_TTL_SECONDS??28800);
 if(!username.trim()||username.length>128||password.length<16||password.length>512||secret.length<32||!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>86400||url.origin!==origin||(secure&&url.protocol!=='https:')||(!secure&&!['http:','https:'].includes(url.protocol)))throw Error('Private login is not configured.');
 return {username,password,secret,origin,secure,ttlSeconds};
}
export function createAuth(config:AuthConfig,now=Date.now){
 const salt=createHmac('sha256',config.secret).update('password-check').digest();
 const passwordHash=scryptSync(config.password,salt,32);
 // Changing any credential invalidates all existing signed sessions.
 const signingKey=createHmac('sha256',config.secret).update(config.username).update(passwordHash).digest();
 const cookieName=config.secure?'__Host-pixldot-session':'pixldot-session';
 let attempts=0,windowEnd=0;
 const signature=(value:string)=>createHmac('sha256',signingKey).update(value).digest('base64url');
 const cookie=(value:string,maxAge:number)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure?'; Secure':''}`;
 function session(req:IncomingMessage):{expiresAt:number}|null{
  const matches=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
  if(matches.length!==1)return null;
  const token=matches[0].slice(cookieName.length+1);if(token.length>1024)return null;
  const parts=token.split('.');if(parts.length!==2||!timingSafeEqual(digest(parts[1]),digest(signature(parts[0]))))return null;
  try{const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));const time=now();if(data.v!==1||!Number.isSafeInteger(data.exp)||!Number.isSafeInteger(data.iat)||data.iat>time||data.exp<=time||data.exp-data.iat!==config.ttlSeconds*1000||typeof data.nonce!=='string')return null;return {expiresAt:data.exp}}catch{return null}
 }
 return {
  origin:config.origin,
  session,
  async login(raw:unknown,res:ServerResponse){
   const time=now();if(time>=windowEnd){attempts=0;windowEnd=time+15*60*1000}
   // Reserve attempts before awaiting password work, including concurrent requests.
   if(attempts>=10){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((windowEnd-time)/1000))));return {status:429,body:{error:'Too many login attempts. Wait 15 minutes before trying again.'}}}attempts++;
   const data=raw as {username?:unknown;password?:unknown}|null;
   const valid=!!data&&typeof data.username==='string'&&data.username.length<=128&&typeof data.password==='string'&&data.password.length<=512;
   const checked=await scrypt(valid?data!.password as string:'',salt,32) as Buffer;
   const usernameMatches=timingSafeEqual(digest(valid?data!.username as string:''),digest(config.username));
   const passwordMatches=timingSafeEqual(checked,passwordHash);
   if(!valid||!usernameMatches||!passwordMatches)return {status:401,body:{error:'Incorrect username or password.'}};
   const expiresAt=now()+config.ttlSeconds*1000;
   const value=Buffer.from(JSON.stringify({v:1,iat:expiresAt-config.ttlSeconds*1000,exp:expiresAt,nonce:randomBytes(24).toString('base64url')})).toString('base64url');
   res.setHeader('Set-Cookie',cookie(`${value}.${signature(value)}`,config.ttlSeconds));
   return {status:200,body:{authenticated:true,expiresAt}};
  },
  logout(res:ServerResponse){res.setHeader('Set-Cookie',cookie('',0));},
 };
}
