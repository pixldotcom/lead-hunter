import { buildOverpassQuery, parseOverpassBusinesses } from '../src/openStreetMap';

const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function POST(request: Request): Promise<Response> {
  if ((Number(request.headers.get('content-length')) || 0) > 2048) return json({ error: 'Search request too large.' }, 413);
  let category: string, location: string, query: string;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid search request.');
    const fields = input as Record<string, unknown>;
    if (typeof fields.category !== 'string' || typeof fields.location !== 'string') throw Error('Category and location are required.');
    category = fields.category;
    location = fields.location;
    query = buildOverpassQuery(category, location);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid search request.' }, 400);
  }
  let lastError = 'The public discovery services are unavailable.';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'LeadHunterV2/1.0 (OpenStreetMap business discovery)' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        lastError = 'OpenStreetMap service responded with HTTP ' + response.status + '.';
        continue;
      }
      const payload = await response.json();
      return json({ businesses: parseOverpassBusinesses(payload, category.trim(), location.trim()) });
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'OpenStreetMap service timed out.' : 'OpenStreetMap service connection failed.';
    }
  }
  return json({ error: lastError + ' Please retry shortly. No records were changed.' }, 503);
}
export async function GET(): Promise<Response> {
  return json({ error: 'Use POST with a supported category and location.' }, 405);
}
