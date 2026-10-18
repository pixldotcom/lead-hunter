import {useState} from 'react';
export const AUDIT_TOOLS=[
 {name:'PageSpeed Insights',url:'https://pagespeed.web.dev/',note:'Paste the URL to submit lab/field performance checks.'},
 {name:'The HOTH SEO Audit',url:'https://www.thehoth.com/seo-audit-tool/',note:'Manual URL submission; the service may also request a name/email.'},
 {name:'WAVE',url:'https://wave.webaim.org/',note:'Paste the URL for accessibility evaluation; manual testing remains necessary.'},
 {name:'SSL Labs',url:'https://www.ssllabs.com/ssltest/',note:'Enter the public hostname for a TLS check.'}
];
export function AuditTools({website}:{website:string}){const [feedback,F]=useState('');const copy=async()=>{try{await navigator.clipboard.writeText(website);F('Website URL copied.')}catch{F('Copy failed. Select the URL field above and copy it manually.')}};return <details className="audit-tools"><summary>Audit Tools</summary><p>External reports open in a new tab. Submit manually; no paid API, report scraping or report import is integrated. URL-prefill parameters have not been assumed.</p><label>Prospect URL<input aria-label="Audit prospect URL" readOnly value={website} onFocus={e=>e.target.select()}/></label><button className="secondary" onClick={copy}>Copy website URL</button>{feedback&&<p role="status">{feedback}</p>}<ul>{AUDIT_TOOLS.map(t=><li key={t.name}><a href={t.url} target="_blank" rel="noopener noreferrer">{t.name} ↗</a><p>{t.note}</p></li>)}</ul></details>}
