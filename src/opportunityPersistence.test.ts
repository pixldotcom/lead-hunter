import { describe, expect, it } from 'vitest';
import { emptyDiscovery, validateDiscovery, type DiscoveryData } from './discovery';
import { createBusinessRecord, parseBusinessCsv, sameBusiness } from './opportunityPersistence';

describe('opportunity business persistence', () => {
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

  it('deduplicates the same business by name and location when one source lacks a phone or website', () => {
    const a = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana' });
    const b = createBusinessRecord({ name: 'Example Dental', location: 'Ludhiana', websiteUrl: 'https://example.test' });
    expect(sameBusiness(a, b)).toBe(true);
  });

  it('rejects unsupported website protocols', () => {
    expect(() => createBusinessRecord({ name: 'Example', websiteUrl: 'javascript:alert(1)' })).toThrow(/http:\/\/ or https:\/\//i);
  });
});
