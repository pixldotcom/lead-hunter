import type { BusinessImportRow } from './opportunityPersistence';

type Element = { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export type OSMBusiness = BusinessImportRow & { sourceUrl: string; discoverySource: string };

const endpoints = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.nchc.org.tw/api/interpreter'];
export function buildOverpassQuery(category: string, location: string): string {
  const term = category.trim().toLowerCase();
  if (!term || !location.trim() || category.length > 80 || location.length > 120) throw Error('Enter a category and location using the stated length limits.');
  const mapping: Record<string, [string, string]> = {
    dentist: ['amenity', 'dentist'], 'dental clinic': ['amenity', 'dentist'], restaurant: ['amenity', 'restaurant'], cafe: ['amenity', 'cafe'], hotel: ['tourism', 'hotel'], 'hair salon': ['shop', 'hairdresser'], pharmacy: ['amenity', 'pharmacy'], 'beauty salon': ['shop', 'beauty'], gym: ['leisure', 'fitness_centre'], 'veterinary clinic': ['amenity', 'veterinary'], 'car repair': ['shop', 'car_repair'], bakery: ['shop', 'bakery'], optician: ['shop', 'optician'], 'real estate agency': ['office', 'estate_agent'], 'law firm': ['office', 'lawyer'], 'accounting firm': ['office', 'accountant'], 'travel agency': ['shop', 'travel_agency'], 'clothing store': ['shop', 'clothes'], supermarket: ['shop', 'supermarket'], school: ['amenity', 'school'],
  };
  const tag = mapping[term];
  if (!tag) throw Error('This category is not mapped to an OpenStreetMap business type yet. Try a supported category or use CSV/search-assisted import.');
  const area = location.trim().replace(/["\\]/g, ' ').replace(/\s+/g, ' ');
  return `[out:json][timeout:20];\narea["name"="${area}"]["boundary"="administrative"]->.searchArea;\n(nwr["${tag[0]}"="${tag[1]}"](area.searchArea););\nout center tags 101;`;
}

export function parseOverpassBusinesses(payload: unknown, category: string, location: string): OSMBusiness[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { elements?: unknown }).elements)) throw Error('OpenStreetMap returned an unexpected response.');
  const elements = (payload as { elements: Element[] }).elements;
  return elements.slice(0, 100).flatMap(item => {
    const tags = item.tags;
    if (!tags || typeof tags.name !== 'string' || !tags.name.trim()) return [];
    const lat = item.lat ?? item.center?.lat, lon = item.lon ?? item.center?.lon;
    const sourceUrl = `https://www.openstreetmap.org/${item.type}/${item.id}`;
    const websiteUrl = tags.website || tags['contact:website'] || '';
    const phone = tags.phone || tags['contact:phone'] || '';
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const address = [street, tags['addr:suburb'], tags['addr:city'] || location, tags['addr:postcode']].filter(Boolean).join(', ');
    return [{ name: tags.name.trim(), category: tags.amenity || tags.shop || tags.office || tags.tourism || category, location: address || location, websiteUrl, phone, rating: null, reviewCount: null, sourceUrl, discoverySource: 'OpenStreetMap (Overpass)', ...(websiteUrl ? {} : { websiteStatus: 'unknown' as const }), ...(tags.email || tags['contact:email'] ? { email: tags.email || tags['contact:email'] } : {}), ...(lat !== undefined && lon !== undefined ? { profiles: [`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`] } : {}) }];
  });
}

export async function searchOpenStreetMap(category: string, location: string, fetcher: typeof fetch = fetch): Promise<OSMBusiness[]> {
  const query = buildOverpassQuery(category, location);
  let lastError = 'No public discovery server responded.';
  for (const endpoint of endpoints) {
    try {
      const response = await fetcher(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(12000) });
      if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
        lastError = `Discovery server temporarily unavailable (${response.status}).`;
        continue;
      }
      if (!response.ok) {
        lastError = `Discovery server rejected the search (${response.status}).`;
        continue;
      }
      return parseOverpassBusinesses(await response.json(), category.trim(), location.trim());
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'Discovery server timed out.' : 'Discovery server could not be reached or blocked this browser request.';
    }
  }
  throw Error(`${lastError} All free OpenStreetMap endpoints failed. Check your connection, retry shortly, or use CSV import. Public endpoints may block browser requests.`);
}
