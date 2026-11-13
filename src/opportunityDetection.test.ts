import { describe, expect, it } from 'vitest';
import { detectOpportunities } from './opportunityDetection';
import { validateOpportunityAnalysis } from './opportunityPersistence';
import type { BusinessRecord, OpportunityEvidence } from './opportunityModel';

const base: BusinessRecord = {
  id: 'business-1',
  name: 'Example Dental',
  category: 'Dentist',
  location: 'Ludhiana, India',
  websiteUrl: '',
  websiteStatus: 'no_website_found',
  rating: 4.7,
  reviewCount: 180,
  phone: '',
  email: '',
  profiles: [],
  discoverySource: 'manual import',
  sourceUrl: '',
  discoveredAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('detectOpportunities', () => {
  it('prioritizes businesses where no official website was found', () => {
    const result = detectOpportunities(base, []);
    const website = result.opportunities.find(item => item.service === 'website');
    expect(website?.priority).toBe('high');
    expect(result.totalScore).toBeGreaterThan(50);
    expect(result.researchPrompt).toContain('No official website found');
  });

  it('does not claim unobserved SEO problems', () => {
    const result = detectOpportunities(base, []);
    const seo = result.opportunities.find(item => item.service === 'seo');
    expect(seo?.priority).toBe('unverified');
    expect(seo?.rationale).toContain('No reliable service-specific evidence');
  });

  it('uses confirmed evidence to prioritize service opportunities', () => {
    const evidence: OpportunityEvidence[] = [{
      id: 'evidence-1',
      service: 'performance',
      signal: 'slow-response',
      description: 'The homepage response time exceeded the configured threshold.',
      sourceUrl: 'https://example.test/',
      observedAt: '2026-01-01T00:00:00.000Z',
      confidence: 'confirmed',
    }];
    const result = detectOpportunities({ ...base, websiteUrl: 'https://example.test', websiteStatus: 'needs_improvement' }, evidence);
    const performance = result.opportunities.find(item => item.service === 'performance');
    expect(performance?.priority).toBe('low');
    expect(performance?.evidenceIds).toContain('evidence-1');
  });
  it('explains each weighted score contribution and validates the breakdown', () => {
    const result=detectOpportunities({...base,websiteStatus:'healthy'},[]);
    expect(result.scoreBreakdown).toMatchObject({
      total: result.totalScore,
      websiteNeed: 5,
      reputation: result.reputationScore,
      confidence: 0,
      weighted: { websiteNeed: 2, confidence: 0 },
    });
    expect(result.scoreBreakdown?.explanation.join(' ')).toContain('Best service opportunity');
    expect(validateOpportunityAnalysis(result).scoreBreakdown).toEqual(result.scoreBreakdown);
  });

  it('treats an outdated status as a reviewer assessment that still needs evidence', () => {
    const result = detectOpportunities({ ...base, websiteUrl: 'https://example.test', websiteStatus: 'outdated' }, []);
    const website = result.opportunities.find(item => item.service === 'website');
    expect(website?.priority).toBe('high');
    expect(website?.rationale).toContain('A reviewer marked this website as outdated');
  });

  it('allows confirmed website findings to create an opportunity when website status is unknown', () => {
    const evidence: OpportunityEvidence[] = [
      { id: 'web-1', service: 'website', signal: 'missing-title', description: 'The homepage has no title element.', sourceUrl: 'https://example.test/', observedAt: '2026-01-01T00:00:00.000Z', confidence: 'confirmed' },
      { id: 'web-2', service: 'website', signal: 'missing-viewport', description: 'The homepage has no viewport declaration.', sourceUrl: 'https://example.test/', observedAt: '2026-01-01T00:00:00.000Z', confidence: 'confirmed' },
    ];
    const result = detectOpportunities({ ...base, websiteUrl: 'https://example.test', websiteStatus: 'unknown' }, evidence);
    expect(result.opportunities.find(item => item.service === 'website')?.priority).toBe('medium');
  });

});
