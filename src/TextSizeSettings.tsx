import {useState} from 'react';
import {applyTextScale,TEXT_SCALES} from './textScale';
import {useCloud} from './CloudWorkspace';
export function initializeTextScale(){applyTextScale(document.documentElement,175);return 175}
export function TextSizeSettings(){const cloud=useCloud(),[error,E]=useState('');const size=cloud.snapshot.data.preferences.textScale;return <section className="panel"><h2>Text size</h2><label>Application text size<select aria-label="Application text size" value={size} onChange={async e=>{const value=Number(e.target.value) as typeof size;if(await cloud.change('preferences',{textScale:value})){applyTextScale(document.documentElement,value);E('')}else E('Text size was not saved. Retry the pending cloud save.')}}>{TEXT_SCALES.map(value=><option key={value} value={value}>{value}%{value===175?' (default)':''}</option>)}</select></label><p>Saved to your cloud account across browsers.</p>{error&&<p role="alert">{error}</p>}</section>}
