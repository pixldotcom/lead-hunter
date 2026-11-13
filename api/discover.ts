import type { IncomingMessage, ServerResponse } from 'node:http';
export const config = { maxDuration: 25 };
// Keep this serverless entry point self-contained: Vercel does not package Vite's
// client-side TypeScript modules as Node-resolvable ESM dependencies.
const categories: Record<string, [string, string]> = {
  builder:['craft','builder'], builders:['craft','builder'], 'building contractor':['craft','builder'], contractor:['craft','builder'], 'construction company':['office','construction_company'], construction:['office','construction_company'], architect:['office','architect'], 'architecture firm':['office','architect'], electrician:['craft','electrician'], plumber:['craft','plumber'], painter:['craft','painter'], carpenter:['craft','carpenter'], 'interior designer':['office','interior_design'],
  dentist:['amenity','dentist'], 'dental clinic':['amenity','dentist'], restaurant:['amenity','restaurant'],
  cafe:['amenity','cafe'], hotel:['tourism','hotel'], 'hair salon':['shop','hairdresser'],
  pharmacy:['amenity','pharmacy'], 'beauty salon':['shop','beauty'], gym:['leisure','fitness_centre'],
  'veterinary clinic':['amenity','veterinary'], 'car repair':['shop','car_repair'],
  bakery:['shop','bakery'], optician:['shop','optician'], 'real estate agency':['office','estate_agent'],
  'law firm':['office','lawyer'], 'accounting firm':['office','accountant'],
  'travel agency':['shop','travel_agency'], 'clothing store':['shop','clothes'],
  supermarket:['shop','supermarket'], school:['amenity','school'],
};
function buildOverpassQuery(category: string, location: string, center?: {lat:number;lon:number}): string {
  const tag = categories[category.trim().toLowerCase()];
  if (!tag) throw Error('Unsupported category. Choose a category listed in the discovery form.');
  if (!location.trim() || category.length > 80 || location.length > 120) throw Error('Enter a valid category and location.');
  const area = location.trim().replace(/["\\]/g,' ').replace(/\s+/g,' ');
  if (center) return `[out:json][timeout:12];(nwr["${tag[0]}"="${tag[1]}"](around:7000,${center.lat},${center.lon}););out center tags 101;`;
  return `[out:json][timeout:12];\narea["name"="${area}"]["boundary"="administrative"]->.searchArea;\n(nwr["${tag[0]}"="${tag[1]}"](area.searchArea););\nout center tags 101;`;
}
type Element = {type:'node'|'way'|'relation';id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>};
function parseOverpassBusinesses(payload: unknown, category: string, location: string) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as {elements?:unknown}).elements)) throw Error('Invalid OpenStreetMap response.');
  const seen = new Set<string>();
  const businesses = ((payload as {elements:Element[]}).elements).flatMap(item=>{
    const tags=item.tags;
    if (!tags?.name?.trim() || !['node','way','relation'].includes(item.type) || !Number.isFinite(item.id)) return [];
    const lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon;
    const websiteUrl=(tags.website||tags['contact:website']||'').trim();
    const sourceId=`${item.type}/${item.id}`;
    if (seen.has(sourceId)) return [];
    seen.add(sourceId);
    const street=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(' ');
    const address=[street,tags['addr:suburb'],tags['addr:city']||location,tags['addr:postcode']].filter(Boolean).join(', ');
    return [{name:tags.name.trim(),websiteEvidence:websiteUrl?'listed':'not_listed',opportunityHint:websiteUrl?'Website listed — review quality and SEO':'No website listed in OpenStreetMap — verify before outreach',category:tags.amenity||tags.shop||tags.office||tags.craft||tags.tourism||category,location:address||location,websiteUrl,phone:tags.phone||tags['contact:phone']||'',rating:null,reviewCount:null,sourceUrl:`https://www.openstreetmap.org/${item.type}/${item.id}`,discoverySource:'OpenStreetMap (Overpass)',...(websiteUrl?{}:{websiteStatus:'unknown'}),...(tags.email||tags['contact:email']?{email:tags.email||tags['contact:email']}:{}),...(lat!==undefined&&lon!==undefined?{profiles:[`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`]}:{})}];
  });
  // Prioritize records without a listed website, but never claim that the business has no website.
  // Preserve source order within each evidence group and cap only after prioritization.
  return businesses.sort((a,b)=>Number(a.websiteEvidence==='listed')-Number(b.websiteEvidence==='listed')).slice(0,100);
}


// Resolve a city once per request; bounded radius queries avoid expensive administrative-area scans.
async function geocodeCity(location: string): Promise<{lat:number;lon:number}|null> {
  try {
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(location) + '&limit=5&lang=en';
    const response = await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(3500)});
    if (!response.ok) return null;
    const data = await response.json() as {features?:Array<{geometry?:{coordinates?:number[]};properties?:{name?:string;city?:string;country?:string;type?:string}}>} ;
    const target = location.trim().toLowerCase();
    const candidates = data.features ?? [];
    const match = candidates.find(x => [x.properties?.name,x.properties?.city].some(name => name?.toLowerCase()===target)) ?? candidates[0];
    const coords=match?.geometry?.coordinates;
    if (!coords || coords.length<2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    return {lat:coords[1],lon:coords[0]};
  } catch {return null;}
}
const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
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
  const center = await geocodeCity(location);
  if (center) query = buildOverpassQuery(category, location, center);
  let lastError = 'The public discovery services are unavailable.';
  // Keep the complete request within the serverless execution window.
  const deadline = Date.now() + 16000;
  for (const endpoint of endpoints) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'LeadHunterV2/1.0 (OpenStreetMap business discovery)' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(Math.min(7000, remaining)),
      });
      if (!response.ok) {lastError='OpenStreetMap service responded with HTTP '+response.status+'.';continue;}
      respond({businesses:parseOverpassBusinesses(await response.json(),category.trim(),location.trim())});return;
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'OpenStreetMap service timed out.' : 'OpenStreetMap service connection failed.';
    }
  }
  respond({error:lastError+' Search stopped after a bounded timeout. Please retry shortly. No records were changed.'},503);
}
