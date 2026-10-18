import {generateQueries,validateSearchOptions,searchWebsite,type SearchResult} from '../src/searchCatalogue.ts';

export class SearchError extends Error{code:string;status:number;constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status}}
export type SearchConfig={key:string;maxRequests:number;maxPages:number;hourlyLimit:number;sessionLimit:number;intervalMs:number;timeoutMs:number};
export function searchConfig(env:NodeJS.ProcessEnv=process.env):SearchConfig{
 const integer=(key:string,fallback:number,min:number,max:number)=>{const raw=env[key];const n=raw===undefined?fallback:Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw new SearchError('CONFIG',`Invalid ${key}; use ${min}–${max}.`,503);return n};
 return {key:env.BRAVE_SEARCH_API_KEY?.trim()||'',maxRequests:integer('BRAVE_MAX_REQUESTS_PER_SEARCH',3,1,6),maxPages:integer('BRAVE_MAX_PAGES_PER_QUERY',1,1,2),hourlyLimit:integer('BRAVE_HOURLY_REQUEST_LIMIT',30,1,500),sessionLimit:integer('BRAVE_SESSION_REQUEST_LIMIT',100,1,1000),intervalMs:integer('BRAVE_MIN_INTERVAL_MS',1100,1000,10000),timeoutMs:integer('BRAVE_TIMEOUT_MS',8000,100,10000)};
}
export function braveResults(raw:unknown,query:string,date=new Date()):{results:SearchResult[];more:boolean}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SearchError('MALFORMED','Brave returned malformed search data.',502);
 const data=raw as {query?:{original?:unknown;more_results_available?:unknown}|null;web?:{results?:unknown}|null};
 if((!('query' in data)&&!('web' in data))||(data.query!=null&&(typeof data.query!=='object'||typeof data.query.original!=='string'||(data.query.more_results_available!=null&&typeof data.query.more_results_available!=='boolean')))||(data.web!=null&&(typeof data.web!=='object'||!Array.isArray(data.web.results))))throw new SearchError('MALFORMED','Brave returned malformed search data.',502);
 const rows=data.web?.results??[];if(!Array.isArray(rows)||rows.length>20)throw new SearchError('MALFORMED','Brave returned too many result rows.',502);
 const results:SearchResult[]=[];
 for(const row of rows){if(!row||typeof row!=='object'||typeof row.url!=='string'||(row.title!=null&&typeof row.title!=='string')||(row.description!=null&&typeof row.description!=='string'))throw new SearchError('MALFORMED','Brave returned invalid result fields.',502);
  try{const website=searchWebsite(row.url);results.push({...website,title:row.title??'',snippet:row.description??'',query,discoveredAt:date.toISOString()})}catch{/* Unsafe/non-website results are excluded, never fetched. */}
 }
 return {results,more:data.query?.more_results_available===true};
}
const sleep=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new SearchError('CANCELLED','Search cancelled.',499));return}const finish=()=>{signal.removeEventListener('abort',abort);resolve()};const timer=setTimeout(finish,ms);const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new SearchError('CANCELLED','Search cancelled.',499))};signal.addEventListener('abort',abort,{once:true})});
async function readJson(response:Response){
 if(!/application\/json/i.test(response.headers.get('content-type')||''))throw new SearchError('MALFORMED','Brave returned a non-JSON response.',502);
 if(!response.body)throw new SearchError('MALFORMED','Brave returned an empty response.',502);
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000)throw new SearchError('TOO_LARGE','Brave response exceeded the 1 MB limit.',502);chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new SearchError('MALFORMED','Brave returned invalid JSON.',502)}
}
export function createSearchService(config:SearchConfig,deps:{fetch?:typeof fetch;now?:()=>number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>}={}){
 const fetcher=deps.fetch??fetch,now=deps.now??Date.now,delay=deps.sleep??sleep;
 let busy=false,sessionUsed=0,hourUsed=0,hourStarted=now(),lastStarted=-Infinity,blockedUntil=0;
 const status=()=>{if(now()-hourStarted>=3600000){hourUsed=0;hourStarted=now()}return {configured:!!config.key,maxRequests:config.maxRequests,maxPages:config.maxPages,hourlyLimit:config.hourlyLimit,hourUsed,sessionLimit:config.sessionLimit,sessionUsed,intervalMs:config.intervalMs,blockedUntil,busy}};
 const search=async(raw:unknown,caller:AbortSignal)=>{
  let options;let queries:string[];try{options=validateSearchOptions(raw);queries=generateQueries(options)}catch(e){throw new SearchError('INVALID_OPTIONS',e instanceof Error?e.message:'Invalid search options.')} 
  if(!config.key)throw new SearchError('NOT_CONFIGURED','Brave search is not configured. Set BRAVE_SEARCH_API_KEY in the backend environment and restart the local server. Manual URL/CSV import remains available.',503);
  if(busy)throw new SearchError('BUSY','Another search is running. Wait or cancel it before retrying.',409);
  busy=true;const signal=AbortSignal.any([caller,AbortSignal.timeout(30000)]);const results:SearchResult[]=[],seen=new Set<string>(),more=new Map(queries.map(q=>[q,true]));let requests=0,warning='';
  try{
   outer:for(let page=0;page<config.maxPages;page++)for(const query of queries){
    if(!more.get(query))continue;
    const usage=status();if(requests>=config.maxRequests){warning='Configured per-search request limit reached; no extra requests were made.';break outer}
    if(usage.hourUsed>=config.hourlyLimit||usage.sessionUsed>=config.sessionLimit||now()<blockedUntil)throw new SearchError('LOCAL_LIMIT','Local usage limit or provider cooldown reached. No extra request was made. Check usage and retry later.',429);
    if(signal.aborted)throw new SearchError(caller.aborted?'CANCELLED':'TIMEOUT',caller.aborted?'Search cancelled.':'Search timed out.',caller.aborted?499:504);
    await delay(Math.max(0,lastStarted+config.intervalMs-now()),signal);
    if(signal.aborted)throw new SearchError('CANCELLED','Search cancelled.',499);
    // Reserve every attempt before calling the provider, including failed/cancelled requests.
    status();if(hourUsed>=config.hourlyLimit||sessionUsed>=config.sessionLimit)throw new SearchError('LOCAL_LIMIT','Local request budget exhausted.',429);
    hourUsed++;sessionUsed++;requests++;lastStarted=now();
    const count=Math.min(20,Math.max(1,Math.ceil(options.limit/queries.length)));
    const url=new URL('https://api.search.brave.com/res/v1/web/search');for(const [key,value] of Object.entries({q:query,count,offset:page,country:options.country,search_lang:options.language,safesearch:'moderate'}))url.searchParams.set(key,String(value));
    let response:Response;
    try{response=await fetcher(url,{headers:{accept:'application/json','X-Subscription-Token':config.key},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(config.timeoutMs)])})}
    catch{throw new SearchError(caller.aborted?'CANCELLED':signal.aborted?'TIMEOUT':'PROVIDER_UNAVAILABLE',caller.aborted?'Search cancelled.':'Brave request timed out or could not be reached. Check connectivity and retry; the attempt counts toward usage.',caller.aborted?499:504)}
    if(!response.ok){await response.body?.cancel().catch(()=>{});if(response.status===429){const retry=response.headers.get('retry-after');let seconds=Number(retry);if(!Number.isFinite(seconds))seconds=(Date.parse(retry||'')-now())/1000;blockedUntil=now()+(Number.isFinite(seconds)&&seconds>0?seconds:60)*1000;throw new SearchError('PROVIDER_QUOTA','Brave rate/quota limit reached. Check your Brave dashboard and wait before retrying; no automatic retry was made.',429)}if([401,403].includes(response.status))throw new SearchError('INVALID_KEY','Brave rejected the API key or subscription. Check the backend key and enabled Web Search plan.',401);throw new SearchError('PROVIDER_ERROR',`Brave returned HTTP ${response.status}. No automatic retry was made.`,502)}
    let parsed;try{parsed=braveResults(await readJson(response),query,new Date(now()))}catch(e){if(signal.aborted||(e instanceof Error&&e.name==='AbortError'))throw new SearchError('TIMEOUT','Search was cancelled or timed out while reading the response.',504);throw e}
    more.set(query,parsed.more);
    for(const result of parsed.results.slice(0,count)){if(seen.has(result.hostname))continue;seen.add(result.hostname);results.push(result);if(results.length>=options.limit)break outer}
   }
  }catch(e){if(caller.aborted)throw new SearchError('CANCELLED','Search cancelled. Earlier stored prospects are unchanged; attempted requests still count.',499);if(!results.length)throw e;warning=e instanceof SearchError?e.message:'Search stopped after partial results. Retry later.';}
  finally{busy=false}
  return {results,queries,requests,warning,usage:status()};
 };
 return {status,search};
}
