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


type GeocodingFeature = {geometry?:{coordinates?:number[]};properties?:{name?:string;city?:string;country?:string;type?:string}};
function normalizePlaceName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
// Only use a Photon result when its place name matches the requested locality.
// Ambiguous names fall back to the named-area query instead of selecting an arbitrary city.
export function selectGeocodedCenter(location: string, features: GeocodingFeature[]): {lat:number;lon:number}|null {
  const requestedLocality=normalizePlaceName(location.split(',')[0] ?? '');
  if(!requestedLocality)return null;
  const matches=features.filter(feature=>{
    const properties=feature.properties;
    return Boolean(properties && [properties.name,properties.city].some(name=>typeof name==='string'&&normalizePlaceName(name)===requestedLocality));
  });
  if(matches.length!==1)return null;
  const coords=matches[0]?.geometry?.coordinates;
  if(!coords||coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))return null;
  return {lat:coords[1],lon:coords[0]};
}
// Resolve a city once per request; bounded radius queries avoid expensive administrative-area scans.
async function geocodeCity(location: string): Promise<{lat:number;lon:number}|null> {
  try {
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(location) + '&limit=5&lang=en';
    const response = await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(3500)});
    if (!response.ok) return null;
    const data = await response.json() as {features?:GeocodingFeature[]};
    return selectGeocodedCenter(location,data.features ?? []);
  } catch {return null;}
}
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
type Business = ReturnType<typeof parseOverpassBusinesses>[number];
const cache = new Map<string,{at:number;businesses:Business[];source:string}>();
function remember(key:string,businesses:Business[],source:string) {
  if(cache.size>80) cache.delete(cache.keys().next().value!);
  cache.set(key,{at:Date.now(),businesses,source});
}
async function overpassSearch(endpoint:string,query:string,category:string,location:string,timeout:number) {
  const response=await fetch(endpoint+'?data='+encodeURIComponent(query),{
    headers:{accept:'application/json'},signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok) throw Error('HTTP '+response.status);
  return parseOverpassBusinesses(await response.json(),category,location);
}
// Photon indexes OSM places and is a distinct read path when public Overpass is overloaded.
// Only retain records with a matching OSM category, not fuzzy keyword matches.
async function photonSearch(category:string,location:string,timeout:number):Promise<Business[]> {
  const tag=categories[category.trim().toLowerCase()];
  if(!tag)return [];
  const url='https://photon.komoot.io/api/?q='+encodeURIComponent(category+' '+location)+'&limit=100&lang=en';
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw Error('Photon HTTP '+response.status);
  const data=await response.json() as {features?:Array<{geometry?:{coordinates?:number[]};properties?:Record<string,unknown>}>};
  const rows:Business[]=[];const seen=new Set<string>();
  for(const feature of data.features??[]) {
    const p=feature.properties??{};
    const name=typeof p.name==='string'?p.name.trim():'';
    const osmId=p.osm_id;const osmType=({N:'node',W:'way',R:'relation'} as Record<string,string>)[String(p.osm_type)]??String(p.osm_type);
    const key=p.osm_key, value=p.osm_value;
    if(!name || !['node','way','relation'].includes(String(osmType)) || !Number.isFinite(Number(osmId)))continue;
    if(key!==tag[0]||value!==tag[1])continue;
    const sourceUrl='https://www.openstreetmap.org/'+osmType+'/'+osmId;
    if(seen.has(sourceUrl))continue;seen.add(sourceUrl);
    const coords=feature.geometry?.coordinates;
    const city=typeof p.city==='string'?p.city:location;
    const address=[p.street,p.housenumber,p.district,city].filter(v=>typeof v==='string'&&v.trim()).join(', ');
    rows.push({name,category,location:address||location,websiteUrl:'',phone:'',rating:null,reviewCount:null,sourceUrl,discoverySource:'OpenStreetMap (Photon)',websiteStatus:'unknown',websiteEvidence:'not_listed',opportunityHint:'Photon does not expose website evidence — verify independently',...(coords&&coords.length>=2?{profiles:['https://www.openstreetmap.org/?mlat='+coords[1]+'&mlon='+coords[0]]}:{})});
  }
  return rows;
}
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
  const cacheKey=category.trim().toLowerCase()+'|'+location.trim().toLowerCase();
  res.setHeader('X-Discovery-Engine','osm-multi-source-v1');
  const cached=cache.get(cacheKey);
  if(cached&&Date.now()-cached.at<10*60*1000){respond({businesses:cached.businesses,source:cached.source,cached:true});return;}
  const started=Date.now();
  const center=await geocodeCity(location);
  if(center) query=buildOverpassQuery(category,location,center);
  // Race independent sources rather than spending the entire budget sequentially.
  // The first non-empty verified OSM response wins; an empty result is not success.
  const attempts:string[]=[];
  const jobs=[
    ...endpoints.map(endpoint=>overpassSearch(endpoint,query,category,location,10500)
      .then(businesses=>({businesses,source:'Overpass '+new URL(endpoint).hostname}))
      .catch(error=>{attempts.push(new URL(endpoint).hostname+': '+(error instanceof Error?error.message:'failed'));return null;})),
    photonSearch(category,location,9000)
      .then(businesses=>({businesses,source:'Photon OSM index'}))
      .catch(error=>{attempts.push('Photon: '+(error instanceof Error?error.message:'failed'));return null;})
  ];
  const pending=new Map(jobs.map((job,index)=>[index,job.then(result=>({index,result}))]));
  let found:Business[]=[];let foundSource='';
  while(pending.size){
    const next=await Promise.race([...pending.values()]);
    pending.delete(next.index);
    if(next.result?.businesses.length){found=next.result.businesses;foundSource=next.result.source;break;}
  }
  console.info('[discovery]',JSON.stringify({category,location,source:foundSource||'none',count:found.length,elapsedMs:Date.now()-started,attempts}));
  if(found.length){remember(cacheKey,found,foundSource);respond({businesses:found,source:foundSource});return;}
  respond({error:'No business records returned by the available public OSM sources. Please try a different category or location. Public services may be unavailable.',attempts:attempts.slice(0,4)},503);
}
