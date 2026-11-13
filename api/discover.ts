import type { IncomingMessage, ServerResponse } from 'node:http';
// Keep this serverless entry point self-contained: Vercel does not package Vite's
// client-side TypeScript modules as Node-resolvable ESM dependencies.
const categories: Record<string, [string, string]> = {
  dentist:['amenity','dentist'], 'dental clinic':['amenity','dentist'], restaurant:['amenity','restaurant'],
  cafe:['amenity','cafe'], hotel:['tourism','hotel'], 'hair salon':['shop','hairdresser'],
  pharmacy:['amenity','pharmacy'], 'beauty salon':['shop','beauty'], gym:['leisure','fitness_centre'],
  'veterinary clinic':['amenity','veterinary'], 'car repair':['shop','car_repair'],
  bakery:['shop','bakery'], optician:['shop','optician'], 'real estate agency':['office','estate_agent'],
  'law firm':['office','lawyer'], 'accounting firm':['office','accountant'],
  'travel agency':['shop','travel_agency'], 'clothing store':['shop','clothes'],
  supermarket:['shop','supermarket'], school:['amenity','school'],
};
function buildOverpassQuery(category: string, location: string): string {
  const tag = categories[category.trim().toLowerCase()];
  if (!tag) throw Error('Unsupported category. Choose a category listed in the discovery form.');
  if (!location.trim() || category.length > 80 || location.length > 120) throw Error('Enter a valid category and location.');
  const area = location.trim().replace(/["\\]/g,' ').replace(/\s+/g,' ');
  return `[out:json][timeout:20];\narea["name"="${area}"]["boundary"="administrative"]->.searchArea;\n(nwr["${tag[0]}"="${tag[1]}"](area.searchArea););\nout center tags 101;`;
}
type Element = {type:'node'|'way'|'relation';id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>};
function parseOverpassBusinesses(payload: unknown, category: string, location: string) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as {elements?:unknown}).elements)) throw Error('Invalid OpenStreetMap response.');
  return ((payload as {elements:Element[]}).elements).slice(0,100).flatMap(item=>{
    const tags=item.tags;
    if (!tags?.name?.trim() || !['node','way','relation'].includes(item.type) || !Number.isFinite(item.id)) return [];
    const lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon;
    const websiteUrl=tags.website||tags['contact:website']||'';
    const street=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(' ');
    const address=[street,tags['addr:suburb'],tags['addr:city']||location,tags['addr:postcode']].filter(Boolean).join(', ');
    return [{name:tags.name.trim(),category:tags.amenity||tags.shop||tags.office||tags.tourism||category,location:address||location,websiteUrl,phone:tags.phone||tags['contact:phone']||'',rating:null,reviewCount:null,sourceUrl:`https://www.openstreetmap.org/${item.type}/${item.id}`,discoverySource:'OpenStreetMap (Overpass)',...(websiteUrl?{}:{websiteStatus:'unknown'}),...(tags.email||tags['contact:email']?{email:tags.email||tags['contact:email']}:{}),...(lat!==undefined&&lon!==undefined?{profiles:[`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`]}:{})}];
  });
}


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
