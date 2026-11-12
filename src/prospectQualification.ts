import type { BusinessRecord, OpportunityAnalysis, ServiceArea } from './opportunityModel';
import { SERVICE_LABELS } from './opportunityModel';
import { prioritizedOpportunities } from './opportunityDetection';

export type QualificationTier = 'ready' | 'research' | 'verify' | 'analyze';
export type QualifiedProspect = {
  business: BusinessRecord;
  analysis: OpportunityAnalysis | null;
  tier: QualificationTier;
  reason: string;
  recommendedService: ServiceArea | null;
  rank: number;
  missing: string[];
};

/**
 * Evidence-first qualification. High scores are not proof of business need.
 * Contact-ready requires a traceable source, contact route and confirmed
 * service-specific evidence or imported research with linked source facts.
 */
export function qualifyProspect(business: BusinessRecord, analysis: OpportunityAnalysis | null): QualifiedProspect {
  const missing: string[] = [];
  if (!business.sourceUrl) missing.push('business source');
  if (!business.phone && !business.email && !business.websiteUrl) missing.push('contact route');
  if (business.websiteStatus === 'unknown') missing.push('website verification');
  if (business.rating === null || business.reviewCount === null) missing.push('reputation evidence');

  const top = analysis ? prioritizedOpportunities(analysis).find(item => item.priority !== 'unverified') : undefined;
  const confirmed = analysis?.evidence.some(item => item.confidence === 'confirmed' && (!top || item.service === top.service)) ?? false;
  const researchFacts = analysis?.researchNotes?.facts.filter(item => {
    try { const url = new URL(item.sourceUrl); return (url.protocol === 'https:' || url.protocol === 'http:') && !!item.claim.trim(); }
    catch { return false; }
  }).length ?? 0;
  const documented = confirmed || researchFacts > 0;
  if (!analysis) missing.push('opportunity analysis');
  else if (!documented) missing.push('verified service evidence or sourced research');

  let tier: QualificationTier = 'analyze';
  let reason = 'Run the opportunity analyzer to assess this business.';
  if (analysis) {
    if (documented && top && business.sourceUrl && (business.phone || business.email || business.websiteUrl) && business.websiteStatus !== 'unknown') {
      tier = 'ready';
      reason = 'Has a traceable source, a contact route, and evidence to review before personalized outreach.';
    } else if (top && (analysis.totalScore >= 40 || documented)) {
      tier = 'research';
      reason = 'Promising service opportunity; verify missing details before outreach.';
    } else {
      tier = 'verify';
      reason = 'Not enough verified evidence to justify outreach yet.';
    }
  }
  // Evidence readiness outranks raw opportunity score; missing reputation data never becomes a positive signal.
  const rank = (tier === 'ready' ? 300 : tier === 'research' ? 200 : tier === 'verify' ? 100 : 0)
    + (analysis?.totalScore ?? 0) + (documented ? 15 : 0);
  return {business,analysis,tier,reason,recommendedService:top?.service ?? null,rank,missing};
}

export function buildQualifiedShortlist(businesses: BusinessRecord[], analyses: OpportunityAnalysis[]): QualifiedProspect[] {
  const byBusiness = new Map(analyses.map(item => [item.businessId,item]));
  return businesses.map(business => qualifyProspect(business,byBusiness.get(business.id) ?? null))
    .sort((a,b) => b.rank-a.rank || a.business.name.localeCompare(b.business.name));
}

export function buildProspectBrief(prospect: QualifiedProspect): string {
  const {business,analysis} = prospect;
  const service = prospect.recommendedService ? SERVICE_LABELS[prospect.recommendedService] : 'Unverified';
  return [
    'LEAD HUNTER — QUALIFICATION BRIEF',
    `Business: ${business.name}`, `Category: ${business.category || 'Unknown'}`,
    `Location: ${business.location || 'Unknown'}`, `Website: ${business.websiteUrl || 'Not recorded'}`,
    `Website status: ${business.websiteStatus} (verify independently)`,
    `Discovery source: ${business.sourceUrl || 'Not recorded'}`,
    `Reputation: ${business.rating === null ? 'Unknown' : business.rating + '/5'}; reviews: ${business.reviewCount ?? 'Unknown'}`,
    `Qualification: ${prospect.tier}; ${prospect.reason}`,
    `Recommended service: ${service}`,
    `Opportunity score: ${analysis?.totalScore ?? 'Not analyzed'}`,
    `Missing checks: ${prospect.missing.join(', ') || 'None flagged'}`,
    'Evidence:',
    ...(analysis?.evidence.length ? analysis.evidence.slice(0,8).map(item => `- [${item.confidence}] ${item.signal}: ${item.description} ${item.sourceUrl}`) : ['- No technical evidence recorded']),
    'Research findings:',
    ...(analysis?.researchNotes?.facts.length ? analysis.researchNotes.facts.slice(0,8).map(item => `- ${item.claim} (${item.sourceUrl})`) : ['- No sourced research imported']),
    'NEXT ACTION: Verify the claims and business identity, identify one concrete problem, and propose a relevant service. Do not invent reviews, findings or contacts. Do not send outreach without human approval.'
  ].join('\n');
}
