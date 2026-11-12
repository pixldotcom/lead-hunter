import { describe, expect, it } from 'vitest';
import { buildProspectBrief, buildQualifiedShortlist, qualifyProspect } from './prospectQualification';
import { createBusinessRecord } from './opportunityPersistence';
import { detectOpportunities } from './opportunityDetection';
import type { OpportunityEvidence } from './opportunityModel';

const business = () => createBusinessRecord({name:'Example Dental',category:'dentist',location:'Ludhiana',websiteUrl:'https://example.org',websiteStatus:'outdated',sourceUrl:'https://www.openstreetmap.org/node/123',phone:'1234567890'});
const evidence = (businessId: string): OpportunityEvidence[] => [{id:'e1',service:'website',signal:'Broken mobile navigation',description:'Menu cannot be opened on a small viewport',sourceUrl:'https://example.org',observedAt:'2026-11-12T00:00:00.000Z',confidence:'confirmed'}];

describe('prospect qualification', () => {
  it('requires an analysis before qualification', () => {
    const result = qualifyProspect(business(),null);
    expect(result.tier).toBe('analyze');
    expect(result.missing).toContain('opportunity analysis');
  });
  it('does not mistake a high score without evidence for outreach readiness', () => {
    const b=business();
    const result=qualifyProspect(b,detectOpportunities(b,[]));
    expect(result.tier).not.toBe('ready');
    expect(result.missing).toContain('verified service evidence or sourced research');
  });
  it('prioritizes evidence-backed prospects with a source and contact route', () => {
    const b=business();
    const analysis=detectOpportunities(b,evidence(b.id));
    expect(qualifyProspect(b,analysis).tier).toBe('ready');
    expect(buildProspectBrief(qualifyProspect(b,analysis))).toContain('Broken mobile navigation');
  });
  it('keeps unknown website status out of the ready queue', () => {
    const b={...business(),websiteStatus:'unknown' as const};
    expect(qualifyProspect(b,detectOpportunities(b,evidence(b.id))).tier).not.toBe('ready');
  });
  it('sorts ready prospects above unanalysed businesses', () => {
    const b=business(), other=createBusinessRecord({name:'Another Business'});
    const ranked=buildQualifiedShortlist([other,b],[detectOpportunities(b,evidence(b.id))]);
    expect(ranked[0].business.id).toBe(b.id);
  });
});
