import {describe,it,expect} from 'vitest';
import {emptyCloud,mergeCloud,validateCloud} from './cloudModel';
import {makeLead,createDraft} from './domain';
import {prepareDraft} from './draftPersistence';
import {emptyDiscovery,importCandidates} from './discovery';
import {createBusinessRecord} from './opportunityPersistence';
import {detectOpportunities} from './opportunityDetection';
describe('full cloud backup and safe legacy merge',()=>{
 it('preserves zero-candidate batches, promoted-prospect history and drafts in an empty account',()=>{
  const source=emptyCloud(),lead=makeLead({name:'Promoted',website:'one.example'});source.leads.leads=[lead];source.discovery=importCandidates(emptyDiscovery(),[{website:'one.example'}],[],emptyDiscovery().preferences);source.discovery.candidates[0].leadId=lead.id;source.discovery=importCandidates(source.discovery,[{website:'one.example'}],[],source.discovery.preferences);source.drafts.drafts=[prepareDraft(createDraft(lead,'Direct business','Initial outreach'))];source.preferences.textScale=125;
  const result=mergeCloud(emptyCloud(),source,true);expect(result.data).toEqual(source);expect(result.summary).toEqual({addedLeads:1,addedProspects:1,addedBusinesses:0,addedDrafts:1});
 });
 it('skips domain aliases and existing drafts while remapping colliding ids to the correct business',()=>{
  const target=emptyCloud(),existing=makeLead({name:'Existing',website:'https://www.one.example'});target.leads.leads=[existing];target.drafts.drafts=[prepareDraft(createDraft(existing,'Direct business','Initial outreach'))];const source=emptyCloud(),duplicate=makeLead({name:'Duplicate',website:'one.example'}),other={...makeLead({name:'Other',website:'two.example'}),id:existing.id};source.leads.leads=[duplicate,other];source.drafts.drafts=[prepareDraft(createDraft(other,'Direct business','Initial outreach'))];
  const before=JSON.stringify(target),merged=mergeCloud(target,source);expect(JSON.stringify(target)).toBe(before);expect(merged.data.leads.leads).toHaveLength(2);const copied=merged.data.leads.leads.find(l=>l.name==='Other')!;expect(copied.id).not.toBe(existing.id);expect(merged.data.drafts.drafts.some(d=>d.leadId===copied.id)).toBe(true);
 });
 it('imports opportunity businesses and remaps their analyses when a matching business already exists',()=>{
  const target=emptyCloud(),existing=createBusinessRecord({name:'Example Dental',location:'Ludhiana',websiteStatus:'unknown'});target.discovery.businesses=[existing];
  const source=emptyCloud(),original=createBusinessRecord({name:'Example Dental',location:'Ludhiana',websiteStatus:'no_website_found'});source.discovery.businesses=[original];source.discovery.opportunityAnalyses=[detectOpportunities(original,[])];
  const merged=mergeCloud(target,source);expect(merged.summary.addedBusinesses).toBe(0);expect(merged.data.discovery.businesses).toHaveLength(1);expect(merged.data.discovery.opportunityAnalyses[0].businessId).toBe(existing.id);
 });
 it('validates complete backups and keeps existing account preferences by default',()=>{
  const target=emptyCloud(),source=emptyCloud();target.preferences.textScale=150;source.preferences.textScale=100;expect(mergeCloud(target,source).data.preferences.textScale).toBe(150);expect(()=>validateCloud({...source,preferences:{textScale:200}})).toThrow();
 });
});
