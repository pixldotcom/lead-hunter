import {readEvidence,shouldScan,type DiscoveryData,type Candidate} from './discovery';

export async function processCandidates(initial:DiscoveryData,options:{ids?:string[];refresh?:boolean;signal:AbortSignal;audit:(url:string,signal:AbortSignal)=>Promise<unknown>;persist:(data:DiscoveryData)=>unknown|Promise<unknown>;progress?:(done:number,total:number)=>void;now?:()=>Date}):Promise<DiscoveryData>{
 let data=initial;const now=options.now??(()=>new Date());
 const targets=data.candidates.filter(c=>(!options.ids||options.ids.includes(c.id))&&shouldScan(c,options.refresh,now())).sort((a,b)=>Number(!!a.attemptedAt)-Number(!!b.attemptedAt)||a.attemptedAt.localeCompare(b.attemptedAt)).slice(0,data.preferences.batchSize);
 const update=async(candidate:Candidate)=>{const next={...data,candidates:data.candidates.map(c=>c.id===candidate.id?candidate:c)};await options.persist(next);data=next;};
 let done=0;options.progress?.(done,targets.length);
 for(const target of targets){
  if(options.signal.aborted)break;
  let c={...target,status:'Scanning' as Candidate['status'],attemptedAt:now().toISOString(),error:'',qualifiedAt:'',conceptAt:'',messageReviewedAt:'',deepReviewedAt:''};
  await update(c);
  try{const raw=await options.audit(c.website,options.signal);if(options.signal.aborted)throw Error('Cancelled');const evidence=readEvidence(raw);c={...c,evidence,status:'Scanned'};}
  catch(e){c={...c,status:options.signal.aborted?'Pending':'Error',error:options.signal.aborted?'Cancelled; resume after the 60-second domain cooldown.':e instanceof Error?e.message:'Scan failed.'};}
  await update(c);done++;options.progress?.(done,targets.length);if(options.signal.aborted)break;
 }
 return data;
}
