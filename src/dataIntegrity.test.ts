import { describe, expect, it } from 'vitest';
import { importCsvRows, makeCsv, makeLead, parseBackup, parseCsv, planImport, STORE_KEY, totalRevenue, type Lead } from './domain';
import { normalizeNumericInput, validateData, validateLead } from './dataValidation';
import { loadWorkspace, persistWorkspace, restoreWorkspace } from './persistence';

function fixture(): Lead {
  return makeLead({ name:'Cedar Design Studio',website:'cedar.example',type:'Agency',country:'India',city:'Pune',industry:'Design',sourceUrl:'https://directory.example/cedar',discovery:'Agency directory',contactName:'Alex',email:'alex@cedar.example',contactPage:'https://cedar.example/contact',notes:'Discuss capacity next month.\nAsk about launch dates.',fit:'Agency development support',services:['WordPress development','Website fixes'],stage:'Won',researchedAt:'2026-10-15',firstContact:'2026-10-01',lastContact:'2026-10-10',nextFollowUp:'2026-11-01',attempts:2,lastResponse:'Requested proposal',meetingDate:'2026-10-05',proposalAmount:15000.75,proposalDate:'2026-10-07',closedDate:'2026-10-15',revenueWon:12000.50,monthlyRevenue:1500.25,lossReason:'',findings:[{id:'finding-1',title:'Missing viewport',category:'Accessibility',severity:'medium',explanation:'No viewport observed',evidence:'No viewport meta',pageUrl:'https://cedar.example/',recommendation:'Review viewport declaration',confidence:'confirmed',timestamp:'2026-10-15T10:00:00.000Z'}],activities:[{id:'activity-1',type:'Proposal sent',note:'Sent after meeting',timestamp:'2026-10-07T11:20:30.000Z'}] });
}
function backup(leads: unknown[] = [fixture()]) { return JSON.stringify({version:1,leads}); }
function memory(raw: string | null = null) {
  const values = new Map<string,string>(raw===null?[]:[[STORE_KEY,raw]]);
  return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};
}
describe('version 1 schema',()=> {
  it('roundtrips every current field including nested structures and manual priority',()=> {
    const lead={...fixture(),manualPriority:'High',extension:{note:'Retain unknown extension without interpretation'}};
    const data=parseBackup(backup([lead]));expect(data.leads[0]).toEqual(lead);expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it.each(['{','null','[]','{"version":1}','{"version":1,"leads":{}}'])('rejects invalid documents: %s',raw=>expect(()=>parseBackup(raw)).toThrow());
  it.each([undefined,0,2,'1',null])('rejects unsupported or missing version %s',version=>expect(()=>parseBackup(JSON.stringify({version,leads:[]}))).toThrow('version'));
  it('requires all supported fields rather than guessing defaults',()=> { const lead:Record<string,unknown>={...fixture()}; delete lead.monthlyRevenue;expect(()=>parseBackup(backup([lead]))).toThrow('monthlyRevenue'); });
  it.each(['activities','findings','services','breakdown'])('rejects malformed %s',field=>expect(()=>parseBackup(backup([{...fixture(),[field]:null}]))).toThrow(field));
  it('rejects invalid nested activity types, dates and duplicate IDs',()=> {
    const lead=fixture();expect(()=>validateLead({...lead,activities:[{...lead.activities[0],note:4}]})).toThrow('note');
    expect(()=>validateLead({...lead,activities:[{...lead.activities[0],timestamp:'2026-02-30T10:00:00Z'}]})).toThrow('timestamp');
    expect(()=>validateLead({...lead,activities:[lead.activities[0],lead.activities[0]]})).toThrow('duplicate IDs');
  });
  it.each(['2026-02-30','2025-02-29','2026-13-01','17/10/2026','2026-1-1','tomorrow'])('rejects invalid follow-up date %s',nextFollowUp=>expect(()=>validateLead({...fixture(),nextFollowUp})).toThrow('nextFollowUp'));
  it('accepts leap days, empty optional dates and timestamps with timezone offsets',()=>expect(validateLead({...fixture(),meetingDate:'2024-02-29',closedDate:'',updatedAt:'2026-10-17T10:00:00+05:30'}).meetingDate).toBe('2024-02-29'));
  it('rejects invalid enumerations and nested finding fields',()=> {
    const lead=fixture();for(const patch of [{stage:'Unknown'},{manualPriority:'Urgent'},{type:'Company'},{findings:[{...lead.findings[0],confidence:'certain'}]},{findings:[{...lead.findings[0],pageUrl:'javascript:alert(1)'}]}])expect(()=>validateLead({...lead,...patch})).toThrow();
  });
  it('rejects invalid websites, contact URLs and emails',()=> {for(const patch of [{website:''},{website:'localhost'},{contactPage:'javascript:alert(1)'},{email:'not-an-email'}])expect(()=>validateLead({...fixture(),...patch})).toThrow();});
});
describe('numeric boundaries',()=> {
  it('normalizes the known version 1 numeric-string defect without mutating input',()=> {
    const original={...fixture(),attempts:'2',proposalAmount:'15000.75',revenueWon:'12000.50',monthlyRevenue:'1500.25',score:'88',breakdown:{fit:'30',problems:'21',relevance:'20',contact:'10',source:'7'}};
    const lead=parseBackup(backup([original])).leads[0];expect(lead.attempts+1).toBe(3);expect(lead.proposalAmount).toBe(15000.75);expect(lead.revenueWon).toBe(12000.5);expect(lead.monthlyRevenue).toBe(1500.25);expect(lead.score).toBe(88);expect(lead.breakdown.fit).toBe(30);expect(original.attempts).toBe('2');
  });
  it.each([NaN,Infinity,-Infinity,'NaN','Infinity','-Infinity','',null,true,{},'0x10','1,000'])('rejects malformed numeric value %s',value=>expect(()=>validateLead({...fixture(),revenueWon:value})).toThrow('revenueWon'));
  it.each([-1,'-1',Number.MAX_SAFE_INTEGER+1])('rejects out-of-range money %s',value=> {for(const key of ['proposalAmount','revenueWon','monthlyRevenue'])expect(()=>validateLead({...fixture(),[key]:value})).toThrow(key);});
  it('requires whole attempts and bounded score values',()=> {
    for(const attempts of [1.5,-1,Number.MAX_SAFE_INTEGER+1])expect(()=>validateLead({...fixture(),attempts})).toThrow('attempts');
    expect(()=>validateLead({...fixture(),score:101})).toThrow('score');expect(()=>validateLead({...fixture(),breakdown:{...fixture().breakdown,fit:31}})).toThrow('fit');
  });
  it('maps a cleared numeric form input to zero and preserves valid decimals',()=> {expect(normalizeNumericInput('proposalAmount','')).toBe(0);expect(normalizeNumericInput('revenueWon','125.50')).toBe(125.5);expect(()=>normalizeNumericInput('attempts','1.5')).toThrow();});
  it('calculates dashboard won revenue without concatenation or adding proposal/recurring/lost revenue',()=> {
    const won=validateLead({...fixture(),revenueWon:'100.25',proposalAmount:900,monthlyRevenue:50});const other=makeLead({name:'Elm',website:'elm.example',stage:'Won',revenueWon:200.5});const lost=makeLead({name:'Ash',website:'ash.example',stage:'Lost',revenueWon:999});expect(totalRevenue([won,other,lost])).toBe(300.75);
  });
});
describe('imports',()=> {
  it('deduplicates normalized domains within JSON and against existing leads with first record winning',()=> {
    const existing=fixture();const incoming=makeLead({name:'Maple',website:'maple.example'});
    const plan=planImport([existing],parseBackup(backup([{...existing,id:'new-id',website:'https://WWW.CEDAR.example/contact'},incoming,{...incoming,id:'other-id',website:'http://www.maple.example/'}])).leads);
    expect(plan.imported).toEqual([incoming]);expect(plan.skipped).toBe(2);expect(plan.invalid).toBe(0);expect(existing.name).toBe('Cedar Design Studio');
  });
  it('skips conflicting IDs without creating ambiguous records',()=> {const existing=fixture();expect(planImport([existing],[{...existing,website:'other.example'}]).skipped).toBe(1);});
  it('validates duplicates too and rejects the complete import if any record is invalid',()=> {
    const existing=[fixture()];const before=JSON.stringify(existing);expect(()=>planImport(existing,[{...existing[0],attempts:-1}])).toThrow();expect(JSON.stringify(existing)).toBe(before);
  });
  it('preserves every field promised by CSV export',()=> {
    const original=fixture();const csv=makeCsv([original]);const imported=importCsvRows(parseCsv(csv)).leads[0];
    const headers=csv.split('\r\n')[0].split(',');for(const key of headers)expect(imported[key as keyof Lead],key).toEqual(original[key as keyof Lead]);
  });
  it('rejects invalid CSV amounts, dates and stages atomically',()=> {
    for(const bad of ['name,website,revenueWon\nGood,good.example,1\nBad,bad.example,Infinity','name,website,nextFollowUp\nBad,bad.example,2026-02-30','name,website,stage\nBad,bad.example,Unrecognized'])expect(()=>importCsvRows(parseCsv(bad))).toThrow('No records were imported');
  });
  it('rejects ambiguous CSV headers and mismatched row widths',()=> {expect(()=>parseCsv('name,name,website\nA,B,a.example')).toThrow('unique');expect(()=>parseCsv('name,website\nA,a.example,extra')).toThrow('width');});
  it.each(['name,website\n"Cedar"trailing,cedar.example','name,website\nCed"ar,cedar.example','name,website\n"Cedar,cedar.example'])('rejects malformed CSV quoting: %s',csv=>expect(()=>parseCsv(csv)).toThrow());
  it('roundtrips quoted commas, escaped quotes, newlines and CRLF',()=> {
    const lead={...fixture(),name:'Cedar, "Studio"',notes:'First line\r\nSecond "quoted" line'};
    const restored=importCsvRows(parseCsv(makeCsv([lead]))).leads[0];expect(restored.name).toBe(lead.name);expect(restored.notes).toBe(lead.notes);
  });
  it('deduplicates CSV domains within a file',()=> {const result=importCsvRows(parseCsv('name,website\nOne,one.example\nOther,https://www.one.example/path'));expect(result.leads).toHaveLength(1);expect(result.duplicates).toHaveLength(1);});
});
describe('storage and recovery',()=> {
  it('creates an empty workspace only when the key is absent, without writing',()=> {const storage=memory();expect(loadWorkspace(storage).data).toEqual({version:1,leads:[]});expect(storage.values.size).toBe(0);});
  it('loads current valid data without modifying raw storage',()=> {const raw=backup();const storage=memory(raw);const state=loadWorkspace(storage);expect(state.data?.leads).toHaveLength(1);expect(state.normalizationPending).toBe(false);expect(storage.getItem(STORE_KEY)).toBe(raw);});
  it.each(['','{bad','{"version":2,"leads":[]}',backup([{id:'broken'}])])('preserves malformed raw storage for recovery: %s',raw=> {
    const storage=memory(raw);const state=loadWorkspace(storage);expect(state.data).toBeNull();expect(state.raw).toBe(raw);expect(state.error).not.toBe('');expect(()=>persistWorkspace(storage,state,{version:1,leads:[]})).toThrow('blocked');expect(storage.getItem(STORE_KEY)).toBe(raw);expect(storage.values.size).toBe(1);
  });
  it('backs up the raw original before writing normalized numeric-string records',()=> {
    const raw=backup([{...fixture(),attempts:'2',revenueWon:'12000.50'}]);const storage=memory(raw);const current=loadWorkspace(storage);expect(current.normalizationPending).toBe(true);expect(storage.values.size).toBe(1);
    const saved=persistWorkspace(storage,current,current.data!);expect(saved.normalizationPending).toBe(false);expect(parseBackup(storage.getItem(STORE_KEY)!).leads[0].attempts).toBe(2);expect([...storage.values.entries()].find(([key])=>key!==STORE_KEY)?.[1]).toBe(raw);
  });
  it('does not overwrite original data if preserving the recovery copy fails',()=> {
    const raw=backup([{...fixture(),attempts:'2'}]);const storage=memory(raw);const current=loadWorkspace(storage);const denied={getItem:storage.getItem,setItem:()=>{throw Error('Storage quota exceeded')}};
    expect(()=>persistWorkspace(denied,current,current.data!)).toThrow('quota');expect(storage.getItem(STORE_KEY)).toBe(raw);expect(current.data?.leads[0].attempts).toBe(2);
  });
  it('keeps memory and storage unchanged on failed imports or invalid writes',()=> {
    const raw=backup();const storage=memory(raw);const current=loadWorkspace(storage);const before=JSON.stringify(current);expect(()=>persistWorkspace(storage,current,{version:1,leads:[{...fixture(),revenueWon:-1}]})).toThrow();expect(JSON.stringify(current)).toBe(before);expect(storage.getItem(STORE_KEY)).toBe(raw);
  });
  it('does not apply a reviewed import until explicitly saved',()=> {const storage=memory(backup());const current=loadWorkspace(storage);planImport(current.data!.leads,[makeLead({name:'Maple',website:'maple.example'})]);expect(storage.getItem(STORE_KEY)).toBe(current.raw);});
  it('detects changes in another tab',()=> {const storage=memory(backup());const current=loadWorkspace(storage);storage.setItem(STORE_KEY,backup([]));expect(()=>persistWorkspace(storage,current,current.data!)).toThrow('another tab');expect(storage.getItem(STORE_KEY)).toBe(backup([]));});
  it('requires explicit recovery and preserves raw data before replacement',()=> {
    const raw='{damaged';const storage=memory(raw);const current=loadWorkspace(storage);const repaired=validateData({version:1,leads:[fixture()]});const result=restoreWorkspace(storage,current,repaired);expect(result.data).toEqual(repaired);expect([...storage.values.entries()].find(([key])=>key!==STORE_KEY)?.[1]).toBe(raw);
  });
  it('refuses invalid recovery data without changing storage',()=> {const storage=memory('{damaged');const current=loadWorkspace(storage);expect(()=>restoreWorkspace(storage,current,{version:2,leads:[]})).toThrow('version');expect(storage.values.size).toBe(1);expect(storage.getItem(STORE_KEY)).toBe('{damaged');});
  it('keeps the previous workspace when an ordinary storage write fails',()=> {
    const raw=backup();const storage=memory(raw);const current=loadWorkspace(storage);const before=JSON.stringify(current);
    expect(()=>persistWorkspace({getItem:storage.getItem,setItem:()=>{throw Error('Storage unavailable')}},current,{version:1,leads:[]})).toThrow('Storage unavailable');
    expect(storage.getItem(STORE_KEY)).toBe(raw);expect(JSON.stringify(current)).toBe(before);
  });
  it('refuses recovery replacement when the original cannot be copied',()=> {
    const storage=memory('{damaged');const current=loadWorkspace(storage);
    expect(()=>restoreWorkspace({getItem:storage.getItem,setItem:()=>{throw Error('quota')}},current,{version:1,leads:[]})).toThrow('quota');expect(storage.getItem(STORE_KEY)).toBe('{damaged');
  });
  it('reports inaccessible storage without creating a workspace or attempting a write',()=> {
    const state=loadWorkspace({getItem:()=>{throw Error('Storage access denied')},setItem:()=>{throw Error('Unexpected write')}});expect(state.data).toBeNull();expect(state.raw).toBeNull();expect(state.error).toContain('denied');
  });
  it('does not guess a repair for a workspace with duplicate IDs',()=> {const lead=fixture();const storage=memory(backup([lead,{...lead,website:'other.example'}]));expect(loadWorkspace(storage).data).toBeNull();});
});
