import {type Draft, uid} from './domain.ts';

export const DRAFT_KEY = 'pixldot-outreach-drafts-v1';
export type SavedDraft = Draft & {createdAt:string;updatedAt:string};
export type DraftData = {version:1;drafts:SavedDraft[]};
export type DraftWorkspace = {data:DraftData|null;raw:string|null;error:string};
type StorageAccess = Pick<Storage,'getItem'|'setItem'>;
const empty = ():DraftData => ({version:1,drafts:[]});
export function validateDraftData(value:unknown):DraftData {
 if(!value||typeof value!=='object')throw Error('Draft storage must be an object.');
 const data=value as DraftData;
 if(data.version!==1||!Array.isArray(data.drafts))throw Error('Unsupported or malformed draft storage.');
 const ids=new Set<string>();
 for(const d of data.drafts){
  if(!d||typeof d!=='object'||['leadId','kind','purpose','subject','body','createdAt','updatedAt'].some(k=>typeof d[k as keyof SavedDraft]!=='string'))throw Error('Invalid draft fields.');
  if(!d.leadId.trim()||ids.has(d.leadId))throw Error('Draft lead IDs must be nonempty and unique.');
  ids.add(d.leadId);
  if(!['Direct business','Agency partnership'].includes(d.kind)||!['Initial outreach','Polite follow-up','Final follow-up / nurture'].includes(d.purpose))throw Error('Invalid draft audience or purpose.');
  for(const date of [d.createdAt,d.updatedAt])if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString()!==date)throw Error('Invalid draft timestamp.');
 }
 return data;
}
export function loadDrafts(storage:StorageAccess):DraftWorkspace {
 let raw:string|null=null;
 try{raw=storage.getItem(DRAFT_KEY);return {data:raw===null?empty():validateDraftData(JSON.parse(raw)),raw,error:''};}
 catch(e){return {data:null,raw,error:`Drafts could not be loaded: ${e instanceof Error?e.message:'Storage unavailable'}`};}
}
export function saveDrafts(storage:StorageAccess,current:DraftWorkspace,drafts:SavedDraft[]):DraftWorkspace {
 if(!current.data||current.error)throw Error('Draft writes are blocked. Download the original drafts and review recovery options. Lead data is unaffected.');
 const data=validateDraftData({version:1,drafts});
 if(storage.getItem(DRAFT_KEY)!==current.raw)throw Error('Draft storage changed in another tab. Copy any unsaved message before reloading.');
 const raw=JSON.stringify(data);storage.setItem(DRAFT_KEY,raw);return {data,raw,error:''};
}
export function recoverDrafts(storage:StorageAccess,current:DraftWorkspace):DraftWorkspace {
 // Explicit reset only. Preserve the exact malformed original before replacement.
 if(current.data)throw Error('Draft recovery is only for unreadable draft storage.');
 if(storage.getItem(DRAFT_KEY)!==current.raw)throw Error('Draft storage changed. Reload before recovery.');
 if(current.raw!==null)storage.setItem(`${DRAFT_KEY}-recovery-${uid()}`,current.raw);
 const raw=JSON.stringify(empty());storage.setItem(DRAFT_KEY,raw);return {data:empty(),raw,error:''};
}
export function prepareDraft(draft:Draft,previous?:SavedDraft,now=new Date()):SavedDraft {
 return {...draft,createdAt:previous?.createdAt??now.toISOString(),updatedAt:now.toISOString()};
}
