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

  it('uses same-origin discovery API instead of public browser endpoints', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({businesses:[{name:'Example Dental',sourceUrl:'https://www.openstreetmap.org/node/7'}]}),{status:200}));
    await expect(searchOpenStreetMap('dentist','New Delhi',fetcher)).resolves.toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/discover');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({category:'dentist',location:'New Delhi'});
  });
  it('surfaces actionable server errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Public discovery services unavailable.'}),{status:503}));
    await expect(searchOpenStreetMap('dentist','New Delhi',fetcher)).rejects.toThrow(/unavailable/);
  });
});
