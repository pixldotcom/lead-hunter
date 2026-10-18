import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchPublic, isPublicAddress, normalizeTarget, type Dependencies } from './network.ts';
import { createAuditServer } from './app.ts';

const fixture = createServer((req,res) => {
  if (req.url === '/redirect') { res.writeHead(302,{location:'http://127.0.0.1/secret'}); res.end(); }
  else if (req.url === '/relative') { res.writeHead(302,{location:'/page?q=1'}); res.end(); }
  else if (req.url === '/loop') { res.writeHead(302,{location:'/loop'}); res.end(); }
  else if (req.url === '/stall') { res.writeHead(200); res.write('partial'); }
  else if (req.url === '/large') { res.end('x'.repeat(1000)); }
  else if (req.url === '/declared-large') { res.writeHead(200,{'content-length':'2000000'}); res.end(); }
  else if (req.url === '/broken') { res.writeHead(200,{'content-length':'100'}); res.write('short'); setTimeout(()=>res.destroy(),10); }
  else if (req.url === '/bad-redirect') { res.writeHead(302); res.end(); }
  else { res.writeHead(200,{'content-type':'text/html'}); res.end(`<title>Fixture</title>${req.url}`); }
});
const api = createAuditServer({testWithoutAuth:true});
let port: number; let apiBase: string;
beforeAll(async () => {
  await new Promise<void>(resolve=>fixture.listen(0,'127.0.0.1',resolve));
  port = (fixture.address() as AddressInfo).port;
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});
afterAll(async () => { fixture.closeAllConnections(); api.closeAllConnections(); await Promise.all([new Promise<void>(r=>fixture.close(()=>r())),new Promise<void>(r=>api.close(()=>r()))]); });
// Only the test transport maps a validated public destination to the controlled fixture.
// Production always connects using the pinned lookup supplied by fetchPublic.
function dependencies(): Dependencies {
  return {
    resolve: vi.fn(async()=>[{address:'93.184.216.34',family:4}]),
    request: (url,options,callback) => request({ ...options, hostname:'127.0.0.1', port, path:url.pathname+url.search, lookup:undefined },callback),
  };
}
describe('target policy', () => {
  it('preserves paths, query and scheme and defaults bare domains to HTTPS',()=> {
    expect(normalizeTarget(' HTTP://Example.COM/a?q=1#fragment ').href).toBe('http://example.com/a?q=1');
    expect(normalizeTarget('example.com/path').href).toBe('https://example.com/path');
    expect(normalizeTarget('https://example.com:443/a').href).toBe('https://example.com/a');
  });
  it.each(['ftp://example.com','file:///etc/passwd','javascript:alert(1)','https://u:p@example.com','https://','https://example.com:22','localhost','https://foo.local','https://a b.com','https://example.com\\@127.0.0.1'])('rejects invalid target %s',raw=>expect(()=>normalizeTarget(raw)).toThrow());
  it.each(['0.0.0.0','10.1.2.3','127.1.2.3','169.254.169.254','172.31.0.1','192.168.1.1','100.64.0.1','192.0.0.9','192.0.2.1','198.19.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1','::ffff:7f00:1','::ffff:8.8.8.8','64:ff9b::a00:1','2001:db8::1','2002:7f00:1::','3fff::1'])('rejects prohibited address %s',ip=>expect(isPublicAddress(ip)).toBe(false));
  it.each(['8.8.8.8','93.184.216.34','2606:4700:4700::1111'])('allows global address %s',ip=>expect(isPublicAddress(ip)).toBe(true));
});
describe('pinned requests',()=> {
  it('passes exactly the validated address to connection lookup with original Host and TLS hostname',async()=> {
    const deps = dependencies();
    deps.resolve = vi.fn().mockResolvedValueOnce([{address:'93.184.216.34',family:4}]).mockResolvedValue([{address:'127.0.0.1',family:4}]);
    const fixtureRequest = deps.request;
    deps.request = (url,options,callback)=> {
      expect(url.href).toBe('https://example.com/page?q=1');
      expect(options.agent).toBe(false);
      const lookup = options.lookup as Function;
      lookup('example.com',{},(error:unknown,address:string,family:number)=> { expect(error).toBeNull(); expect(address).toBe('93.184.216.34'); expect(family).toBe(4); });
      return fixtureRequest(url,options,callback);
    };
    const result = await fetchPublic('https://example.com/page?q=1',{dependencies:deps});
    expect(result.response.body).toContain('/page?q=1'); expect(deps.resolve).toHaveBeenCalledTimes(1);
  });
  it('rejects mixed public/private DNS answers before opening a socket',async()=> {
    const deps=dependencies(); deps.resolve=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]; deps.request=vi.fn();
    await expect(fetchPublic('https://example.com',{dependencies:deps})).rejects.toMatchObject({code:'PROHIBITED_TARGET'}); expect(deps.request).not.toHaveBeenCalled();
  });
  it.each(['http://127.1/','http://2130706433/','http://[::ffff:7f00:1]/'])('rejects normalized IP forms %s',async raw=>expect(fetchPublic(raw,{dependencies:dependencies()})).rejects.toMatchObject({code:'PROHIBITED_TARGET'}));
  it('blocks a redirect to loopback',async()=>expect(fetchPublic('http://example.com/redirect',{dependencies:dependencies()})).rejects.toMatchObject({code:'PROHIBITED_TARGET'}));
  it('rechecks DNS on same-host redirects',async()=> {
    const deps=dependencies(); deps.resolve=vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'169.254.169.254',family:4}]);
    await expect(fetchPublic('http://example.com/relative',{dependencies:deps})).rejects.toMatchObject({code:'PROHIBITED_TARGET'});
  });
  it('reports final URL and redirects',async()=> { const r=await fetchPublic('http://example.com/relative',{dependencies:dependencies()}); expect(r.url.href).toBe('http://example.com/page?q=1'); expect(r.redirects).toEqual([{from:'http://example.com/relative',to:'http://example.com/page?q=1',status:302}]); });
  it('limits redirects',async()=>expect(fetchPublic('http://example.com/loop',{dependencies:dependencies()})).rejects.toMatchObject({code:'REDIRECT_LIMIT'}));
  it('times out during DNS',async()=> {const deps=dependencies();deps.resolve=()=>new Promise(()=>{});await expect(fetchPublic('http://example.com',{dependencies:deps,timeoutMs:30})).rejects.toMatchObject({code:'TIMEOUT'});});
  it('times out after response headers while reading body',async()=>expect(fetchPublic('http://example.com/stall',{dependencies:dependencies(),timeoutMs:80})).rejects.toMatchObject({code:'TIMEOUT'}));
  it.each(['/large','/declared-large'])('limits responses %s',async path=>expect(fetchPublic(`http://example.com${path}`,{dependencies:dependencies(),maxBytes:100})).rejects.toMatchObject({code:'TOO_LARGE'}));
  it('handles aborted input signals',async()=> { const c=new AbortController();c.abort(); await expect(fetchPublic('http://example.com',{dependencies:dependencies(),signal:c.signal})).rejects.toMatchObject({code:'ABORTED'}); });
  it('cancels active body reads',async()=> {const c=new AbortController();const p=fetchPublic('http://example.com/stall',{dependencies:dependencies(),signal:c.signal});setTimeout(()=>c.abort(),50);await expect(p).rejects.toMatchObject({code:'ABORTED'});});
  it('handles truncated bodies',async()=>expect(fetchPublic('http://example.com/broken',{dependencies:dependencies()})).rejects.toMatchObject({code:'INCOMPLETE_RESPONSE'}));
  it('handles malformed redirect responses',async()=>expect(fetchPublic('http://example.com/bad-redirect',{dependencies:dependencies()})).rejects.toMatchObject({code:'INVALID_REDIRECT'}));
  it('sanitizes DNS errors',async()=> {const deps=dependencies();deps.resolve=async()=>{throw Error('sensitive internal detail')};await expect(fetchPublic('http://example.com',{dependencies:deps})).rejects.toMatchObject({code:'DNS_FAILED',message:'The website domain could not be resolved.'});});
  it('handles connection errors',async()=> {const deps=dependencies();const original=deps.request;deps.request=(url,opts,cb)=>{const req=original(url,opts,cb);queueMicrotask(()=>req.destroy(new Error('injected connection failure')));return req;};await expect(fetchPublic('http://example.com',{dependencies:deps})).rejects.toMatchObject({code:'NETWORK_ERROR'});});
});
describe('local API',()=> {
  it('starts and serves health',async()=>expect(await (await fetch(`${apiBase}/api/health`)).json()).toEqual({status:'ok'}));
  it('returns structured validation errors without stack traces',async()=> {const r=await fetch(`${apiBase}/api/audit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'file:///secret'})});expect(r.status).toBe(400);expect(await r.json()).toEqual({code:'INVALID_URL',error:'Use HTTP or HTTPS without credentials or nonstandard ports.'});});
  it('rejects malformed JSON',async()=> {const r=await fetch(`${apiBase}/api/audit`,{method:'POST',headers:{'content-type':'application/json'},body:'{'});expect((await r.json()).code).toBe('INVALID_JSON');});
  it('rejects external browser origins',async()=> {const r=await fetch(`${apiBase}/api/audit`,{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'});expect(r.status).toBe(403);});
});
