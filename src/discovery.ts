import {validateSearchResults,type SearchResult} from './searchCatalogue.ts';
import {validateManualReview,type ManualReview} from './manualReview.ts';
import {normalizeDomain,parseCsv,uid,makeLead,today,salesMetrics,type Lead,type Finding} from './domain.ts';
import {validateLead} from './dataValidation.ts';

export const DISCOVERY_KEY='pixldot-discovery-v1';
export const SERVICES=['WordPress development','Elementor implementation','Website redesign','Website fixes','Performance optimization','WordPress maintenance','Technical SEO improvements','Next.js frontend implementation'];
export type Preferences={type:'Agency'|'Direct business';industry:string;geography:string;keywords:string;batchSize:number};
export const defaultPreferences=():Preferences=>({type:'Agency',industry:'Web design',geography:'India',keywords:'',batchSize:5});
export type Evidence={website:string;submittedUrl:string;status:number;redirects:{from:string;to:string;status:number}[];analyzedAt:string;htmlVerified:boolean;title:string;description:string;canonical:string;h1Count:number;viewport:boolean;wordPress:string;wordPressEvidence:string;summary:string;findings:Finding[]};
export type Review={name:string;services:string[];rationale:string;evidenceUrl:string;evidenceNote:string;contactUrl:string;contactEvidence:string;reviewedAt:string};
export type Decision='Unreviewed'|'High priority'|'Review later'|'Not a fit'|'Already contacted'|'Rejected';
export const DECISIONS:Decision[]=['Unreviewed','High priority','Review later','Not a fit','Already contacted','Rejected'];
export type Candidate={searchEvidence?:SearchResult;manualReview?:ManualReview;history:{kind:'Qualified'|'Concept created'|'Message reviewed';timestamp:string}[];id:string;domain:string;website:string;name:string;type:Preferences['type'];industry:string;geography:string;source:string;discoveredAt:string;batchId:string;status:'Pending'|'Scanning'|'Scanned'|'Error';decision:Decision;attemptedAt:string;error:string;evidence:Evidence|null;review:Review|null;qualifiedAt:string;deepReviewedAt:string;screenshot:{url:string;capturedAt:string;note:string}|null;conceptAt:string;leadId:string;messageReviewedAt:string};
export type Batch={id:string;createdAt:string;submitted:number;duplicates:number;accepted:number};
export type DiscoveryData={version:1;preferences:Preferences;candidates:Candidate[];batches:Batch[]};
export const emptyDiscovery=():DiscoveryData=>({version:1,preferences:defaultPreferences(),candidates:[],batches:[]});
export function candidateUrl(raw:string):string{
 const input=raw.trim();if(!input||/[\s\\]/.test(input))throw Error('Enter a valid HTTP/HTTPS candidate URL.');
 const u=new URL(/^[a-z][a-z\d+.-]*:/i.test(input)?input:`https://${input}`);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw Error('Use HTTP/HTTPS URLs on standard ports, without credentials.');
 normalizeDomain(u.href);u.hash='';return u.href;
}
const text=(v:unknown):v is string=>typeof v==='string';
const stamp=(v:unknown,optional=false)=>text(v)&&((optional&&v==='')||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v));
const number=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validUrl=(v:unknown,optional=false)=>{try{return text(v)&&((optional&&!v)||!!candidateUrl(v))}catch{return false}};
export function validatePreferences(v:unknown):Preferences{
 if(!object(v)||(v.type!=='Agency'&&v.type!=='Direct business')||!['industry','geography','keywords'].every(k=>text(v[k]))||!number(v.batchSize,10)||v.batchSize<1)throw Error('Invalid discovery preferences.');
 return v as Preferences;
}
export function readEvidence(raw:unknown):Evidence{
 if(!object(raw))throw Error('Malformed analyzer evidence.');
 const keys=['website','submittedUrl','status','redirects','analyzedAt','htmlVerified','title','description','canonical','h1Count','viewport','wordPress','wordPressEvidence','summary','findings'] as const;
 const e=Object.fromEntries(keys.map(k=>[k,raw[k]])) as Evidence;
 if(!validUrl(e.website)||!validUrl(e.submittedUrl)||!number(e.status,599)||e.status<100||!stamp(e.analyzedAt)||typeof e.htmlVerified!=='boolean'||typeof e.viewport!=='boolean'||!number(e.h1Count)||!['title','description','canonical','wordPress','wordPressEvidence','summary'].every(k=>text(e[k as keyof Evidence])))throw Error('Malformed analyzer metadata.');
 if(!Array.isArray(e.findings)||e.findings.length>200||!Array.isArray(e.redirects)||e.redirects.length>4||e.redirects.some(r=>!object(r)||!validUrl(r.from)||!validUrl(r.to)||!number(r.status,399)||r.status<300))throw Error('Malformed redirect evidence.');
 // Reuse the established nested finding validator, without weakening the lead schema.
 const check=makeLead({name:'Evidence validation',website:e.website,findings:e.findings});
 validateLead(check);return {...e,findings:check.findings};
}
export function validateDiscovery(raw:unknown):DiscoveryData{
 if(!object(raw)||raw.version!==1||!Array.isArray(raw.candidates)||!Array.isArray(raw.batches)||raw.candidates.length>1000||raw.batches.length>1000)throw Error('Unsupported or malformed discovery storage.');
 validatePreferences(raw.preferences);const ids=new Set(),domains=new Set(),batches=new Set();
 for(const b of raw.batches){if(!object(b)||!text(b.id)||!b.id.trim()||batches.has(b.id)||!stamp(b.createdAt)||!number(b.submitted,100)||!number(b.duplicates,100)||!number(b.accepted,100)||b.submitted!==b.duplicates+b.accepted)throw Error('Invalid discovery batch.');batches.add(b.id);}
 for(const v of raw.candidates){
  if(!object(v))throw Error('Invalid candidate.');const c=v as Candidate;
  if(!['id','domain','website','name','industry','geography','source','batchId','error','leadId'].every(k=>text(v[k]))||!c.id.trim()||ids.has(c.id)||domains.has(c.domain)||!validUrl(c.website)||c.domain!==normalizeDomain(c.website)||!batches.has(c.batchId)||!['Agency','Direct business'].includes(c.type)||!['Pending','Scanning','Scanned','Error'].includes(c.status)||!DECISIONS.includes(c.decision)||!stamp(c.discoveredAt)||!['attemptedAt','qualifiedAt','deepReviewedAt','conceptAt','messageReviewedAt'].every(k=>stamp(v[k],true)))throw Error('Invalid candidate fields or association.');
  ids.add(c.id);domains.add(c.domain);
  if(!Array.isArray(c.history)||c.history.some(h=>!object(h)||!['Qualified','Concept created','Message reviewed'].includes(h.kind)||!stamp(h.timestamp)))throw Error('Invalid candidate history.');
  if(c.searchEvidence!==undefined){validateSearchResults([c.searchEvidence]);if(c.searchEvidence.hostname!==c.domain)throw Error('Search evidence must belong to this candidate domain.');}
  if(c.manualReview!==undefined)validateManualReview(c.manualReview);
  if(c.evidence!==null)readEvidence(c.evidence);
  if(c.status==='Scanned'&&!c.evidence)throw Error('Scanned candidate needs evidence.');
  if(c.review!==null){const r=c.review;if(!object(r)||!['name','rationale','evidenceNote','contactEvidence'].every(k=>text(r[k as keyof Review]))||!validUrl(r.evidenceUrl,true)||!validUrl(r.contactUrl,true)||!stamp(r.reviewedAt)||!Array.isArray(r.services)||r.services.some(s=>!SERVICES.includes(s))||new Set(r.services).size!==r.services.length)throw Error('Invalid candidate review.');}
  if(c.screenshot!==null&&(!object(c.screenshot)||!validUrl(c.screenshot.url)||!stamp(c.screenshot.capturedAt)||!text(c.screenshot.note)))throw Error('Invalid screenshot reference.');
  if(c.qualifiedAt&&qualificationProblems(c).length)throw Error('Qualified candidate lacks required evidence.');
  if(c.conceptAt&&!c.qualifiedAt)throw Error('Proposal concept needs qualification.');
 }
 return raw as DiscoveryData;
}
export type CandidateInput={website:string;name?:string;source?:string;discoveredAt?:string;searchEvidence?:SearchResult;manualReview?:ManualReview;decision?:Decision};
export function parseCandidates(input:string,csv=false):CandidateInput[]{
 if(input.length>50000)throw Error('Import is limited to 50,000 characters.');
 let rows:CandidateInput[];
 if(csv){rows=parseCsv(input).map(row=>{const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase().trim(),v]));return {website:r.website||r.domain||r.url||'',name:r.name||r.business||'',source:r.source||r.sourceurl||''}})}
 else rows=input.split(/[\s,;]+/).filter(Boolean).map(website=>({website}));
 if(!rows.length||rows.length>100)throw Error('Paste 1–100 URLs/domains per import.');
 return rows.map(r=>({...r,website:candidateUrl(r.website),source:r.source?.trim()||(csv?'CSV import':'Pasted URL')}));
}
export function importCandidates(data:DiscoveryData,rows:CandidateInput[],leads:Lead[],prefs:Preferences,now=new Date()):DiscoveryData{
 validatePreferences(prefs);if(!rows.length||rows.length>100)throw Error('Import 1–100 candidates.');
 const batch:Batch={id:uid(),createdAt:now.toISOString(),submitted:rows.length,duplicates:0,accepted:0};
 const seen=new Set([...data.candidates.map(c=>c.domain),...leads.map(l=>normalizeDomain(l.website))]);const added:Candidate[]=[];
 for(const row of rows){const website=candidateUrl(row.website),domain=normalizeDomain(website);if(seen.has(domain)){batch.duplicates++;continue}seen.add(domain);batch.accepted++;
  added.push({...('searchEvidence' in row?{searchEvidence:row.searchEvidence}:{}),...('manualReview' in row?{manualReview:row.manualReview}:{}),history:[],id:uid(),domain,website,name:row.name?.trim()||domain,type:prefs.type,industry:prefs.industry,geography:prefs.geography,source:row.source||'Pasted URL',discoveredAt:row.discoveredAt??now.toISOString(),batchId:batch.id,status:'Pending',decision:row.decision??'Unreviewed',attemptedAt:'',error:'',evidence:null,review:null,qualifiedAt:'',deepReviewedAt:'',screenshot:null,conceptAt:'',leadId:'',messageReviewedAt:''});
 }
 return validateDiscovery({...data,preferences:{...prefs},candidates:[...added,...data.candidates],batches:[batch,...data.batches]});
}
export function verifiedFindings(c:Candidate):Finding[]{return c.evidence?.findings.filter(f=>f.confidence==='confirmed'&&f.severity!=='info'&&f.evidence.trim()&&normalizeDomain(f.pageUrl)===normalizeDomain(c.evidence!.website))??[]}
export function rankCandidate(c:Candidate,now=new Date()){
 const review=c.review,findings=verifiedFindings(c);const matched=review?.services.length??0;
 const fit=matched?20:0;const evidence=Math.min(30,findings.reduce((n,f)=>n+(f.severity==='high'?12:f.severity==='medium'?7:3),0)+(review?.evidenceNote.trim()&&review.evidenceUrl?10:0));
 const relevance=matched&&review?.rationale.trim()?20:0;
 const contact=review?.contactUrl&&review.contactEvidence.trim()?10:0;
 const age=c.evidence?(now.getTime()-Date.parse(c.evidence.analyzedAt))/86400000:Infinity;
 const quality=c.evidence?.htmlVerified?(age>=0&&age<=30?20:age>30&&age<=90?10:0):0;
 const breakdown={fit,evidence,relevance,contact,quality};const score=Object.values(breakdown).reduce((a,b)=>a+b,0);
 return {score,breakdown,explanation:`Service fit ${fit}/20; verified evidence ${evidence}/30 (${findings.length} actionable observations); human-reviewed commercial relevance ${relevance}/20; evidenced contact route ${contact}/10; successful HTML evidence freshness ${quality}/20. Budget, urgency and willingness to buy remain unknown. Visual age earns no points.`};
}
export function qualificationProblems(c:Candidate):string[]{
 const r=c.review,issues:string[]=[];
 if(['Rejected','Not a fit','Already contacted'].includes(c.decision))issues.push('This decision is not eligible for a new pitch.');
 if(!c.evidence?.htmlVerified||c.status!=='Scanned')issues.push('Complete a successful HTML quick scan.');
 if(!r?.name.trim()||!r.services.length||r.rationale.trim().length<15)issues.push('Confirm the business name, service fit and a specific commercial rationale (15+ characters).');
 if(!r?.contactUrl||!r.contactEvidence.trim())issues.push('Record a public contact route and what you observed there.');
 if(c.type==='Agency'&&(!r?.evidenceUrl||r.evidenceNote.trim().length<15))issues.push('Agency pitches need a sourced, manually verified development/overflow requirement (15+ characters).');
 if(c.type==='Direct business'&&!verifiedFindings(c).length&&(!r?.evidenceUrl||r.evidenceNote.trim().length<15))issues.push('Record a concrete verified website finding or a sourced business requirement.');
 if(c.evidence&&normalizeDomain(c.evidence.website)!==c.domain&&(!r?.evidenceUrl||!r.evidenceNote.trim()))issues.push('Review the cross-domain redirect and document the business association.');
 return issues;
}
export function qualify(c:Candidate,now=new Date()):Candidate{const problems=qualificationProblems(c);if(problems.length)throw Error(problems.join(' '));return candidateEvent({...c,qualifiedAt:now.toISOString()},'Qualified',now)}
export function candidateEvent(c:Candidate,kind:Candidate['history'][number]['kind'],now=new Date()):Candidate{return c.history.some(h=>h.kind===kind)?c:{...c,history:[...c.history,{kind,timestamp:now.toISOString()}]}}
export function decisionCandidate(c:Candidate,decision:Decision):Candidate{return {...c,decision,...(['Rejected','Not a fit','Already contacted'].includes(decision)?{qualifiedAt:'',conceptAt:'',messageReviewedAt:''}:{})}}
export function shouldScan(c:Candidate,refresh=false,now=new Date()):boolean{
 if(['Rejected','Not a fit','Already contacted'].includes(c.decision))return false;
 if(c.decision==='Review later'&&!refresh)return false;
 if(c.evidence&&!refresh)return false;
 return !c.attemptedAt||now.getTime()-Date.parse(c.attemptedAt)>=60000;
}
export function candidateLead(c:Candidate,leads:Lead[]):Lead|undefined{const finalDomain=c.evidence&&c.review?.evidenceUrl&&c.review.evidenceNote.trim()?normalizeDomain(c.evidence.website):c.domain;return leads.find(l=>[c.domain,finalDomain].includes(normalizeDomain(l.website)))}
export function promotionLead(c:Candidate,leads:Lead[]):Lead{
 if(!c.qualifiedAt||qualificationProblems(c).length)throw Error('Qualify this prospect before promotion.');
 const existing=candidateLead(c,leads);if(existing)return existing;
 const r=c.review!;return makeLead({name:r.name,website:c.evidence!.website,type:c.type,industry:'',country:'',sourceUrl:r.evidenceUrl||c.website,discovery:`Discovery batch ${c.batchId}; ${c.source}`,fit:r.rationale,services:r.services,findings:c.evidence!.findings,contactPage:r.contactUrl,researchedAt:today(new Date(c.evidence!.analyzedAt)),stage:'Qualified',notes:`Search target only (location/category not verified): ${c.industry}; ${c.geography}\nHuman-reviewed evidence: ${r.evidenceNote||'See saved findings'}\nContact route: ${r.contactEvidence}\nBudget/urgency unknown. Quick scan is not a full audit.`});
}
export function searchLinks(p:Preferences){const query=[p.industry,p.geography,p.type==='Agency'?'agency development partnership':'business',p.keywords].filter(Boolean).join(' ');return [{label:'Search Google',url:`https://www.google.com/search?q=${encodeURIComponent(query)}`},{label:'Search Bing',url:`https://www.bing.com/search?q=${encodeURIComponent(query)}`},{label:'Find directory listings (search)',url:`https://www.google.com/search?q=${encodeURIComponent(`${query} directory`)}`}];}
export function batchSummary(data:DiscoveryData,leads:Lead[],batchId=''){
 const candidates=data.candidates.filter(c=>!batchId||c.batchId===batchId),domains=new Set(candidates.map(c=>c.domain));const linkedIds=new Set(candidates.map(c=>candidateLead(c,leads)?.id).filter(Boolean));const linked=leads.filter(l=>domains.has(normalizeDomain(l.website))||linkedIds.has(l.id));const sales=salesMetrics(linked);
 const batches=data.batches.filter(b=>!batchId||b.id===batchId);
 return {submitted:batches.reduce((n,b)=>n+b.submitted,0),unique:candidates.length,analyzed:candidates.filter(c=>c.evidence?.htmlVerified).length,qualified:candidates.filter(c=>c.qualifiedAt||c.history.some(h=>h.kind==='Qualified')).length,mockups:candidates.filter(c=>c.history.some(h=>h.kind==='Concept created')).length,reviewed:candidates.filter(c=>c.history.some(h=>h.kind==='Message reviewed')).length,sent:sales.contacted,replies:sales.replies,meetings:sales.meetings,proposals:sales.proposals,revenue:sales.revenue};
}

export type DiscoveryWorkspace={data:DiscoveryData|null;raw:string|null;error:string};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
export function loadDiscovery(storage:StorageAccess):DiscoveryWorkspace{let raw:string|null=null;try{raw=storage.getItem(DISCOVERY_KEY);const data=raw===null?emptyDiscovery():validateDiscovery(JSON.parse(raw));return {data,raw,error:''}}catch(e){return {data:null,raw,error:`Discovery needs recovery: ${e instanceof Error?e.message:'Storage unavailable'}`}}}
export function saveDiscovery(storage:StorageAccess,current:DiscoveryWorkspace,data:DiscoveryData):DiscoveryWorkspace{
 if(!current.data)throw Error('Discovery writes are blocked until recovery. Lead data is unaffected.');
 validateDiscovery(data);if(storage.getItem(DISCOVERY_KEY)!==current.raw)throw Error('Discovery changed in another tab. Export pending work and reload.');
 const raw=JSON.stringify(data);storage.setItem(DISCOVERY_KEY,raw);return {data,raw,error:''};
}
export function restoreDiscovery(storage:StorageAccess,current:DiscoveryWorkspace,data:DiscoveryData):DiscoveryWorkspace{
 validateDiscovery(data);if(storage.getItem(DISCOVERY_KEY)!==current.raw)throw Error('Discovery changed. Reload before recovery.');
 if(current.raw!==null)storage.setItem(`${DISCOVERY_KEY}-recovery-${uid()}`,current.raw);
 const raw=JSON.stringify(data);storage.setItem(DISCOVERY_KEY,raw);return {data,raw,error:''};
}
export interface DiscoveryProvider {name:string;discover(preferences:Preferences,signal:AbortSignal):Promise<CandidateInput[]>}
// Future providers must return explicit source URLs and document terms/quotas. No provider is configured.
