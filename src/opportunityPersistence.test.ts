import { describe, expect, it } from 'vitest';
import { emptyDiscovery, validateDiscovery, type DiscoveryData } from './discovery';
import { createBusinessRecord, parseBusinessCsv, parseImportedResearch, sameBusiness, validateOpportunityAnalysis } from './opportunityPersistence';
import { detectOpportunities } from './opportunityDetection';

describe('opportunity business persistence', () => {
  it('imports structured research while keeping claims source-linked and hypotheses separate', () => {
    const notes = parseImportedResearch(JSON.stringify({ summary: 'Summary', facts: [{ claim: 'Open weekends', sourceUrl: 'https://example.test/hours' }], hypotheses: ['Could improve mobile booking'], unknowns: ['Current conversion rate'], nextSteps: ['Verify hours'] }), new Date('2026-11-12T00:00:00.000Z'));
    expect(notes.facts[0].sourceUrl).toBe('https://example.test/hours');
    expect(notes.hypotheses).toEqual(['Could improve mobile booking']);
    expect(notes.importedAt).toBe('2026-11-12T00:00:00.000Z');
  });

  it('accepts JSON code fences from ChatGPT without weakening source checks', () => {
    const payload = JSON.stringify({ summary: 'Checked sources', facts: [{claim:'Public opening hours',sourceUrl:'https://example.org/hours'}], hypotheses: [], unknowns: [], nextSteps: [] });
    const notes = parseImportedResearch('\`\`\`json\n' + payload + '\n\`\`\`');
    expect(notes.facts).toHaveLength(1);
    expect(() => parseImportedResearch('\`\`\`json\n' + JSON.stringify({summary:'Unsupported',facts:[{claim:'Claim',sourceUrl:''}]}) + '\n\`\`\`')).toThrow(/source URL/);
  });

  it('accepts escaped ChatGPT JSON with HTML-encoded spacing', () => {
    const payload = JSON.stringify({ summary: 'Identity checked', facts: [{ claim: 'Address verified from public listing', sourceUrl: 'https://example.org/listing' }], hypotheses: [], unknowns: ['Confirm the legal business name'], nextSteps: ['1. Confirm the entity', '2. Check the official website'] });
    const copied = payload.replace(/"/g, '\\\"').replace(/ /g, '&amp;#x20;');
    const notes = parseImportedResearch(copied);
    expect(notes.summary).toBe('Identity checked');
    expect(notes.facts[0].claim).toBe('Address verified from public listing');
    expect(notes.nextSteps).toEqual(['1. Confirm the entity', '2. Check the official website']);
  });

  it('repairs ChatGPT line continuations and backslashes before URL punctuation', () => {
    const copied = [
      '{\\',
      '&#x20; "summary": "Identity verified",\\',
      '&#x20; "facts": [{ "claim": "Official contact page", "sourceUrl": "https\\://www\\.example\\.org/contact" }],\\',
      '&#x20; "hypotheses": [],\\',
      '&#x20; "unknowns": [],\\',
      '&#x20; "nextSteps": []',
      '}',
    ].join('\n');
    const notes = parseImportedResearch(copied);
    expect(notes.summary).toBe('Identity verified');
    expect(notes.facts[0].sourceUrl).toBe('https://www.example.org/contact');
  });

  it('extracts a JSON object from a ChatGPT explanation and code block', () => {
    const payload = JSON.stringify({ summary: 'Checked sources', facts: [], hypotheses: [], unknowns: [], nextSteps: [] });
    const notes = parseImportedResearch('Here is the requested research:\n```json\n' + payload + '\n```\nYou can verify the linked sources.');
    expect(notes.summary).toBe('Checked sources');
  });

  it('rejects research claims without an HTTP source and oversized input', () => {
    expect(() => parseImportedResearch(JSON.stringify({ summary: 'Summary', facts: [{ claim: 'Unverified', sourceUrl: '' }] }))).toThrow(/source URL/);
    expect(() => parseImportedResearch('x'.repeat(20001))).toThrow(/20 KB/);
  });
  it('accepts a business without a website', () => {
    const [row] = parseBusinessCsv('name,category,location,rating,reviewCount,websiteStatus\nExample Dental,Dentist,Ludhiana,4.7,180,no_website_found');
    const business = createBusinessRecord(row, new Date('2026-11-12T00:00:00.000Z'));
    expect(business.websiteUrl).toBe('');
    expect(business.websiteStatus).toBe('no_website_found');
    expect(business.rating).toBe(4.7);
  });

  it('keeps legacy discovery payloads valid and adds empty opportunity collections', () => {
    const legacy: DiscoveryData = { ...emptyDiscovery() };
    delete legacy.businesses;
    delete legacy.opportunityAnalyses;
    const migrated = validateDiscovery(legacy);
    expect(migrated.businesses).toEqual([]);
    expect(migrated.opportunityAnalyses).toEqual([]);
  });

  it('accepts legacy opportunity analyses without score breakdowns', () => {
    const business=createBusinessRecord({name:'Legacy business'});
    const analysis=detectOpportunities(business,[]);
    delete (analysis as {scoreBreakdown?:unknown}).scoreBreakdown;
    expect(validateOpportunityAnalysis(analysis).scoreBreakdown).toBeUndefined();
  });

  it('deduplicates the same business by name and location when one source lacks a phone or website', () => {
    const a = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana' });
    const b = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://example.test' });
    expect(sameBusiness(a, b)).toBe(true);
  });

  it('uses the website as a matching identity when phone records differ', () => {
    const a = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://example.test', phone: '1111111111' });
    const b = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://www.example.test/', phone: '2222222222' });
    expect(sameBusiness(a, b)).toBe(true);
  });

  it('keeps same-name businesses separate when both phone and website differ', () => {
    const a = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://one.test', phone: '1111111111' });
    const b = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://two.test', phone: '2222222222' });
    expect(sameBusiness(a, b)).toBe(false);
  });

  it('rejects unsupported website protocols', () => {
    expect(() => createBusinessRecord({ name: 'Example', websiteUrl: 'javascript:alert(1)' })).toThrow(/http:\/\/ or https:\/\//i);
  });
});
