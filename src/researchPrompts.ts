import type { BusinessRecord, OpportunityAnalysis } from './opportunityModel';
import { SERVICE_LABELS } from './opportunityModel';

export function buildResearchPrompt(business: BusinessRecord, analysis: OpportunityAnalysis): string {
  const opportunities = analysis.opportunities
    .map(item => `- ${SERVICE_LABELS[item.service]}: ${item.priority} priority (score ${item.score}/100). ${item.rationale}`)
    .join('\\n');
  const evidence = analysis.evidence.length
    ? analysis.evidence.map(item => `- [${item.confidence}] ${item.service}: ${item.signal}. ${item.description} Source: ${item.sourceUrl || 'Not recorded'} (observed ${item.observedAt || 'date not recorded'}).`).join('\\n')
    : '- No technical or marketing evidence has been collected yet.';
  return [
    'Act as a careful digital growth researcher helping an agency evaluate a potential client. Do not invent facts, rankings, traffic, revenue, budgets, or buying intent.',
    '',
    'BUSINESS PROFILE',
    `Name: ${business.name}`,
    `Category: ${business.category}`,
    `Location: ${business.location}`,
    `Website: ${business.websiteUrl || 'No official website found (not proof that none exists)'}`,
    `Website status: ${business.websiteStatus}`,
    `Rating: ${business.rating ?? 'Unknown'}`,
    `Review count: ${business.reviewCount ?? 'Unknown'}`,
    `Phone: ${business.phone || 'Not recorded'}`,
    `Email: ${business.email || 'Not recorded'}`,
    `Discovery source: ${business.discoverySource || 'Not recorded'}`,
    '',
    'DETECTED SERVICE OPPORTUNITIES',
    opportunities,
    '',
    'COLLECTED EVIDENCE',
    evidence,
    '',
    'RESEARCH TASKS',
    '1. Verify the business identity and official online presence.',
    '2. Research competitors in the same location and category using verifiable public sources.',
    '3. Assess website, SEO, local SEO, performance, and marketing opportunities separately.',
    '4. Explain which services have the strongest evidence and which require more investigation.',
    '5. Suggest a personalized, non-generic outreach angle based on verified findings.',
    '6. List source URLs and distinguish verified facts, reasonable hypotheses, and unknowns.',
    '7. Recommend the next three research actions. Do not write outreach claiming unverified problems.',
  ].join('\\n');
}
