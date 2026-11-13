import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuditError, fetchPublic, normalizeTarget } from '../../server/network.ts';

export const config = { maxDuration: 12 };
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
export default async function handler(req: IncomingMessage & {body?:unknown}, res: ServerResponse) {
  const reply = (status: number, data: unknown) => { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' }); res.end(JSON.stringify(data)); };
  if (req.method !== 'POST') return reply(405, {error:'Use POST with a public business website URL.'});
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return reply(415, {error:'Submit JSON data.'});
  if (Number(req.headers['content-length'] ?? 0) > 4096) return reply(413,{error:'Import request exceeds 4 KB.'});
  let raw = '';
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else { for await (const chunk of req) { raw += String(chunk); if (Buffer.byteLength(raw) > 4096) return reply(413,{error:'Import request exceeds 4 KB.'}); } }
  if (Buffer.byteLength(raw) > 4096) return reply(413,{error:'Import request exceeds 4 KB.'});
  let body: unknown; try { body = JSON.parse(raw); } catch { return reply(400,{error:'Submit valid JSON.'}); }
  if (!body || typeof body !== 'object' || typeof (body as {websiteUrl?:unknown}).websiteUrl !== 'string') return reply(400,{error:'Enter an official website URL.'});
  const abort = AbortSignal.timeout(9000);
  try {
    const target = normalizeTarget((body as {websiteUrl:string}).websiteUrl);
    const {url,response} = await fetchPublic(target,{signal:abort,timeoutMs:7000,maxBytes:200_000});
    if (!response.ok || !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(String(response.headers['content-type'] ?? ''))) return reply(422,{error:'The website did not return a public HTML page that can be read.'});
    return reply(200,extractWebsiteDetails(response.body,url.href));
  } catch(error) {
    if(error instanceof AuditError) return reply(error.code==='TIMEOUT'?504:422,{error:error.message});
    return reply(503,{error:abort.aborted?'Website request timed out. Try again later.':'The public website could not be read. Verify its URL and retry.'});
  }
}
