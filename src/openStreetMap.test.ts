import { describe, expect, it, vi } from 'vitest';
import { buildOverpassQuery, parseOverpassBusinesses, searchOpenStreetMap } from './openStreetMap';

describe('OpenStreetMap discovery', () => {
  it('builds bounded category and location searches and rejects unsupported input', () => {
    expect(buildOverpassQuery('dentist', 'Ludhiana')).toContain('"amenity"="dentist"');
    expect(buildOverpassQuery('dentist', 'Ludhiana')).toContain('"name"="Ludhiana"');
    expect(buildOverpassQuery('dentist', 'Ludhiana')).toContain('out center tags 101');
    expect(() => buildOverpassQuery('anything', 'Ludhiana')).toThrow(/not mapped/);
  });

  it('maps only returned OSM tags and keeps reputation unknown', () => {
    const rows = parseOverpassBusinesses({ elements: [
      { type: 'node', id: 7, lat: 30.9, lon: 75.8, tags: { name: 'Example Dental', amenity: 'dentist', website: 'https://example.test', phone: '+1 555' } },
      { type: 'node', id: 8, tags: { amenity: 'dentist' } },
    ] }, 'dentist', 'Ludhiana');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Example Dental', websiteUrl: 'https://example.test', phone: '+1 555', rating: null, reviewCount: null, discoverySource: 'OpenStreetMap (Overpass)' });
    expect(rows[0].sourceUrl).toBe('https://www.openstreetmap.org/node/7');
  });

  it('caps results and retries temporary errors on a second free endpoint', async () => {
    const elements = Array.from({ length: 105 }, (_, id) => ({ type: 'node' as const, id, tags: { name: `Business ${id}` } }));
    expect(parseOverpassBusinesses({ elements }, 'dentist', 'Ludhiana')).toHaveLength(100);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({elements:[elements[0]]}), {status:200,headers:{'content-type':'application/json'}}));
    await expect(searchOpenStreetMap('dentist', 'Ludhiana', fetcher)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reports when every public endpoint is unavailable', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', {status:503}));
    await expect(searchOpenStreetMap('dentist','Ludhiana',fetcher)).rejects.toThrow(/All free OpenStreetMap endpoints failed/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
