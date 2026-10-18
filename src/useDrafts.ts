import {useState,useEffect,useRef} from 'react';
import {type Draft} from './domain';
import {prepareDraft,type SavedDraft} from './draftPersistence';
import {useCloud} from './CloudWorkspace';
import {recoveryValue} from './recoveryQueue';
export function useDrafts(){
 const cloud=useCloud(),cloudRef=useRef(cloud);cloudRef.current=cloud;
 const initial=cloud.recoveredDrafts;const [drafts,D]=useState<SavedDraft[]>(initial?.drafts??cloud.snapshot.data.drafts.drafts),[error,E]=useState(initial?'Recovered unsaved drafts on this device. Review/export before retrying.':''),[pending,Pending]=useState(!!initial);
 const buffer=useRef<{drafts:SavedDraft[];revision:number}|null>(initial);
 const editing=useRef(drafts),generation=useRef(0),dirty=useRef(!!initial),alive=useRef(true),base=useRef(initial?.revision??cloud.snapshot.revision);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[cloud.userId]);
 useEffect(()=>{const saved=cloud.snapshot.data.drafts.drafts;const equal=saved.length===editing.current.length&&saved.every(d=>{const local=editing.current.find(x=>x.leadId===d.leadId);return local&&(['leadId','kind','purpose','subject','body','createdAt','updatedAt'] as const).every(k=>local[k]===d[k])});if(!dirty.current||equal){dirty.current=false;Pending(false);E('');editing.current=saved;D(saved);base.current=cloud.snapshot.revision;const expected=buffer.current;if(expected)void recoveryValue(cloud.userId,'draft-input',undefined,true,expected).catch(e=>E(String(e))) }},[cloud.snapshot]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);
 const persist=async(next:SavedDraft[],token:number,delay=400)=>{
  try{const copy={drafts:next,revision:base.current};buffer.current=copy;await recoveryValue(cloud.userId,'draft-input',copy);await new Promise(r=>setTimeout(r,delay));if(token!==generation.current||!alive.current)return false;
   while(cloudRef.current.saving){await new Promise(r=>setTimeout(r,100));if(token!==generation.current||!alive.current)return false}
   if(base.current!==cloudRef.current.currentRevision()){E('Cloud records changed since these draft edits began. Export them and merge manually before retrying.');return false}
   if(!await cloudRef.current.change('drafts',{version:1,drafts:next})){E('Draft is not saved online. Keep this tab open, export it or retry after resolving the pending cloud save.');return false}
   base.current=cloudRef.current.currentRevision();if(token===generation.current){dirty.current=false;Pending(false);await recoveryValue(cloud.userId,'draft-input',undefined,true,copy);base.current=cloudRef.current.currentRevision();E('')}return true;
  }catch(e){E(`Draft not saved online. ${String(e)}`);return false}
 };
 const save=async(draft:Draft,immediate=false)=>{const old=editing.current.find(d=>d.leadId===draft.leadId);const next=[...editing.current.filter(d=>d.leadId!==draft.leadId),prepareDraft(draft,old)];editing.current=next;dirty.current=true;Pending(true);D(next);return persist(next,++generation.current,immediate?0:400)};
 const retry=async()=>{if(base.current!==cloudRef.current.snapshot.revision&&dirty.current){E('Cloud records changed. Export recovered drafts and merge them manually to avoid overwriting another browser.');return false}return persist(editing.current,++generation.current)};
 return {drafts,save,error,pending,blocked:false,raw:JSON.stringify({version:1,drafts},null,2),retry,recover:retry};
}
