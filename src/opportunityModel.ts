export type WebsiteStatus = 'no_website_found' | 'outdated' | 'needs_improvement' | 'healthy' | 'unknown';
export type ServiceArea = 'website' | 'seo' | 'local_seo' | 'performance' | 'marketing';
export type EvidenceConfidence = 'confirmed' | 'likely' | 'unknown';
export type OpportunityPriority = 'high' | 'medium' | 'low' | 'unverified';
export const PIPELINE_STAGES = ['new','researching','qualified','ready_to_pitch','contacted','negotiating','won','lost'] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

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
  /** Optional workflow state; omitted legacy records are derived from analysis and outreach history. */
  pipelineStage?: PipelineStage;
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

export type OpportunityScoreBreakdown = {
  total: number;
  websiteNeed: number;
  reputation: number;
  serviceEvidence: number;
  confidence: number;
  bestService: number;
  weighted: { websiteNeed: number; reputation: number; bestService: number; confidence: number };
  explanation: string[];
};

export type OpportunityAnalysis = {
  businessId: string;
  websiteStatus: WebsiteStatus;
  opportunities: ServiceOpportunity[];
  evidence: OpportunityEvidence[];
  totalScore: number;
  reputationScore: number;
  evidenceConfidence: number;
  /** Optional for analyses saved before score explainability was added. */
  scoreBreakdown?: OpportunityScoreBreakdown;
  analyzedAt: string;
  researchPrompt: string;
  researchNotes?: ImportedResearch | null;
  /** Previous imported research reports, newest entry last; optional for legacy workspaces. */
  researchHistory?: ImportedResearch[];
};

export type ImportedResearch = {
  summary: string;
  facts: { claim: string; sourceUrl: string }[];
  hypotheses: string[];
  unknowns: string[];
  nextSteps: string[];
  importedAt: string;
};

export const SERVICE_LABELS: Record<ServiceArea, string> = {
  website: 'Website design and redesign',
  seo: 'SEO',
  local_seo: 'Local SEO',
  performance: 'Website performance',
  marketing: 'Digital marketing and conversion',
};

export function normalizeBusinessName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function normalizeLocation(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function createBusinessIdentity(business: Pick<BusinessRecord, 'name' | 'location' | 'phone' | 'websiteUrl'>): string {
  const phone = business.phone.replace(/\D/g, '');
  const website = business.websiteUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  return [normalizeBusinessName(business.name), normalizeLocation(business.location), phone || website].join('|');
}
