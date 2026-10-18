import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./network.ts', async importOriginal => ({ ...await importOriginal<typeof import('./network.ts')>(), fetchPublic: vi.fn() }));
import { fetchPublic, AuditError } from './network.ts';
import { analyze } from './audit.ts';
const network = vi.mocked(fetchPublic);
function page(body: string, status = 200, type = 'text/html') {
  return { url: new URL('http://example.com/path?q=1'), redirects: [], response: { status, ok:status===200, headers:{'content-type':type}, body } };
}
beforeEach(()=>{ network.mockReset(); });
describe('evidence extraction',()=> {
  it('reads single, double and unquoted attributes while retaining submitted paths and scheme',async()=> {
    network.mockResolvedValue(page(`<title>A useful business page title</title><meta name='description' content='Real description'><meta name=viewport content="width=device-width"><meta name=robots content=noindex><meta name=generator content=WordPress><link rel=canonical href='http://example.com/path'><h1>Hello</h1><img alt=""><img src=x>`));
    const r=await analyze('http://example.com/path?q=1');
    expect(network.mock.calls[0][0]).toBe('http://example.com/path?q=1');
    expect(r).toMatchObject({submittedUrl:'http://example.com/path?q=1',website:'http://example.com/path?q=1',description:'Real description',viewport:true,canonical:'http://example.com/path',wordPress:'WordPress detected',imagesWithoutAlt:1,robotsDirectives:['noindex']});
    expect(r.analyzedAt).toMatch(/^\d{4}-/);
    expect(r.findings.some(f=>f.title==='Meta description not observed')).toBe(false);
  });
  it.each([[403,'text/html'],[200,'application/json']])('does not treat inaccessible or non-HTML responses as missing metadata (%s)',async(status,type)=> {
    network.mockResolvedValue(page('{}',status as number,type as string));const r=await analyze('https://example.com');
    expect(r.htmlVerified).toBe(false);expect(r.wordPress).toBe('WordPress check unverified');
    expect(r.findings.filter(f=>f.category==='SEO'||f.category==='Content')).toEqual([]);
    expect(r.findings.some(f=>f.confidence==='unverified')).toBe(true);
  });
  it('marks failed auxiliary checks as unverified',async()=> {
    network.mockResolvedValueOnce(page('<h1>Business</h1>')).mockRejectedValue(new AuditError('TIMEOUT','Timed out'));
    const r=await analyze('https://example.com');expect(r.robots).toContain('unverified');expect(r.sitemap).toContain('unverified');
    expect(r.findings.some(f=>f.title==='Sitemap discovered')).toBe(false);
  });
});
