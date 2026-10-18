import {useState} from 'react';

export function ExternalSearch({queries}:{queries:string[]}){
 const [choice,Choose]=useState(0);
 const index=choice<queries.length?choice:0,query=queries[index]??'';
 return <section className="external-search" aria-labelledby="external-search-title">
  <h3 id="external-search-title">Search the web</h3>
  <p id="external-search-help">Opens a new tab. Review the results, copy actual business website URLs, then return here to paste and save them as prospects. Opening a search does not import results.</p>
  <label>Query to search<select aria-label="Query to search" value={index} disabled={!queries.length} onChange={e=>Choose(Number(e.target.value))}>{queries.length?queries.map((q,i)=><option value={i} key={q}>{q}</option>):<option value={0}>Enter valid search options first</option>}</select></label>
  <p className="selected-query">{query||'Choose valid search options to enable external search.'}</p>
  <div className="search-engine-buttons">{[['Google','https://www.google.com/search','google.png'],['Bing','https://www.bing.com/search','microsoft-bing.png']].map(([name,base,asset])=>query?<a key={name} className="search-engine-button" href={base+'?q='+encodeURIComponent(query)} target="_blank" rel="noopener noreferrer" aria-label={`Search with ${name} (opens in a new tab)`} aria-describedby="external-search-help"><span className="search-brand-plate"><img src={'/brands/'+asset} className={name==='Google'?'google-search-logo':'bing-search-logo'} alt="" aria-hidden="true"/></span><span>Search with {name}</span><span className="new-tab-label" aria-hidden="true">New tab ↗</span></a>:<button key={name} className="search-engine-button" disabled><span className="search-brand-plate"><img src={'/brands/'+asset} className={name==='Google'?'google-search-logo':'bing-search-logo'} alt="" aria-hidden="true"/></span><span>Search with {name}</span></button>)}</div>
  <a className="paste-prospects-link" href="#manual-prospect-import" onClick={()=>{const section=document.querySelector<HTMLDetailsElement>('.manual-import');if(section){section.open=true;requestAnimationFrame(()=>section.querySelector<HTMLTextAreaElement>('[aria-label="Candidate URLs"]')?.focus())}}}>Paste and save website URLs</a>
 </section>
}
