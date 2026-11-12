import { describe, expect, it } from 'vitest';
import { createBusinessRecord } from './opportunityPersistence';
import { detectOpportunities } from './opportunityDetection';
import { qualifyProspect } from './prospectQualification';
import { prepareOutreach } from './outreachPreparation';

const prospect = () => {
  const business = createBusinessRecord({name:'Sample Dental',category:'Dentist',location:'Ludhiana',websiteUrl:'https://example.org',websiteStatus:'outdated',sourceUrl:'https://www.openstreetmap.org/node/1',phone:'1234567890',email:'hello@example.org'});
  const analysis = detectOpportunities(business,[{id:'e1',service:'website',signal:'Mobile menu not accessible',description:'Confirmed navigation issue',sourceUrl:'https://example.org',observedAt:'2026-11-12T00:00:00Z',confidence:'confirmed' as const}]);
  return qualifyProspect(business,analysis);
};

describe('outreach preparation',()=>{
  it('produces a non-sending draft for an evidence-backed prospect',()=>{
    const kit=prepareOutreach(prospect(),'email');
    expect(kit.eligible).toBe(true);
    expect(kit.message).toContain('Mobile menu not accessible'.toLowerCase());
    expect(kit.subject).toContain('Sample Dental');
    expect(kit.sourceUrls).toContain('https://example.org');
  });
  it('blocks use of an email draft when the business has no email',()=>{
    const p=prospect();p.business.email='';
    const kit=prepareOutreach(p,'email');
    expect(kit.eligible).toBe(false);
    expect(kit.checks.join(' ')).toMatch(/email address/);
  });
  it('does not claim unsupported research as a proven issue',()=>{
    const p=prospect();p.analysis!.evidence=[];p.analysis!.researchNotes={summary:'Unverified research',facts:[{claim:'Bookings could be improved',sourceUrl:'https://example.org'}],hypotheses:[],unknowns:[],nextSteps:[],importedAt:'2026-11-12T00:00:00Z'};
    const kit=prepareOutreach(p,'email');
    expect(kit.message).not.toContain('Bookings could be improved');
  });
  it('blocks outreach to unqualified prospects',()=>{
    const p=prospect();p.tier='verify';
    expect(prepareOutreach(p,'phone').eligible).toBe(false);
  });
});
