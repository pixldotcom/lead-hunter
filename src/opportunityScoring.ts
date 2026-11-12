import type { BusinessRecord, OpportunityEvidence, ServiceOpportunity } from './opportunityModel';

export type OpportunityScore = {
  total: number;
  websiteNeed: number;
  reputation: number;
  serviceEvidence: number;
  confidence: number;
  explanation: string[];
};

export function scoreOpportunities(
  business: BusinessRecord,
  evidence: OpportunityEvidence[],
  opportunities: ServiceOpportunity[],
): OpportunityScore {
  const websiteNeed = business.websiteStatus === 'outdated' ? 100
    : business.websiteStatus === 'no_website_found' ? 95
    : business.websiteStatus === 'needs_improvement' ? 65
    : business.websiteStatus === 'healthy' ? 5 : 0;
  const reputation = business.rating === null || business.reviewCount === null ? 0
    : Math.round(Math.min(100, business.rating / 5 * 70 + Math.min(100, business.reviewCount) / 100 * 30));
  const actionable = evidence.filter(item => item.confidence !== 'unknown');
  const serviceEvidence = Math.min(100, actionable.length * 20);
  const confidence = evidence.length
    ? Math.round(evidence.filter(item => item.confidence === 'confirmed').length / evidence.length * 100)
    : 0;
  const bestService = Math.max(0, ...opportunities.map(item => item.score));
  const total = Math.round(websiteNeed * 0.35 + reputation * 0.2 + bestService * 0.3 + confidence * 0.15);
  const explanation = [
    `Website need: ${websiteNeed}/100 (${business.websiteStatus}).`,
    `Reputation: ${reputation}/100 based on available rating and review count.`,
    `Service evidence: ${serviceEvidence}/100 from ${actionable.length} actionable observations.`,
    `Evidence confidence: ${confidence}/100.`,
  ];
  return { total: Math.min(100, total), websiteNeed, reputation, serviceEvidence, confidence, explanation };
}
