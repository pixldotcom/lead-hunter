import {emptyData,normalizeDomain,uid,type AppData} from './domain.ts';
import {requireUniqueLeadIds,validateData} from './dataValidation.ts';
import {emptyDiscovery,validateDiscovery,type DiscoveryData} from './discovery.ts';
import {validateDraftData,type DraftData} from './draftPersistence.ts';
import {TEXT_SCALES,type TextScale} from './textScale.ts';
export type CloudData={version:1;leads:AppData;discovery:DiscoveryData;drafts:DraftData;preferences:{textScale:TextScale}};
export type CloudSnapshot={revision:number;data:CloudData};
export const emptyCloud=():CloudData=>({version:1,leads:emptyData(),discovery:emptyDiscovery(),drafts:{version:1,drafts:[]},preferences:{textScale:175}});
export function validateCloud(raw:unknown):CloudData{
 const d=raw as CloudData;if(!d||d.version!==1||!d.preferences||!TEXT_SCALES.includes(d.preferences.textScale))throw Error('Invalid cloud workspace or preferences.');
 const leads=requireUniqueLeadIds(validateData(d.leads)),discovery=validateDiscovery(d.discovery),drafts=validateDraftData(d.drafts);
 if(leads.leads.length>5000||drafts.drafts.length>5000)throw Error('Workspace record limit exceeded.');
 const domains=new Set<string>();for(const lead of leads.leads){const domain=normalizeDomain(lead.website);if(domains.has(domain))throw Error('Duplicate lead domain.');domains.add(domain)}
 const result:CloudData={version:1,leads,discovery,drafts,preferences:{textScale:d.preferences.textScale}};
 if(new TextEncoder().encode(JSON.stringify(result)).length>3_000_000)throw Error('Workspace exceeds the 3 MB cloud limit. Export a backup and reduce stored evidence.');return result;
}
export function mergeCloud(target:CloudData,source:CloudData,useSourcePreferences=false){
 validateCloud(source);validateCloud(target);const next=structuredClone(target),leadMap=new Map<string,string>();let addedLeads=0,addedProspects=0,addedDrafts=0;
 const domains=new Map(next.leads.leads.map(l=>[normalizeDomain(l.website),l.id]));const ids=new Set(next.leads.leads.map(l=>l.id));
 for(const original of source.leads.leads){const domain=normalizeDomain(original.website),existing=domains.get(domain);if(existing){leadMap.set(original.id,existing);continue}const id=ids.has(original.id)?uid():original.id;ids.add(id);domains.set(domain,id);leadMap.set(original.id,id);next.leads.leads.push({...original,id});addedLeads++}
 const batchMap=new Map<string,string>(),batchIds=new Set(next.discovery.batches.map(b=>b.id));for(const b of source.discovery.batches){const existing=next.discovery.batches.find(x=>x.id===b.id);if(existing&&JSON.stringify(existing)===JSON.stringify(b)){batchMap.set(b.id,b.id);continue}const id=batchIds.has(b.id)?uid():b.id;batchIds.add(id);batchMap.set(b.id,id);next.discovery.batches.push({...b,id})}
 const known=new Set(next.discovery.candidates.map(c=>c.domain)),candidateIds=new Set(next.discovery.candidates.map(c=>c.id));
 for(const c of source.discovery.candidates){if(known.has(c.domain))continue;known.add(c.domain);const id=candidateIds.has(c.id)?uid():c.id;candidateIds.add(id);next.discovery.candidates.push({...c,id,batchId:batchMap.get(c.batchId)!,leadId:leadMap.get(c.leadId)??''});addedProspects++}

 const draftIds=new Set(next.drafts.drafts.map(d=>d.leadId));for(const d of source.drafts.drafts){const leadId=leadMap.get(d.leadId)??(ids.has(d.leadId)?uid():d.leadId);if(draftIds.has(leadId))continue;draftIds.add(leadId);next.drafts.drafts.push({...d,leadId});addedDrafts++}
 if(useSourcePreferences){next.preferences=source.preferences;next.discovery.preferences=source.discovery.preferences}
 return {data:validateCloud(next),summary:{addedLeads,addedProspects,addedDrafts}};
}
