import {useState} from 'react';
import {useCloud} from './CloudWorkspace';
import {emptyCloud,mergeCloud,validateCloud,type CloudData} from './cloudModel';
import {loadWorkspace} from './persistence';
import {loadDiscovery} from './discovery';
import {loadDrafts} from './draftPersistence';
import {readTextScale} from './textScale';
import {downloadText} from './browserDownload';
const KEYS=['pixldot-lead-hunter-v1','pixldot-discovery-v1','pixldot-outreach-drafts-v1','pixldot-text-scale-v1'];
export function readLegacy(storage:Pick<Storage,'getItem'>):CloudData{
 const readOnly={...storage,getItem:(key:string)=>storage.getItem(key),setItem:()=>{throw Error('Legacy data is read-only.')}};
 const leads=loadWorkspace(readOnly),discovery=loadDiscovery(readOnly),drafts=loadDrafts(readOnly);
 if(!leads.data||!discovery.data||!drafts.data)throw Error('Legacy data needs repair. Download the original backup; no local records have been changed.');
 return validateCloud({...emptyCloud(),leads:leads.data,discovery:discovery.data,drafts:drafts.data,preferences:{textScale:readTextScale(storage)}});
}
export function MigrationPanel(){
 const cloud=useCloud(),[source,S]=useState<CloudData|null>(null),[error,E]=useState(''),[backed,B]=useState(false),[confirmed,C]=useState(false),[notice,N]=useState('');
 let preview:ReturnType<typeof mergeCloud>|null=null,previewError='';try{preview=source?mergeCloud(cloud.snapshot.data,source,cloud.snapshot.revision===0):null}catch(e){previewError=String(e)}
 const local=()=>{try{const stores=Object.fromEntries([...new Set([...KEYS,...Object.keys(localStorage).filter(key=>key.startsWith('pixldot-')&&key.includes('recovery'))])].map(key=>[key,localStorage.getItem(key)]));downloadText(JSON.stringify({format:'pixldot-local-backup-v1',stores},null,2),'pixldot-local-original-backup.json');B(true);S(readLegacy(localStorage));E('')}catch(e){E(String(e))}};
 const file=async(f:File|undefined)=>{if(!f)return;try{if(f.size>3_200_000)throw Error('Backup exceeds the import limit.');const raw=JSON.parse(await f.text());const data=raw.format==='pixldot-local-backup-v1'?readLegacy({getItem:(key:string)=>raw.stores?.[key]??null}):validateCloud(raw);S(data);B(false);C(false);E('');N('')}catch(e){E(String(e))}};
 const apply=async()=>{if(!source||!preview||!backed||!confirmed)return;try{const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(source))))).map(n=>n.toString(16).padStart(2,'0')).join('');if(await cloud.commit(preview.data,hash)){N('Import saved to cloud. Existing local data was not changed.');S(null);C(false)}}catch(e){E(String(e))}};
 return <details className="panel migration-panel"><summary>Import existing local data or a full cloud backup</summary><p>Nothing is imported automatically. Existing cloud domains and drafts win on duplicates. Local records remain untouched. Existing cloud preferences are preserved; a new empty account can use the imported preferences.</p><button className="secondary" disabled={cloud.saving} onClick={local}>Download local backup & preview</button><label>Or choose a complete backup<input type="file" accept=".json" onChange={e=>{void file(e.target.files?.[0]);e.currentTarget.value=''}}/></label>{(error||previewError)&&<p className="error" role="alert">{error||previewError}</p>}{preview&&<><p>{preview.summary.addedLeads} new leads; {preview.summary.addedProspects} new prospects; {preview.summary.addedDrafts} new drafts. Existing cloud records will be preserved.</p>{!backed&&<button className="secondary" onClick={()=>{downloadText(JSON.stringify(source,null,2),'pixldot-import-source-backup.json');B(true)}}>Download source backup before import</button>}<label className="selection-toggle"><input type="checkbox" checked={confirmed} onChange={e=>C(e.target.checked)}/> I have saved the backup and reviewed these additions.</label><button className="primary" disabled={!backed||!confirmed||cloud.saving} onClick={()=>void apply()}>Import reviewed additions to cloud</button></>}{notice&&<p role="status">{notice}</p>}</details>;
}
