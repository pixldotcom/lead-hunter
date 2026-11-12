import {emptyData,normalizeDomain,uid,type AppData} from './domain.ts';
import {requireUniqueLeadIds,validateData} from './dataValidation.ts';
import {emptyDiscovery,validateDiscovery,type DiscoveryData} from './discovery.ts';
import {sameBusiness} from './opportunityPersistence.ts';
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
 const normalizedSource=validateCloud(source),normalizedTarget=validateCloud(target);
 const next=structuredClone(normalizedTarget),leadMap=new Map<string,string>();
 let addedLeads=0,addedProspects=0,addedBusinesses=0,addedDrafts=0;
 const domains=new Map(next.leads.leads.map(l=>[normalizeDomain(l.website),l.id]));
 const ids=new Set(next.leads.leads.map(l=>l.id));
 for(const original of normalizedSource.leads.leads){
  const domain=normalizeDomain(original.website),existing=domains.get(domain);
  if(existing){leadMap.set(original.id,existing);continue}
  const id=ids.has(original.id)?uid():original.id;ids.add(id);domains.set(domain,id);leadMap.set(original.id,id);next.leads.leads.push({...original,id});addedLeads++;
 }
 const batchMap=new Map<string,string>(),batchIds=new Set(next.discovery.batches.map(b=>b.id));
 for(const batch of normalizedSource.discovery.batches){
  const existing=next.discovery.batches.find(item=>item.id===batch.id);
  if(existing&&JSON.stringify(existing)===JSON.stringify(batch)){batchMap.set(batch.id,batch.id);continue}
  const id=batchIds.has(batch.id)?uid():batch.id;batchIds.add(id);batchMap.set(batch.id,id);next.discovery.batches.push({...batch,id});
 }
 const known=new Set(next.discovery.candidates.map(c=>c.domain)),candidateIds=new Set(next.discovery.candidates.map(c=>c.id));
 for(const candidate of normalizedSource.discovery.candidates){
  if(known.has(candidate.domain))continue;
  known.add(candidate.domain);const id=candidateIds.has(candidate.id)?uid():candidate.id;candidateIds.add(id);
  next.discovery.candidates.push({...candidate,id,batchId:batchMap.get(candidate.batchId)!,leadId:leadMap.get(candidate.leadId)??''});addedProspects++;
 }
 const businesses=[...(next.discovery.businesses??[])],analyses=[...(next.discovery.opportunityAnalyses??[])];
 const businessMap=new Map<string,string>(),businessIds=new Set(businesses.map(b=>b.id));
 for(const business of normalizedSource.discovery.businesses??[]){
  const existing=businesses.find(item=>sameBusiness(item,business));
  if(existing){
   businessMap.set(business.id,existing.id);
   const merged={...existing,category:existing.category||business.category,websiteUrl:existing.websiteUrl||business.websiteUrl,websiteStatus:existing.websiteStatus==='unknown'?business.websiteStatus:existing.websiteStatus,rating:existing.rating??business.rating,reviewCount:existing.reviewCount??business.reviewCount,phone:existing.phone||business.phone,email:existing.email||business.email,profiles:[...new Set([...existing.profiles,...business.profiles])],sourceUrl:existing.sourceUrl||business.sourceUrl,discoverySource:existing.discoverySource||business.discoverySource};
   businesses[businesses.findIndex(item=>item.id===existing.id)]=merged;
   continue;
  }
  const id=businessIds.has(business.id)?uid():business.id;businessIds.add(id);businessMap.set(business.id,id);businesses.push({...business,id});addedBusinesses++;
 }
 const analyzedIds=new Set(analyses.map(item=>item.businessId));
 for(const analysis of normalizedSource.discovery.opportunityAnalyses??[]){
  const businessId=businessMap.get(analysis.businessId);
  if(!businessId||analyzedIds.has(businessId))continue;
  analyses.push({...analysis,businessId});analyzedIds.add(businessId);
 }
 next.discovery={...next.discovery,businesses,opportunityAnalyses:analyses};
 const draftIds=new Set(next.drafts.drafts.map(d=>d.leadId));
 for(const draft of normalizedSource.drafts.drafts){
  const leadId=leadMap.get(draft.leadId)??(ids.has(draft.leadId)?uid():draft.leadId);
  if(draftIds.has(leadId))continue;
  draftIds.add(leadId);next.drafts.drafts.push({...draft,leadId});addedDrafts++;
 }
 if(useSourcePreferences){next.preferences=normalizedSource.preferences;next.discovery.preferences=normalizedSource.discovery.preferences}
 return {data:validateCloud(next),summary:{addedLeads,addedProspects,addedBusinesses,addedDrafts}};
}
