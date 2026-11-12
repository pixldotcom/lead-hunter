import type { BusinessRecord, OpportunityEvidence, OpportunityAnalysis, ServiceArea, ServiceOpportunity } from './opportunityModel';
import { SERVICE_LABELS } from './opportunityModel';
import { scoreOpportunities } from './opportunityScoring';
import { buildResearchPrompt } from './researchPrompts';

const SERVICES: ServiceArea[] = ['website', 'seo', 'local_seo', 'performance', 'marketing'];

export function detectOpportunities(business: BusinessRecord, evidence: OpportunityEvidence[], now = new Date()): OpportunityAnalysis {
  const opportunities: ServiceOpportunity[] = SERVICES.map(service => {
    const matching = evidence.filter(item => item.service === service && item.confidence !== 'unknown');
    const confirmed = matching.filter(item => item.confidence === 'confirmed');
    const likely = matching.filter(item => item.confidence === 'likely');
    let score = Math.min(100, confirmed.length * 25 + likely.length * 12);
    let rationale = matching.length
      ? matching.map(item => item.description).join(' ')
      : 'No reliable service-specific evidence collected yet. Research is required before making a recommendation.';

    if (service === 'website') {
      if (business.websiteStatus === 'no_website_found') {
        score = Math.max(score, 85);
        rationale = 'No official website was found during discovery. Verify ownership and search coverage before outreach.';
      } else if (business.websiteStatus === 'outdated') {
        score = Math.max(score, 90);
        rationale = 'The website has been classified as outdated based on recorded website evidence.';
      } else if (business.websiteStatus === 'unknown') {
        score = Math.min(score, 15);
      }
    }

    const priority = score >= 65 ? 'high' : score >= 30 ? 'medium' : matching.length ? 'low' : 'unverified';
    return {
      service,
      priority,
      score,
      evidenceIds: matching.map(item => item.id),
      rationale: rationale || SERVICE_LABELS[service],
    };
  });

  const reputationScore = business.rating === null || business.reviewCount === null
    ? 0
    : Math.min(100, Math.round((business.rating / 5) * 65 + Math.min(business.reviewCount, 100) / 100 * 35));
  const websiteBoost = business.websiteStatus === 'outdated' || business.websiteStatus === 'no_website_found' ? 25 : 0;
  const evidenceConfidence = evidence.length
    ? Math.round(evidence.filter(item => item.confidence === 'confirmed').length / evidence.length * 100)
    : 0;
  const scored = scoreOpportunities(business, evidence, opportunities);
  const totalScore = Math.min(100, Math.round(scored.total * 0.8 + reputationScore * 0.1 + websiteBoost * 0.1));

  const analysis: OpportunityAnalysis = {
    businessId: business.id,
    websiteStatus: business.websiteStatus,
    opportunities,
    evidence,
    totalScore,
    reputationScore,
    evidenceConfidence,
    analyzedAt: now.toISOString(),
    researchPrompt: '',
  };
  analysis.researchPrompt = buildResearchPrompt(business, analysis);
  return analysis;
}

export function prioritizedOpportunities(analysis: OpportunityAnalysis): ServiceOpportunity[] {
  const order: Record<ServiceOpportunity['priority'], number> = { high: 0, medium: 1, low: 2, unverified: 3 };
  return [...analysis.opportunities].sort((a, b) => order[a.priority] - order[b.priority] || b.score - a.score);
}
