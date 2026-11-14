import { describe, expect, it } from 'vitest';
import type { BusinessRecord } from './opportunityModel';
import { appendCommunication, buildFollowUpPrompt, buildOutreachPrompt, buildWebsiteContextPrompt, isSafeHttpUrl, withPrototype } from './prospectStudio';
import { validateBusinessRecord } from './opportunityPersistence';
import { mergeImportedBusiness } from './quickImport';
import { communicationStage } from './prospectStudio';
import { pipelineStageForOutreach } from './pipeline';

const business: BusinessRecord = {
  id: 'fixture-1', name: 'Example Dental', category: 'Dentist', location: 'Test City',
  websiteUrl: 'https://example.test', websiteStatus: 'unknown', rating: null, reviewCount: null,
  phone: '+1 555 0100', email: 'owner@example.test', profiles: [], discoverySource: 'manual',
  sourceUrl: '', discoveredAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  contextNotes: 'Family dental clinic; wants a modern mobile site.'
};

describe('prospect workflow prompts and record validation', () => {
  it('creates a copyable website context prompt without requiring an audit or JSON round-trip', () => {
    const prompt = buildWebsiteContextPrompt(business);
    expect(prompt).toContain('Example Dental');
    expect(prompt).toContain('Dentist');
    expect(prompt).toContain('https://example.test');
    expect(prompt).toContain('Test City');
    expect(prompt).toContain(business.contextNotes);
    expect(prompt).toContain('research the business');
    expect(prompt).toContain('ONE comprehensive master website build prompt');
    expect(prompt).not.toContain('JSON');
  });

  it('prepares outreach context from the saved prototype and contact details', () => {
    const prompt = buildOutreachPrompt({
      ...business,
      clientJourney: {
        prototype: { url: 'https://preview.example.test', platform: 'Vercel', completedAt: '2026-11-14', notes: '', improvements: 'Simpler booking flow', projectReference: 'Dental-Redesign' },
        promptSnapshots: [], communications: []
      }
    });
    expect(prompt).toContain('https://example.test');
    expect(prompt).toContain('https://preview.example.test');
    expect(prompt).toContain('Dental-Redesign');
    expect(prompt).toContain('Simpler booking flow');
    expect(prompt).toContain('owner@example.test');
    expect(prompt).toContain('not an approved project');
  });

  it('includes complete sent and reply bodies in follow-up context', () => {
    const sentBody = 'Hello, I prepared a redesign concept. Please review the full concept here.';
    const replyBody = 'Thank you. Could you explain how the appointment request works?';
    const prompt = buildFollowUpPrompt({
      ...business,
      pipelineStage: 'contacted',
      clientJourney: {
        prototype: { url: 'https://preview.example.test', platform: 'Vercel', completedAt: '', notes: '', improvements: '', projectReference: 'Dental-Redesign' },
        promptSnapshots: [],
        communications: [
          { id: 'sent-1', kind: 'sent', channel: 'email', subject: 'Website concept', message: sentBody, contact: 'owner@example.test', occurredAt: '2026-11-14T10:00:00.000Z', prototypeUrl: 'https://preview.example.test', followUpAt: '', notes: '' },
          { id: 'reply-1', kind: 'reply', channel: 'email', subject: 'Re: Website concept', message: replyBody, contact: 'owner@example.test', occurredAt: '2026-11-15T10:00:00.000Z', prototypeUrl: 'https://preview.example.test', followUpAt: '', notes: '' }
        ]
      }
    });
    expect(prompt).toContain(sentBody);
    expect(prompt).toContain(replyBody);
    expect(prompt).toContain('2026-11-14T10:00:00.000Z');
    expect(prompt).toContain('https://preview.example.test');
    expect(prompt).toContain('contacted');
  });

  it('preserves legacy records and validates optional prototype data', () => {
    const legacy = { ...business };
    expect(validateBusinessRecord(legacy).id).toBe(business.id);
    const journey = {
      prototype: { url: 'https://preview.example.test', platform: 'Vercel', completedAt: '2026-11-14', notes: '', improvements: '', projectReference: 'Dental-Redesign' },
      promptSnapshots: [], communications: []
    };
    expect(validateBusinessRecord({ ...legacy, clientJourney: journey }).clientJourney?.prototype.projectReference).toBe('Dental-Redesign');
    expect(() => validateBusinessRecord({ ...legacy, clientJourney: { ...journey, prototype: { ...journey.prototype, url: 'javascript:alert(1)' } } })).toThrow();
    expect(() => validateBusinessRecord({ ...legacy, contextNotes: 'x'.repeat(5001) })).toThrow(/5,000/);
  });

  it('keeps prototype and communications when a duplicate website import is merged', () => {
    const existing = { ...business, clientJourney: { prototype: { url: 'https://preview.example.test', platform: 'Vercel', completedAt: '', notes: '', improvements: '', projectReference: 'Saved project' }, promptSnapshots: [], communications: [{ id: 'sent-1', kind: 'sent' as const, channel: 'email' as const, subject: 'Subject', message: 'Full sent body', contact: 'owner@example.test', occurredAt: '2026-11-14T10:00:00.000Z', prototypeUrl: 'https://preview.example.test', followUpAt: '', notes: '' }] } };
    const merged = mergeImportedBusiness(existing, { ...business, name: 'Example Dental updated', email: '', phone: '' });
    expect(merged.id).toBe(existing.id);
    expect(merged.clientJourney?.prototype.projectReference).toBe('Saved project');
    expect(merged.clientJourney?.communications[0].message).toBe('Full sent body');
  });

  it('maps real contact activities to existing pipeline stages', () => {
    expect(communicationStage('sent')).toBe('contacted');
    expect(pipelineStageForOutreach('replied')).toBe('negotiating');
    expect(pipelineStageForOutreach('won')).toBe('won');
  });

  it('appends full communications without duplicate IDs or silent history trimming', () => {
    const event = { id: 'sent-1', kind: 'sent' as const, channel: 'email' as const, subject: 'Subject', message: 'Exact full body', contact: 'owner@example.test', occurredAt: '2026-11-14T10:00:00.000Z', prototypeUrl: 'https://preview.example.test', followUpAt: '', notes: '' };
    const history = [event];
    expect(appendCommunication(history, event)).toBe(history);
    const full = Array.from({length: 500}, (_, index) => ({ ...event, id: 'message-' + index }));
    expect(() => appendCommunication(full, event)).toThrow(/500-entry/);
    expect(full).toHaveLength(500);
    expect(full[0].message).toBe('Exact full body');
  });

  it('accepts only absolute HTTP and HTTPS prototype URLs', () => {
    expect(isSafeHttpUrl('https://preview.example.test/path')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:3000')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('//example.test')).toBe(false);
    expect(isSafeHttpUrl('https://example.test/with space')).toBe(false);
  });

  it('gives a safe outreach instruction when no prototype is available', () => {
    const prompt=buildOutreachPrompt(business);
    expect(prompt).toContain('No redesign prototype is available yet');
    expect(prompt).toContain('https://example.test');
  });

  it('updates only prototype fields while preserving communication and prompt history',()=>{
    const history={id:'e1',kind:'sent' as const,channel:'email' as const,subject:'Hello',message:'Sent',contact:'owner',occurredAt:'2026-11-14T00:00:00Z',prototypeUrl:'',followUpAt:'',notes:''};
    const journey=withPrototype({prototype:{url:'',platform:'',completedAt:'',notes:'',improvements:''},promptSnapshots:[{kind:'outreach',text:'saved prompt',generatedAt:'2026-11-14T00:00:00Z'}],communications:[history]}, {url:'https://preview.example.test',platform:'',completedAt:'',notes:'New design',improvements:'New design',projectReference:'Example-Redesign'});
    expect(journey.prototype.projectReference).toBe('Example-Redesign');
    expect(journey.communications).toEqual([history]);
    expect(journey.promptSnapshots[0].text).toBe('saved prompt');
  });
});
