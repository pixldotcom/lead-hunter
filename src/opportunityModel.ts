export type WebsiteStatus = 'no_website_found' | 'outdated' | 'needs_improvement' | 'healthy' | 'unknown';
export type ServiceArea = 'website' | 'seo' | 'local_seo' | 'performance' | 'marketing';
export type EvidenceConfidence = 'confirmed' | 'likely' | 'unknown';
export type OpportunityPriority = 'high' | 'medium' | 'low' | 'unverified';

export type BusinessRecord = {
  id: string;
  name: string;
  category: string;
  location: string;
  websiteUrl: string;
  websiteStatus: WebsiteStatus;
  rating: number | null;
  reviewCount: number | null;
  phone: string;
  email: string;
  profiles: string[];
  discoverySource: string;
  sourceUrl: string;
  discoveredAt: string;
  updatedAt: string;
};

export type OpportunityEvidence = {
  id: string;
  service: ServiceArea;
  signal: string;
  description: string;
  sourceUrl: string;
  observedAt: string;
  confidence: EvidenceConfidence;
};

export type ServiceOpportunity = {
  service: ServiceArea;
  priority: OpportunityPriority;
  score: number;
  evidenceIds: string[];
  rationale: string;
};

export type OpportunityAnalysis = {
  businessId: string;
  websiteStatus: WebsiteStatus;
  opportunities: ServiceOpportunity[];
  evidence: OpportunityEvidence[];
  totalScore: number;
  reputationScore: number;
  evidenceConfidence: number;
  analyzedAt: string;
  researchPrompt: string;
};

export const SERVICE_LABELS: Record<ServiceArea, string> = {
  website: 'Website design and redesign',
  seo: 'SEO',
  local_seo: 'Local SEO',
  performance: 'Website performance',
  marketing: 'Digital marketing and conversion',
};

export function normalizeBusinessName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
}

export function normalizeLocation(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
}

export function createBusinessIdentity(business: Pick<BusinessRecord, 'name' | 'location' | 'phone' | 'websiteUrl'>): string {
  const phone = business.phone.replace(/\\D/g, '');
  const website = business.websiteUrl.trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/^www\\./, '').replace(/\\/$/, '');
  return [normalizeBusinessName(business.name), normalizeLocation(business.location), phone || website].join('|');
}
