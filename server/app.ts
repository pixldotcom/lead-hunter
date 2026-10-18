// Historical local handler retained for network/search regressions; not a production entry point.
import {authConfig,createAuth} from './auth.ts';
import {createSearchService,searchConfig,SearchError} from './search.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { analyze } from './audit.ts';
import { AuditError } from './network.ts';

type HandlerOptions={search?:ReturnType<typeof createSearchService>;auth?:ReturnType<typeof createAuth>;testWithoutAuth?:boolean;disableSearch?:boolean};
export function createApiHandler(options:HandlerOptions={}) {
  if(options.testWithoutAuth&&(process.env.NODE_ENV!=='test'||process.env.VERCEL==='1'))throw Error('Authentication bypass is only permitted inside unit tests.');
  let auth=options.auth;try{auth??=createAuth(authConfig())}catch{/* Missing configuration fails closed on every request. */}
  let search=options.search;let searchSetupError='';try{search??=createSearchService(searchConfig())}catch(e){searchSetupError=e instanceof SearchError?e.message:'Invalid search setup.'}
  return async (req:IncomingMessage & {body?:unknown}, res:ServerResponse) => {
    const reply = (status: number, data: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    let path:string;try{path=new URL(req.url??'/',auth?.origin??'http://localhost').pathname}catch{return reply(400,{error:'Invalid request.'})}
    req.url=path;
    if(!options.testWithoutAuth){
      if(!auth)return reply(503,{code:'AUTH_CONFIG',error:'Private login is not configured. Contact the workspace owner.'});
      // APP_ORIGIN is fixed server-side, never inferred from forwarded headers.
      const expectedHost=new URL(auth.origin).host;
      if(req.headers.host!==expectedHost)return reply(403,{error:'Use the configured application address.'});
      if(req.headers.origin&&req.headers.origin!==auth.origin)return reply(403,{error:'Use the application to make this request.'});
      if(req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'Cross-site requests are not allowed.'});
      if(!['GET','HEAD'].includes(req.method??'')&&req.headers.origin!==auth.origin)return reply(403,{error:'Use the application to make this request.'});
      if(path==='/api/auth/session'&&req.method==='GET'){const session=auth.session(req);return reply(session?200:401,session?{authenticated:true,...session}:{authenticated:false,error:'Please log in.'})}
      if(path==='/api/auth/logout'&&req.method==='POST'){auth.logout(res);return reply(200,{authenticated:false})}
      if(!(path==='/api/auth/login'&&req.method==='POST')&&!auth.session(req))return reply(401,{code:'AUTH_REQUIRED',error:'Your session has expired. Please log in.'});
    }else{
      if(req.headers.host&&!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host))return reply(403,{error:'Use the local address.'});
      if(req.headers.origin&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin))return reply(403,{error:'Use the local application.'});
    }
    if(options.disableSearch&&path.startsWith('/api/search'))return reply(404,{error:'Route not found.'});
    if (req.method === 'GET' && req.url === '/api/health') return reply(200, { status: 'ok' });
    if(req.method==='GET'&&req.url==='/api/search/status')return reply(200,search?search.status():{configured:false,error:searchSetupError});
    if (req.method !== 'POST' || !['/api/audit','/api/search','/api/auth/login'].includes(req.url||'')) return reply(404, { code: 'NOT_FOUND', error: 'Route not found.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { code: 'INVALID_CONTENT_TYPE', error: 'Submit JSON data.' });
    const started=Date.now();
    const logSearch=(code:string,status:number)=>{if(req.url==='/api/search')console.warn('[search]',JSON.stringify({code,status,durationMs:Date.now()-started,sessionUsed:search?.status().sessionUsed??0}));};
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const deadline = setTimeout(() => { controller.abort(); logSearch('TIMEOUT',504); reply(504, { code: 'TIMEOUT', error: req.url==='/api/search'?'Search timed out. Try fewer results or use external search.':'Analysis timed out. Try again later.' }); req.destroy(); }, 35000);
    try {
      let data:unknown;
      if(req.body!==undefined){
        const text=typeof req.body==='string'?req.body:JSON.stringify(req.body);
        if(Buffer.byteLength(text)>4096)return reply(413,{error:'Request is too large.'});
        try{data=JSON.parse(text)}catch{throw new AuditError('INVALID_JSON','Submit valid JSON.')}
      }else{
        let body='';let bytes=0;
        for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>4096)return reply(413,{error:'Request is too large.'});body+=String(chunk)}
        try{data=JSON.parse(body)}catch{throw new AuditError('INVALID_JSON','Submit valid JSON.')}
      }
      if(path==='/api/auth/login'){if(!auth)return reply(503,{error:'Private login is not configured.'});const result=await auth.login(data,res);return reply(result.status,result.body)}
      if(req.url==='/api/search'){if(!search)throw new SearchError('CONFIG',searchSetupError,503);const result=await search.search(data,controller.signal);if(result.warning)logSearch('PARTIAL_RESULTS',200);reply(200,result);return;}
      if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string') throw new AuditError('INVALID_URL', 'Submit a website URL.');
      reply(200, await analyze(data.url, controller.signal));
    } catch (error) {
      logSearch(error instanceof SearchError||error instanceof AuditError?error.code:'SEARCH_FAILED',error instanceof SearchError?error.status:400);
      if(error instanceof SearchError){reply(error.status,{code:error.code,error:error.message});return;}
      reply(error instanceof AuditError && error.code === 'TIMEOUT' ? 504 : 400, { code: error instanceof AuditError ? error.code : 'ANALYSIS_FAILED', error: error instanceof AuditError ? error.message : 'Analysis failed. Check the URL and try again.' });
    } finally { clearTimeout(deadline); }
  };
}
export function createAuditServer(options:HandlerOptions={}) {
  const server=createServer(createApiHandler(options));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
