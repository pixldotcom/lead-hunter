import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildOverpassQuery, parseOverpassBusinesses } from '../src/openStreetMap';

const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const respond = (value: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(value));
  };
  if (req.method !== 'POST') { respond({error:'Use POST with a supported category and location.'},405); return; }
  if ((Number(req.headers['content-length']) || 0) > 2048) {respond({error:'Search request too large.'},413);return;}
  let category: string, location: string, query: string;
  try {
    let body = '';
    for await (const chunk of req) {
      body += String(chunk);
      if (body.length > 2048) {respond({error:'Search request too large.'},413);return;}
    }
    const input: unknown = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid search request.');
    const fields = input as Record<string, unknown>;
    if (typeof fields.category !== 'string' || typeof fields.location !== 'string') throw Error('Category and location are required.');
    category = fields.category;
    location = fields.location;
    query = buildOverpassQuery(category, location);
  } catch (error) {
    respond({error:error instanceof Error ? error.message : 'Invalid search request.'},400);return;
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
      if (!response.ok) {lastError='OpenStreetMap service responded with HTTP '+response.status+'.';continue;}
      respond({businesses:parseOverpassBusinesses(await response.json(),category.trim(),location.trim())});return;
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'OpenStreetMap service timed out.' : 'OpenStreetMap service connection failed.';
    }
  }
  respond({error:lastError+' Please retry shortly. No records were changed.'},503);
}
