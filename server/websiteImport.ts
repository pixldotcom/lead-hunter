import {AuditError,fetchPublic,normalizeTarget} from './network.ts';

const text = (value: string, max: number) => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, max);
function meta(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name === key && content) return text(content, 500);
  }
  return '';
}
export function extractWebsiteDetails(html: string, website: string) {
  const title = text(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? '', 200);
  const description = meta(html, 'description') || meta(html, 'og:description');
  const ogTitle = meta(html, 'og:title');
  const siteName = meta(html, 'og:site_name');
  return { website, name: siteName || ogTitle || title, description, observedAt: new Date().toISOString() };
}

export async function importWebsite(websiteUrl:string,signal?:AbortSignal){
 const target=normalizeTarget(websiteUrl);
 const {url,response}=await fetchPublic(target,{signal,timeoutMs:7000,maxBytes:200_000});
 if(!response.ok||!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(String(response.headers['content-type']??'')))throw new AuditError('UNREADABLE_HTML','The website did not return a public HTML page that can be read.');
 return extractWebsiteDetails(response.body,url.href);
}
