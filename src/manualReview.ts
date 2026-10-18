import {csvCell,parseCsv,uid} from './domain.ts';
import {searchWebsite,validateSearchResults,type SearchResult} from './searchCatalogue.ts';
import type {Candidate,CandidateInput} from './discovery.ts';

export const REVIEW_AREAS=['Visual / design quality','Mobile usability','Clarity of services','Calls to action','Contact journey','Trust signals'] as const;
export const CHECK_STATES=['Not checked','Looks good','Needs work','Not applicable'] as const;
export type ManualFinding={id:string;title:string;severity:'info'|'low'|'medium'|'high';evidence:string};
export type ManualReview={notes:string;checklist:Record<string,typeof CHECK_STATES[number]>;findings:ManualFinding[];visualInspectionPerformed:boolean;reviewedAt:string};
export const emptyManualReview=():ManualReview=>({notes:'',checklist:Object.fromEntries(REVIEW_AREAS.map(k=>[k,'Not checked'])),findings:[],visualInspectionPerformed:false,reviewedAt:''});
export function validateManualReview(raw:unknown):ManualReview{
 if(!raw||typeof raw!=='object')throw Error('Invalid manual review.');const r=raw as ManualReview;
 if(typeof r.notes!=='string'||typeof r.visualInspectionPerformed!=='boolean'||typeof r.reviewedAt!=='string'||(r.reviewedAt!==''&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.reviewedAt)||!Number.isFinite(Date.parse(r.reviewedAt))||new Date(r.reviewedAt).toISOString()!==r.reviewedAt))||!r.checklist||typeof r.checklist!=='object'||REVIEW_AREAS.some(k=>!CHECK_STATES.includes(r.checklist[k]))||!Array.isArray(r.findings)||r.findings.length>100)throw Error('Invalid manual review fields.');
 const ids=new Set();for(const f of r.findings){if(!f||typeof f.id!=='string'||!f.id.trim()||ids.has(f.id)||typeof f.title!=='string'||!f.title.trim()||typeof f.evidence!=='string'||!f.evidence.trim()||!['info','low','medium','high'].includes(f.severity))throw Error('Each human finding needs a unique ID, title, severity and evidence.');ids.add(f.id)}
 return r;
}
const format='pixldot-prospects-v1';
const fields=['format','website','name','source','sourceQuery','searchTitle','snippet','discoveredAt','decision','notes','manualReview'];
const safe=(value:string)=>csvCell(/^(?:'|\s*[=+@-])/.test(value)?`'${value}`:value);
export function prospectsCsv(candidates:Candidate[]):string{return [fields.join(','),...candidates.map(c=>[format,c.website,c.review?.name||(c.name===c.domain?'':c.name),c.source,c.searchEvidence?.query??'',c.searchEvidence?.title??'',c.searchEvidence?.snippet??'',c.discoveredAt,c.decision,c.manualReview?.notes??'',c.manualReview?JSON.stringify(c.manualReview):''].map(safe).join(','))].join('\r\n')}
export function parseProspectCsv(text:string):CandidateInput[]{
 if(text.length>50000)throw Error('CSV import is limited to 50,000 characters.');const records=parseCsv(text);if(records.length>100)throw Error('Import at most 100 candidates.');
 return records.map(row=>{const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.trim().toLowerCase(),v]));if(r.format===format)for(const k of Object.keys(r))if(r[k].startsWith("'"))r[k]=r[k].slice(1);
  const website=r.website||r.domain||r.url||'';const input:CandidateInput={website,name:r.name||r.business||'',source:r.source||r.sourceurl||'CSV import'};
  if(r.discoveredat)input.discoveredAt=r.discoveredat;
  if(r.sourcequery){const site=searchWebsite(website);input.searchEvidence=validateSearchResults([{...site,title:r.searchtitle||'',snippet:r.snippet||'',query:r.sourcequery,discoveredAt:r.discoveredat}])[0]}
  if(r.decision)input.decision=r.decision as Candidate['decision'];
  if(r.manualreview){let review:unknown;try{review=JSON.parse(r.manualreview)}catch{throw Error('Invalid manual-review JSON in CSV. No candidates imported.')}input.manualReview=validateManualReview(review)}
  if('notes' in r)input.manualReview=validateManualReview({...input.manualReview??emptyManualReview(),notes:r.notes});
  return input;
 });
}
export function searchInputs(rows:SearchResult[]):CandidateInput[]{return validateSearchResults(rows).map(r=>({website:r.url,source:'Brave Search',searchEvidence:r,discoveredAt:r.discoveredAt}))}
export function newFinding(title:string,severity:ManualFinding['severity'],evidence:string):ManualFinding{if(!title.trim()||!evidence.trim())throw Error('Add a finding title and the evidence you observed.');return {id:uid(),title:title.trim(),severity,evidence:evidence.trim()}}
