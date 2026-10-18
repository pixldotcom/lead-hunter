import { validateData, validateLead, numericValue } from './dataValidation.ts';
﻿export const PIPELINE = ['New','Researching','Qualified','Ready to contact','Contacted','Replied','Meeting booked','Proposal sent','Negotiation','Won','Lost','Nurture'] as const;
export type Stage = typeof PIPELINE[number];
export type Finding = { id: string; title: string; category: string; severity: 'high'|'medium'|'low'|'info'; explanation: string; evidence: string; pageUrl: string; recommendation: string; confidence: 'confirmed'|'likely'|'unverified'; timestamp: string };
export type Activity = { id: string; type: string; note: string; timestamp: string };
export type ScoreBreakdown = { fit: number; problems: number; relevance: number; contact: number; source: number };
export type Lead = { id: string; name: string; website: string; country: string; city: string; type: 'Agency'|'Direct business'|'Referral'|'Other'; industry: string; sourceUrl: string; discovery: string; contactName: string; email: string; contactPage: string; notes: string; fit: string; services: string[]; findings: Finding[]; score: number; breakdown: ScoreBreakdown; scoreExplanation: string; priority: 'High'|'Medium'|'Low'; manualPriority: Lead['priority']|null; researchedAt: string; stage: Stage; firstContact: string; lastContact: string; nextFollowUp: string; attempts: number; lastResponse: string; meetingDate: string; proposalAmount: number; proposalDate: string; closedDate: string; revenueWon: number; monthlyRevenue: number; lossReason: string; createdAt: string; updatedAt: string; activities: Activity[] };
export type AppData = { version: number; leads: Lead[] };
export const STORE_KEY = 'pixldot-lead-hunter-v1';
export const emptyData = (): AppData => ({ version: 1, leads: [] });
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `l_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function normalizeDomain(raw: string): string { const text = raw.trim(); if(!text) return ''; let u: URL; try { u = new URL(/^https?:\/\//i.test(text)?text:`https://${text}`); } catch { throw new Error('Enter a valid website URL.'); } if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use a public HTTP or HTTPS URL without credentials.'); const h = u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,''); if (!h || h.includes('..') || !h.includes('.') || /[\s\\]/.test(h)) throw new Error('Enter a valid public website domain.'); return h; }
export function normalizeWebsite(raw:string):string { return raw.trim()?`https://${normalizeDomain(raw)}`:''; }
export function calculateScore(l: Pick<Lead,'fit'|'services'|'findings'|'email'|'contactPage'|'sourceUrl'|'discovery'|'researchedAt'>): {score:number;breakdown:ScoreBreakdown;priority:Lead['priority'];explanation:string} {
 const fit = (l.fit.trim()?20:0) + (l.services.length?10:0);
 const verified = l.findings.filter(f=>f.confidence==='confirmed' && f.severity!=='info'); const problems=Math.min(30, verified.reduce((s,f)=>s+(f.severity==='high'?12:f.severity==='medium'?7:3),0));
 const relevance=Math.min(20,new Set(l.services).size*7);
 const contact=(l.email.trim()?6:0)+(l.contactPage.trim()?4:0);
 const source=(l.sourceUrl.trim()?5:0)+(l.discovery.trim()?3:0)+(l.researchedAt.trim()?2:0);
 const score=fit+problems+relevance+contact+source; const priority=score>=75?'High':score>=50?'Medium':'Low';
 const explanation=`Fit ${fit}/30, evidence ${problems}/30 (${verified.length} confirmed actionable finding${verified.length===1?'':'s'}), service relevance ${relevance}/20, contact route ${contact}/10, source quality ${source}/10. Missing information earns no points; an unverified issue earns no problem points.`;
 return {score,breakdown:{fit,problems,relevance,contact,source},priority,explanation};
}
export function makeLead(input:Partial<Lead>&Pick<Lead,'name'|'website'>): Lead { const now=new Date().toISOString(); const base:Lead={id:uid(),name:input.name.trim(),website:normalizeWebsite(input.website),country:input.country??'',city:input.city??'',type:input.type??'Direct business',industry:input.industry??'',sourceUrl:input.sourceUrl??'',discovery:input.discovery??'',contactName:input.contactName??'',email:input.email??'',contactPage:input.contactPage??'',notes:input.notes??'',fit:input.fit??'',services:input.services??[],findings:input.findings??[],score:0,breakdown:{fit:0,problems:0,relevance:0,contact:0,source:0},scoreExplanation:'',priority:'Low',manualPriority:null,researchedAt:input.researchedAt??'',stage:input.stage??'New',firstContact:input.firstContact??'',lastContact:input.lastContact??'',nextFollowUp:input.nextFollowUp??'',attempts:input.attempts??0,lastResponse:input.lastResponse??'',meetingDate:input.meetingDate??'',proposalAmount:input.proposalAmount??0,proposalDate:input.proposalDate??'',closedDate:input.closedDate??'',revenueWon:input.revenueWon??0,monthlyRevenue:input.monthlyRevenue??0,lossReason:input.lossReason??'',createdAt:input.createdAt??now,updatedAt:input.updatedAt??now,activities:input.activities??[{id:uid(),type:'Lead created',note:'Lead added to the workspace.',timestamp:now}]}; return validateLead({...base,...calculateScore(base)}); }
export function isValidLead(value:unknown): value is Lead { try { const lead=validateLead(value); return JSON.stringify(value)===JSON.stringify(lead); } catch { return false; } }
export function parseBackup(text:string): AppData { let data:unknown;try{data=JSON.parse(text)}catch{throw new Error('Backup is not valid JSON. Existing data was not changed.');}return validateData(data); }
export function csvCell(v:unknown):string { const s=Array.isArray(v)?v.join('; '):String(v??''); return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
export function makeCsv(leads:Lead[]):string { const keys=['name','website','country','city','type','industry','sourceUrl','discovery','contactName','email','contactPage','notes','fit','services','stage','firstContact','lastContact','nextFollowUp','attempts','lastResponse','meetingDate','proposalAmount','proposalDate','closedDate','revenueWon','monthlyRevenue','lossReason']; return [keys.join(','),...leads.map(l=>keys.map(k=>csvCell((l as unknown as Record<string,unknown>)[k])).join(','))].join('\r\n'); }
export function parseCsv(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closedQuote=false;
 const finishCell=()=>{row.push(cell);cell='';closedQuote=false};
 const finishRow=()=>{finishCell();rows.push(row);row=[]};
 const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;closedQuote=true;}else cell+=c;continue;}
  if(c===','){finishCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;finishRow();continue;}
  if(closedQuote)throw new Error('CSV has text after a closing quote. No records were imported.');
  if(c==='"'){if(cell)throw new Error('CSV quotes must start at the beginning of a field.');quoted=true;continue;}
  cell+=c;
 }
 if(quoted)throw new Error('CSV contains an unclosed quoted field.');
 if(cell||row.length||closedQuote)finishRow();
 if(rows.length<2)throw new Error('CSV needs a header and at least one lead.');
 const headers=rows[0].map(h=>h.trim());
 if(headers.some(h=>!h)||new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)throw new Error('CSV headers must be nonempty and unique.');
 const records=rows.slice(1).filter(r=>r.some(c=>c.trim()));
 if(!records.length)throw new Error('CSV needs at least one lead.');
 if(records.some(r=>r.length!==headers.length))throw new Error('CSV row width does not match its header.');
 return records.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
const field=(r:Record<string,string>,...keys:string[])=>{const key=Object.keys(r).find(k=>keys.includes(k.trim().toLowerCase()));return key?r[key].trim():''};
export function importCsvRows(rows:Record<string,string>[]):{leads:Lead[];duplicates:string[]} {
 const leads=rows.map((r,index)=>{
  try {
   const name=field(r,'name','business','business name'), website=field(r,'website','website url','domain');
   if(!name||!website)throw new Error('Each row needs a business name and website.');
   const typeRaw=field(r,'type','business type'),stageRaw=field(r,'stage');
   const type=typeRaw?['Agency','Direct business','Referral','Other'].find(s=>s.toLowerCase()===typeRaw.toLowerCase()):'Direct business';
   const stage=stageRaw?PIPELINE.find(s=>s.toLowerCase()===stageRaw.toLowerCase()):'New';
   if(!type||!stage)throw new Error('Unknown business type or pipeline stage.');
   return makeLead({name,website,country:field(r,'country'),city:field(r,'city'),industry:field(r,'industry','niche'),sourceUrl:field(r,'sourceurl','source url'),discovery:field(r,'discovery'),email:field(r,'email'),contactName:field(r,'contactname','contact name'),contactPage:field(r,'contactpage','contact page'),notes:field(r,'notes'),fit:field(r,'fit'),services:field(r,'services').split(/[;,]/).map(s=>s.trim()).filter(Boolean),type:type as Lead['type'],stage,
    firstContact:field(r,'firstcontact','first contact'),lastContact:field(r,'lastcontact','last contact'),nextFollowUp:field(r,'nextfollowup','next follow up'),lastResponse:field(r,'lastresponse','last response'),meetingDate:field(r,'meetingdate','meeting date'),proposalDate:field(r,'proposaldate','proposal date'),closedDate:field(r,'closeddate','closed date'),lossReason:field(r,'lossreason','loss reason'),
    attempts:numericValue(field(r,'attempts')||0,'attempts',true),proposalAmount:numericValue(field(r,'proposalamount','proposal amount')||0,'proposalAmount'),revenueWon:numericValue(field(r,'revenuewon','revenue won')||0,'revenueWon'),monthlyRevenue:numericValue(field(r,'monthlyrevenue','monthly revenue')||0,'monthlyRevenue')});
  } catch(error) {throw new Error(`CSV row ${index+2}: ${error instanceof Error?error.message:'Invalid record'}. No records were imported.`);}
 });
 const plan=planImport([],leads);return {leads:plan.imported,duplicates:plan.duplicates};
}
export type ImportPlan={imported:Lead[];duplicates:string[];skipped:number;invalid:number};
export function planImport(existing:Lead[],incoming:Lead[]):ImportPlan {
 const checked=incoming.map((l,i)=>validateLead(l,`Import lead ${i+1}`));
 const domains=new Map(existing.map(l=>[normalizeDomain(l.website),l.name]));
 const ids=new Set(existing.map(l=>l.id));const imported:Lead[]=[],duplicates:string[]=[];
 for(const lead of checked){const domain=normalizeDomain(lead.website);if(domains.has(domain)){duplicates.push(`${lead.name}: duplicate domain ${domain} (${domains.get(domain)})`);continue;}if(ids.has(lead.id)){duplicates.push(`${lead.name}: duplicate record ID`);continue;}domains.set(domain,lead.name);ids.add(lead.id);imported.push(lead);}
 return {imported,duplicates,skipped:duplicates.length,invalid:0};
}
export function dueLeads(leads:Lead[],todayISO=today()):{overdue:Lead[];today:Lead[];upcoming:Lead[]}{const scheduled=leads.filter(l=>l.nextFollowUp&&l.stage!=='Won'&&l.stage!=='Lost');return{overdue:scheduled.filter(l=>l.nextFollowUp<todayISO),today:scheduled.filter(l=>l.nextFollowUp===todayISO),upcoming:scheduled.filter(l=>l.nextFollowUp>todayISO).sort((a,b)=>a.nextFollowUp.localeCompare(b.nextFollowUp))};}
export const STAGE_FOR_ACTIVITY:Record<string,Stage>={'Contact made':'Contacted','Reply received':'Replied','Meeting booked':'Meeting booked','Proposal sent':'Proposal sent','Opportunity won':'Won','Opportunity lost':'Lost'};
export const totalRevenue=(leads:Lead[])=>leads.filter(l=>l.stage==='Won').reduce((s,l)=>s+numericValue(l.revenueWon,'revenueWon'),0);

export type LeadSort = 'name'|'createdAt'|'updatedAt'|'score'|'nextFollowUp';
export function sortLeads(leads:Lead[], field:LeadSort, descending=false):Lead[] {
 return [...leads].sort((a,b)=>{const av=a[field],bv=b[field]; if(av==='')return bv===''?a.id.localeCompare(b.id):1;if(bv==='')return -1;const order=typeof av==='number'?av-Number(bv):field==='createdAt'||field==='updatedAt'?Date.parse(String(av))-Date.parse(String(bv)):String(av).localeCompare(String(bv),undefined,{sensitivity:'base'});return (descending?-order:order)||a.id.localeCompare(b.id)});
}
export function modifyLead(lead:Lead,patch:Partial<Lead>,existing:Lead[],activity?:string,now=new Date()):Lead {
 const next={...lead,...patch};
 if('name' in patch)next.name=next.name.trim();
 if('website' in patch){next.website=normalizeWebsite(next.website);if(existing.some(l=>l.id!==lead.id&&normalizeDomain(l.website)===normalizeDomain(next.website)))throw new Error('This website already belongs to another lead.');}
 const changed=Object.keys(patch).filter(k=>JSON.stringify(lead[k as keyof Lead])!==JSON.stringify(next[k as keyof Lead]));
 const explicit=activity?.startsWith('Note added:')||activity==='Outreach drafted'||activity==='Contact made';
 if(!changed.length&&!explicit)return lead;
 const stamp=now.toISOString(); const events:Activity[]=[];
 const add=(type:string,note:string)=>events.push({id:uid(),type,note,timestamp:stamp});
 if(next.stage!==lead.stage){add('Pipeline stage changed',`${lead.stage} \u2192 ${next.stage}`);const milestone=Object.keys(STAGE_FOR_ACTIVITY).find(type=>STAGE_FOR_ACTIVITY[type]===next.stage);if(milestone&&milestone!==activity)add(milestone,`User recorded ${next.stage}: ${lead.stage} \u2192 ${next.stage}`);}
 if(next.nextFollowUp!==lead.nextFollowUp)add(activity==='Follow-up completed'?'Follow-up completed':next.nextFollowUp?'Follow-up scheduled':'Follow-up cleared',`${lead.nextFollowUp||'Unscheduled'} \u2192 ${next.nextFollowUp||'No follow-up'}`);
 if(activity&&activity!=='Pipeline stage changed'&&activity!=='Follow-up completed'&&activity!=='Follow-up scheduled')add(activity.startsWith('Note added:')?'Note added':activity,activity.startsWith('Note added:')?activity.slice(11):'Recorded by user.');
 if(!events.length)add('Lead updated',`Updated ${changed.join(', ')}.`);
 return validateLead({...next,...calculateScore(next),updatedAt:stamp,activities:[...events,...lead.activities]});
}
export function salesMetrics(leads:Lead[]){
 const recorded=(l:Lead,type:string,field:string)=>Boolean(l[field as keyof Lead])||l.activities.some(a=>a.type===type);
 return {contacted:leads.filter(l=>recorded(l,'Contact made','firstContact')||l.attempts>0).length,replies:leads.filter(l=>recorded(l,'Reply received','lastResponse')).length,meetings:leads.filter(l=>recorded(l,'Meeting booked','meetingDate')).length,proposals:leads.filter(l=>recorded(l,'Proposal sent','proposalDate')).length,won:leads.filter(l=>l.stage==='Won').length,revenue:totalRevenue(leads)};
}
export type Draft = {leadId:string;kind:string;purpose:string;subject:string;body:string};
export function createDraft(l:Lead,kind:string,purpose:string):Draft {
 const greeting=l.contactName.trim()||'there';
 const finding=l.findings.find(f=>f.confidence==='confirmed'&&f.severity!=='info'&&f.evidence.trim()&&f.pageUrl&&normalizeDomain(f.pageUrl)===normalizeDomain(l.website));
 const intro=kind==='Agency partnership'?`I run PixlDot, a web development studio. Would ${l.name} be interested in implementation support for agency projects?`:`I run PixlDot, a web development studio. Would ${l.name} be interested in discussing website development support?`;
 const evidence=finding?`\n\nA saved website finding: ${finding.title}. Evidence: ${finding.evidence} (${finding.pageUrl}). ${finding.recommendation}`:'';
 const text=purpose==='Polite follow-up'?`I wanted to check whether website development support would be useful for ${l.name}. If this is relevant, I would be happy to share more details.`:purpose==='Final follow-up / nurture'?`Would it be useful to revisit website development support for ${l.name} at a later date? I will leave this here for now; you are welcome to reach out whenever the timing suits.`:intro+evidence;
 return {leadId:l.id,kind,purpose,subject:purpose==='Initial outreach'?`${kind==='Agency partnership'?'Agency implementation':'Website development'} support for ${l.name}`:`${purpose==='Polite follow-up'?'Checking in':'Keeping in touch'} \u2192 ${l.name}`,body:`Hi ${greeting},\n\n${text}\n\nBest,\nRajesh\nPixlDot\nhttps://pixldot.com`};
}
