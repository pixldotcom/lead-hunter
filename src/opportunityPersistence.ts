import { parseCsv, uid } from './domain.ts';
import { PIPELINE_STAGES, type BusinessRecord, type OpportunityAnalysis, type OpportunityEvidence, type ServiceArea, type WebsiteStatus, type EvidenceConfidence, type OpportunityPriority } from './opportunityModel.ts';

const services: ServiceArea[] = ['website', 'seo', 'local_seo', 'performance', 'marketing'];
const websiteStatuses: WebsiteStatus[] = ['no_website_found', 'outdated', 'needs_improvement', 'healthy', 'unknown'];
const confidences: EvidenceConfidence[] = ['confirmed', 'likely', 'unknown'];
const priorities: OpportunityPriority[] = ['high', 'medium', 'low', 'unverified'];
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const validDate = (value: unknown) => isText(value) && (!value || Number.isFinite(Date.parse(value)));
const optionalNumber = (value: unknown, max: number) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalizePhone = (value: string) => value.replace(/\D/g, '');

export function validateBusinessRecord(value: unknown): BusinessRecord {
  if (!isObject(value)) throw Error('Invalid opportunity business record.');
  const b = value as unknown as BusinessRecord;
  if (!['id','name','category','location','websiteUrl','websiteStatus','phone','email','discoverySource','sourceUrl','discoveredAt','updatedAt'].every(key => isText(value[key]))) throw Error('Business record is missing required text fields.');
  if (!b.id.trim() || !b.name.trim() || !websiteStatuses.includes(b.websiteStatus) || !optionalNumber(b.rating, 5) || !optionalNumber(b.reviewCount, 100000000) || (b.rating !== null && b.rating > 5) || (b.reviewCount !== null && !Number.isSafeInteger(b.reviewCount)) || !Array.isArray(b.profiles) || b.profiles.length > 30 || b.profiles.some(p => !isText(p) || p.length > 200) || !validDate(b.discoveredAt) || !validDate(b.updatedAt)) throw Error('Invalid business record fields.');
  if (b.pipelineStage !== undefined && !PIPELINE_STAGES.includes(b.pipelineStage)) throw Error('Invalid pipeline stage.');
  if (b.websiteUrl && !/^https?:\/\//i.test(b.websiteUrl)) throw Error('Business website must use HTTP or HTTPS.');
  if (b.sourceUrl && !/^https?:\/\//i.test(b.sourceUrl)) throw Error('Business source must use HTTP or HTTPS.');
  if (b.websiteUrl.length > 2048 || b.sourceUrl.length > 2048 || b.name.trim().length > 200 || b.location.length > 200 || b.category.length > 120) throw Error('Business fields exceed their allowed length.');
  return b;
}

function validateEvidence(value: unknown): OpportunityEvidence {
  if (!isObject(value) || !isText(value.id) || !isText(value.signal) || !isText(value.description) || !isText(value.sourceUrl) || !isText(value.observedAt) || !services.includes(value.service as ServiceArea) || !confidences.includes(value.confidence as EvidenceConfidence) || !validDate(value.observedAt)) throw Error('Invalid opportunity evidence.');
  const evidence = value as unknown as OpportunityEvidence;
  if (evidence.sourceUrl && !/^https?:\/\//i.test(evidence.sourceUrl)) throw Error('Evidence source must use HTTP or HTTPS.');
  return evidence;
}

export function validateOpportunityAnalysis(value: unknown): OpportunityAnalysis {
  if (!isObject(value) || !isText(value.businessId) || !websiteStatuses.includes(value.websiteStatus as WebsiteStatus) || !Array.isArray(value.opportunities) || !Array.isArray(value.evidence) || typeof value.totalScore !== 'number' || !Number.isFinite(value.totalScore) || value.totalScore < 0 || value.totalScore > 100 || typeof value.reputationScore !== 'number' || !Number.isFinite(value.reputationScore) || value.reputationScore < 0 || value.reputationScore > 100 || typeof value.evidenceConfidence !== 'number' || !Number.isFinite(value.evidenceConfidence) || value.evidenceConfidence < 0 || value.evidenceConfidence > 100 || !validDate(value.analyzedAt) || !isText(value.researchPrompt)) throw Error('Invalid opportunity analysis.');
  const analysis = value as unknown as OpportunityAnalysis;
  if (analysis.researchNotes != null) {
    const notes = analysis.researchNotes;
    if (!isObject(notes) || !isText(notes.summary) || notes.summary.length > 4000 || !Array.isArray(notes.facts) || notes.facts.length > 30 || notes.facts.some(f => !isObject(f) || !isText(f.claim) || f.claim.length > 500 || !isText(f.sourceUrl) || (f.sourceUrl && !/^https?:\/\//i.test(f.sourceUrl))) || !Array.isArray(notes.hypotheses) || notes.hypotheses.length > 30 || notes.hypotheses.some(x => !isText(x) || x.length > 500) || !Array.isArray(notes.unknowns) || notes.unknowns.length > 30 || notes.unknowns.some(x => !isText(x) || x.length > 500) || !Array.isArray(notes.nextSteps) || notes.nextSteps.length > 20 || notes.nextSteps.some(x => !isText(x) || x.length > 500) || !validDate(notes.importedAt)) throw Error('Invalid imported research notes.');
  }
  if (analysis.opportunities.length !== services.length || analysis.opportunities.some(item => !isObject(item) || !services.includes(item.service) || !priorities.includes(item.priority) || !Number.isFinite(item.score) || item.score < 0 || item.score > 100 || !Array.isArray(item.evidenceIds) || item.evidenceIds.some(id => !isText(id)) || !isText(item.rationale))) throw Error('Invalid service opportunity records.');
  analysis.evidence.forEach(validateEvidence);
  return analysis;
}

export function normalizeOpportunityData<T extends { businesses?: BusinessRecord[]; opportunityAnalyses?: OpportunityAnalysis[] }>(data: T): T & { businesses: BusinessRecord[]; opportunityAnalyses: OpportunityAnalysis[] } {
  const businesses = data.businesses ?? [];
  const opportunityAnalyses = data.opportunityAnalyses ?? [];
  if (!Array.isArray(businesses) || businesses.length > 10000 || !Array.isArray(opportunityAnalyses) || opportunityAnalyses.length > 10000) throw Error('Opportunity workspace record limit exceeded.');
  businesses.forEach(validateBusinessRecord);
  opportunityAnalyses.forEach(validateOpportunityAnalysis);
  const businessIds = new Set(businesses.map(b => b.id));
  if (businessIds.size !== businesses.length || opportunityAnalyses.some(a => !businessIds.has(a.businessId)) || new Set(opportunityAnalyses.map(a => a.businessId)).size !== opportunityAnalyses.length) throw Error('Opportunity analyses must reference unique saved businesses.');
  return { ...data, businesses, opportunityAnalyses };
}

export type BusinessImportRow = Partial<Pick<BusinessRecord, 'name'|'category'|'location'|'websiteUrl'|'phone'|'email'|'rating'|'reviewCount'|'profiles'|'discoverySource'|'sourceUrl'|'websiteStatus'>> & { name: string };

export function parseImportedResearch(text: string, now = new Date()): NonNullable<OpportunityAnalysis['researchNotes']> {
  if (!text.trim() || text.length > 20000) throw Error('Paste research JSON under 20 KB.');
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(trimmed);
  const payload = fenced ? fenced[1].trim() : trimmed;
  let input: unknown;
  try { input = JSON.parse(payload); } catch { throw Error('Research must be a valid JSON object. Remove any explanation before or after the JSON.'); }
  if (!isObject(input)) throw Error('Research must be a JSON object.');
  const list = (key: string, limit: number) => {
    const value = input[key];
    if (value === undefined) return [] as unknown[];
    if (!Array.isArray(value) || value.length > limit) throw Error(`Research ${key} must be a list of at most ${limit} items.`);
    return value;
  };
  const summary = input.summary;
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 4000) throw Error('Research summary is required (maximum 4,000 characters).');
  const facts = list('facts', 30).map((item, index) => {
    if (!isObject(item) || !isText(item.claim) || !item.claim.trim() || item.claim.length > 500 || !isText(item.sourceUrl) || !/^https?:\/\//i.test(item.sourceUrl)) throw Error(`Research fact ${index + 1} needs a claim and an HTTP(S) source URL.`);
    return { claim: item.claim.trim(), sourceUrl: item.sourceUrl };
  });
  const strings = (key: string, limit: number) => list(key, limit).map((item, index) => {
    if (!isText(item) || !item.trim() || item.length > 500) throw Error(`Research ${key} item ${index + 1} must be text under 500 characters.`);
    return item.trim();
  });
  return { summary: summary.trim(), facts, hypotheses: strings('hypotheses', 30), unknowns: strings('unknowns', 30), nextSteps: strings('nextSteps', 20), importedAt: now.toISOString() };
}

export function parseBusinessCsv(text: string): BusinessImportRow[] {
  if (text.length > 100000 || !text.trim()) throw Error('Import a non-empty CSV under 100 KB.');
  const rows = parseCsv(text);
  if (rows.length > 500) throw Error('Import is limited to 500 businesses at a time.');
  return rows.map((row, index) => {
    const get = (...names: string[]) => Object.entries(row).find(([key]) => names.includes(key.trim().toLowerCase()))?.[1]?.trim() ?? '';
    const name = get('name', 'business', 'business name');
    if (!name) throw Error(`CSV row ${index + 2}: business name is required.`);
    const ratingRaw = get('rating', 'stars');
    const reviewsRaw = get('reviewcount', 'review count', 'reviews');
    const rating = ratingRaw ? Number(ratingRaw) : null;
    const reviewCount = reviewsRaw ? Number(reviewsRaw) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) throw Error(`CSV row ${index + 2}: rating must be between 0 and 5.`);
    if (reviewCount !== null && (!Number.isSafeInteger(reviewCount) || reviewCount < 0)) throw Error(`CSV row ${index + 2}: review count must be a non-negative whole number.`);
    const statusRaw = get('websitestatus', 'website status').toLowerCase().replace(/[ -]/g, '_');
    const websiteStatus = statusRaw ? websiteStatuses.find(status => status === statusRaw) : undefined;
    if (statusRaw && !websiteStatus) throw Error(`CSV row ${index + 2}: unknown website status.`);
    const websiteUrl = get('website', 'websiteurl', 'website url', 'url');
    const sourceUrl = get('sourceurl', 'source url', 'listing url');
    const profiles = get('profiles', 'social profiles').split(/[;|]/).map(item => item.trim()).filter(Boolean);
    return { name, category: get('category', 'industry', 'type'), location: get('location', 'city', 'area'), websiteUrl, phone: get('phone', 'telephone'), email: get('email'), rating, reviewCount, profiles, discoverySource: get('discoverysource', 'discovery source', 'source') || 'CSV import', sourceUrl, ...(websiteStatus ? { websiteStatus } : {}) };
  });
}

export function createBusinessRecord(row: BusinessImportRow, now = new Date()): BusinessRecord {
  const stamp = now.toISOString();
  if (!row.name?.trim()) throw Error('Business name is required.');
  const websiteUrl = (row.websiteUrl ?? '').trim();
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) throw Error('Website URL must start with http:// or https://.');
  const sourceUrl = (row.sourceUrl ?? '').trim();
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw Error('Source URL must start with http:// or https://.');
  const record: BusinessRecord = {
    id: uid(), name: row.name.trim(), category: row.category?.trim() ?? '', location: row.location?.trim() ?? '',
    websiteUrl, websiteStatus: row.websiteStatus ?? 'unknown', rating: row.rating ?? null, reviewCount: row.reviewCount ?? null,
    phone: row.phone?.trim() ?? '', email: row.email?.trim() ?? '', profiles: row.profiles ?? [],
    discoverySource: row.discoverySource?.trim() ?? 'Manual entry', sourceUrl, discoveredAt: stamp, updatedAt: stamp,
  };
  return validateBusinessRecord(record);
}

export function sameBusiness(a: BusinessRecord, b: BusinessRecord): boolean {
  const siteIdentity = (raw: string) => {
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return { host: url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''), path: url.pathname.toLowerCase().replace(/\/+$/, '') || '/' };
    } catch { return ''; }
  };
  const siteA = siteIdentity(a.websiteUrl), siteB = siteIdentity(b.websiteUrl);
  const sameNameAndLocation = normalize(a.name) === normalize(b.name) && normalize(a.location) === normalize(b.location);
  const urlOnly = (record: BusinessRecord) => record.discoverySource === 'Official website (user supplied)' && !record.location.trim();
  const sameHost = !!siteA && !!siteB && siteA.host === siteB.host;
  const sameSitePath = !!siteA && !!siteB && siteA.host === siteB.host && (siteA.path === siteB.path || siteA.path === '/' || siteB.path === '/');
  if (siteA && siteB && sameHost && (sameNameAndLocation || (sameSitePath && (urlOnly(a) || urlOnly(b))))) return true;
  if (!sameNameAndLocation) return false;
  const phoneA = normalizePhone(a.phone), phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) return true;
  if (siteA && siteB && sameHost && siteA.path === siteB.path) return true;
  if (phoneA && phoneB && phoneA !== phoneB) return false;
  if (siteA && siteB && (!sameHost || siteA.path !== siteB.path)) return false;
  return true;
}
