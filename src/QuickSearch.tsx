import {ExternalSearch} from './ExternalSearch';
import {useState} from 'react';
import {CATEGORIES,defaultSearchOptions,generateQueries} from './searchCatalogue';

export function QuickSearch(){
 const [options,O]=useState(defaultSearchOptions),[filter,F]=useState('');
 let queries:string[]=[],validation='';try{queries=generateQueries(options)}catch(e){validation=e instanceof Error?e.message:'Invalid search options.'}
 const filtered=CATEGORIES.filter(c=>`${c.name} ${c.industry}`.toLowerCase().includes(filter.toLowerCase()));const category=CATEGORIES.find(c=>c.id===options.categoryId)!;
 return <section className="panel quick-search"><h2>Choose a business category and location</h2><p>Search with Google or Bing, then paste the business websites you choose below. No account setup or API key needed.</p>
 <fieldset className="discovery-fields"><div className="formgrid">
 <label>Search categories<input aria-label="Search categories" value={filter} onChange={e=>F(e.target.value)} placeholder="e.g. dentist, hospitality, agency"/></label>
 <label>Business category<select aria-label="Business category" value={options.categoryId} onChange={e=>{const c=CATEGORIES.find(c=>c.id===e.target.value)!;O({...options,categoryId:c.id,keywords:c.keywords[0],templates:[...c.templates]})}}>{!filtered.some(c=>c.id===options.categoryId)&&<option value={category.id}>{category.name} (selected)</option>}{[...new Set(filtered.map(c=>c.industry))].map(industry=><optgroup key={industry} label={industry}>{filtered.filter(c=>c.industry===industry).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select></label>
 <label>Location<input aria-label="Search location" value={options.location} onChange={e=>O({...options,location:e.target.value})} placeholder="City or region (optional)"/></label>

 </div>
 <p>Services to consider after review: {category.services.join(' · ')}. These are suggestions, not verified needs.</p>
 <details><summary>Edit keyword presets and query templates</summary><label>Keyword preset<select aria-label="Keyword preset" value={category.keywords.includes(options.keywords)?options.keywords:''} onChange={e=>{if(e.target.value)O({...options,keywords:e.target.value})}}><option value="">Custom keywords</option>{category.keywords.map(k=><option key={k}>{k}</option>)}</select></label><label>Editable keywords<input aria-label="Search keywords" value={options.keywords} onChange={e=>O({...options,keywords:e.target.value})}/></label>{options.templates.map((template,i)=><label key={i}>Query template {i+1}<input value={template} onChange={e=>O({...options,templates:options.templates.map((t,j)=>i===j?e.target.value:t)})}/></label>)}<p>Template tokens: {'{keywords}'}, {'{location}'}, {'{category}'}. No result-page scraping is used.</p></details>
 <div className="query-preview"><b>Generated search queries</b><ul>{queries.map(q=><li key={q}>{q}</li>)}</ul></div>{validation&&<p className="error">{validation}</p>}
 </fieldset>
 <ExternalSearch queries={queries}/>
 </section>;
}
