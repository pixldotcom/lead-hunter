import { describe, expect, it } from 'vitest';
import type { BusinessRecord, OpportunityAnalysis } from './opportunityModel';
import { buildEvidenceReportHtml, buildWebsiteRebuildPrompt } from './prospectStudio';

const business:BusinessRecord={id:'fixture-1',name:'Example <script>alert(1)</script>',category:'Builder',location:'Test City',websiteUrl:'https://example.test',websiteStatus:'unknown',rating:null,reviewCount:null,phone:'',email:'',profiles:[],discoverySource:'manual',sourceUrl:'',discoveredAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
const analysis:OpportunityAnalysis={businessId:business.id,websiteStatus:'unknown',opportunities:[],evidence:[],totalScore:22,reputationScore:0,evidenceConfidence:0,analyzedAt:'2026-01-01T00:00:00.000Z',researchPrompt:''};

describe('prospect studio helpers',()=>{
 it('builds a rebuild prompt from saved business details and labels its score correctly',()=>{
  const prompt=buildWebsiteRebuildPrompt(business,analysis);
  expect(prompt).toContain(business.websiteUrl);
  expect(prompt).toContain('22/100 (internal opportunity score, not a Lighthouse score)');
  expect(prompt).toContain('Do not invent Lighthouse');
 });
 it('renders a printable evidence report without allowing saved text to inject markup',()=>{
  const html=buildEvidenceReportHtml(business,analysis);
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('not a Lighthouse or Core Web Vitals measurement');
  expect(html).toContain('No evidence was recorded');
 });
});
