import type { BusinessRecord, OpportunityEvidence, ServiceOpportunity, OpportunityScoreBreakdown } from './opportunityModel';

export type OpportunityScore = OpportunityScoreBreakdown;

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
  const weighted = {
    websiteNeed: Math.round(websiteNeed * 0.35),
    reputation: Math.round(reputation * 0.2),
    bestService: Math.round(bestService * 0.3),
    confidence: Math.round(confidence * 0.15),
  };
  const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
  const explanation = [
    `Website need: ${websiteNeed}/100 contributes ${weighted.websiteNeed} points (35%).`,
    `Reputation: ${reputation}/100 contributes ${weighted.reputation} points (20%).`,
    `Best service opportunity: ${bestService}/100 contributes ${weighted.bestService} points (30%).`,
    `Evidence confidence: ${confidence}/100 contributes ${weighted.confidence} points (15%); ${actionable.length} actionable observations inform service evidence.`,
  ];
  return { total: Math.min(100, total), websiteNeed, reputation, serviceEvidence, confidence, bestService, weighted, explanation };
}
