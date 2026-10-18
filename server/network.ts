import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, RequestOptions, ClientRequest, IncomingMessage } from 'node:http';

export class AuditError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export function normalizeTarget(raw: string): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048 || /[\u0000-\u0020\\]/.test(raw.trim())) throw new AuditError('INVALID_URL', 'Enter a valid public HTTP or HTTPS URL.');
  const text = raw.trim();
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`); }
  catch { throw new AuditError('INVALID_URL', 'Enter a valid public HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new AuditError('INVALID_URL', 'Use HTTP or HTTPS without credentials or nonstandard ports.');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || (!isIP(host) && (!host.includes('.') || /(?:^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)))) throw new AuditError('PROHIBITED_TARGET', 'Local and reserved destinations cannot be analyzed.');
  url.hash = '';
  return url;
}
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(ip) !== 6) return false;
  // Conservatively allow global unicast only; mapped, NAT64, local and multicast are excluded.
  const expanded = new URL(`http://[${ip}]/`).hostname.slice(1,-1);
  const first = parseInt(expanded.split(':')[0],16);
  const second = parseInt(expanded.split(':')[1] || '0',16);
  return first >= 0x2000 && first <= 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && first !== 0x2002 && first !== 0x3fff;
}
type Address = { address: string; family: number };
export type Dependencies = {
  resolve: (host: string) => Promise<Address[]>;
  request: (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
};
const defaults: Dependencies = {
  resolve: host => lookup(host, { all: true, verbatim: true }),
  request: (url, options, callback) => (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, callback),
};
export async function fetchPublic(raw: string | URL, options: { dependencies?: Dependencies; timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = {}) {
  const deps = options.dependencies ?? defaults;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new AuditError('TIMEOUT', 'The website timed out while connecting or reading its response.')), options.timeoutMs ?? 9000);
  const cancel = () => controller.abort(new AuditError('ABORTED', 'Analysis was cancelled.'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const signal = controller.signal;
  const maxBytes = options.maxBytes ?? 1_000_000;
  const redirects: { from: string; to: string; status: number }[] = [];
  try {
    let url = normalizeTarget(String(raw));
    for (let hop = 0; ; hop++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await new Promise<Address[]>((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        const resolution = isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : deps.resolve(host);
        resolution.then(resolve, () => reject(new AuditError('DNS_FAILED', 'The website domain could not be resolved.'))).finally(() => signal.removeEventListener('abort', aborted));
      });
      signal.throwIfAborted();
      if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AuditError('PROHIBITED_TARGET', 'The destination resolves to a private or reserved network address.');
      const pinned = addresses[0];
      const response = await new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
        let responseStream: IncomingMessage | undefined;
        const req = deps.request(url, {
          agent: false, signal, family: pinned.family,
          lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
          headers: { 'user-agent': 'PixlDotLeadHunter/1.0', accept: 'text/html,application/xhtml+xml,text/plain,application/xml', 'accept-encoding': 'identity' },
        }, res => {
          responseStream = res;
          const status = res.statusCode ?? 0;
          const fail = (error: Error) => { res.destroy(); req.destroy(); reject(error); };
          if (Number(res.headers['content-length']) > maxBytes) return fail(new AuditError('TOO_LARGE', 'The website response exceeds the 1 MB analysis limit.'));
          if ([301,302,303,307,308].includes(status)) { res.destroy(); resolve({ status, headers: res.headers, body: '' }); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) fail(new AuditError('TOO_LARGE', 'The website response exceeds the 1 MB analysis limit.')); else chunks.push(chunk); });
          res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
          res.on('aborted', () => reject(signal.aborted ? signal.reason : new AuditError('INCOMPLETE_RESPONSE', 'The website closed an incomplete response.')));
          res.on('error', () => reject(signal.aborted ? signal.reason : new AuditError('NETWORK_ERROR', 'The website response could not be read.')));
        });
        req.on('error', () => { responseStream?.destroy(); reject(signal.aborted ? signal.reason : new AuditError('NETWORK_ERROR', 'The website could not be reached. Check its URL and try again.')); });
        req.end();
      });
      signal.throwIfAborted();
      if (![301,302,303,307,308].includes(response.status)) return { url, redirects, response: { ...response, ok: response.status >= 200 && response.status < 300 } };
      if (hop >= 4) throw new AuditError('REDIRECT_LIMIT', 'The website redirected too many times.');
      if (!response.headers.location) throw new AuditError('INVALID_REDIRECT', 'The website returned a redirect without a destination.');
      let next: URL;
      try { next = normalizeTarget(new URL(response.headers.location, url).href); } catch (error) { if (error instanceof AuditError) throw error; throw new AuditError('INVALID_REDIRECT', 'The website returned an invalid redirect.'); }
      redirects.push({ from: url.href, to: next.href, status: response.status }); url = next;
    }
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
}
