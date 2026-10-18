import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestAudit } from './analyzerApi';
afterEach(()=>vi.unstubAllGlobals());
describe('analyzer client',()=> {
  it('uses the relative proxy endpoint and preserves the submitted URL',async()=> {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({website:'http://example.com/path'})));vi.stubGlobal('fetch',fetcher);
    await requestAudit('http://example.com/path?q=1');expect(fetcher).toHaveBeenCalledWith('/api/audit',expect.objectContaining({body:JSON.stringify({url:'http://example.com/path?q=1'})}));
  });
  it('gives an actionable error when offline',async()=> {vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('fetch failed')));await expect(requestAudit('example.com')).rejects.toThrow('Analyzer unavailable');});
  it('handles proxy errors',async()=> {vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('proxy unavailable',{status:500})));await expect(requestAudit('example.com')).rejects.toThrow('Analyzer unavailable');});
  it('surfaces structured server errors',async()=> {vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Private destinations are prohibited.'}),{status:400})));await expect(requestAudit('example.com')).rejects.toThrow('Private destinations are prohibited.');});
  it('passes an abortable signal through the existing proxy call and distinguishes cancellation',async()=>{const controller=new AbortController();const fetcher=vi.fn(async(_url:unknown,options:{signal:AbortSignal})=>{expect(options.signal.aborted).toBe(false);controller.abort();expect(options.signal.aborted).toBe(true);throw new DOMException('Aborted','AbortError')});vi.stubGlobal('fetch',fetcher);await expect(requestAudit('https://example.com',controller.signal)).rejects.toThrow('cancelled');});

});
