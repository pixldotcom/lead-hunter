import type { BusinessRecord, ClientJourney, ProspectCommunication } from './opportunityModel';

export const emptyClientJourney = (): ClientJourney => ({
  prototype: { url: '', platform: '', completedAt: '', notes: '', improvements: '', projectReference: '', updatedAt: '' },
  promptSnapshots: [],
  communications: [],
});

/** Merge prototype edits into an existing journey without replacing prompt or communication history. */
export function withPrototype(existing: ClientJourney | undefined, prototype: ClientJourney['prototype']): ClientJourney {
  const journey = existing ?? emptyClientJourney();
  return { ...journey, prototype };
}

export function buildWebsiteContextPrompt(business: BusinessRecord, notes = business.contextNotes ?? ''): string {
  return [
    'Act as an expert website strategist, UI/UX designer, conversion specialist, and senior full-stack developer.',
    '',
    'I am preparing a modern website redesign proposal for the following business:',
    '',
    'Business: ' + (business.name || 'Not provided'),
    'Industry: ' + (business.category || 'Not provided'),
    'Original website: ' + (business.websiteUrl || 'Not provided'),
    'Available public contact details: ' + ([business.email, business.phone].filter(Boolean).join(' · ') || 'Not recorded'),
    'Location: ' + (business.location || 'Not provided'),
    'Existing website context: ' + ('No reliable page details have been collected in Lead Hunter. Research the public website yourself if browsing is available.'),
    'Additional notes: ' + (notes.trim() || 'None provided'),
    '',
    'First, research the business and its existing website using available browsing capabilities. Understand its services, audience, brand identity, and existing website structure. If useful, examine one or two relevant competitors and cite the sources you used.',
    '',
    'Then recommend a modern website strategy with strong visual hierarchy, mobile-first responsiveness, useful content structure, and clear conversion paths. Finally, create ONE comprehensive master website build prompt that I can paste into Codex, Claude, Arena.ai, or another development tool. Specify design direction, site structure, pages, sections, components, interactions, responsive behavior, content requirements, accessibility, SEO foundations, and an appropriate implementation architecture.',
    '',
    'Do not invent business facts, services, credentials, testimonials, awards, or results. Clearly mark unknowns and use placeholders for details the owner must confirm. Return the finished master website build prompt in a format ready to copy.'
  ].join('\n');
}

export function buildOutreachPrompt(business: BusinessRecord): string {
  const prototype = business.clientJourney?.prototype;
  return [
    'Act as an experienced business development specialist. Write a short, personalized, professional outreach email that introduces this independently prepared website redesign concept and encourages the business owner to view it.',
    '',
    'Business: ' + business.name,
    'Industry: ' + (business.category || 'Not recorded'),
    'Original website: ' + (business.websiteUrl || 'Not recorded'),
    'Proposed redesigned website: ' + (prototype?.url || 'Not saved yet'),
    'Project reference: ' + (prototype?.projectReference || 'Not recorded'),
    'Improvements: ' + (prototype?.improvements || prototype?.notes || 'Not recorded'),
    'Relevant notes: ' + (business.contextNotes || prototype?.notes || 'None'),
    'Available contact information: ' + ([business.email, business.phone].filter(Boolean).join(' · ') || 'Not recorded'),
    '',
    prototype?.url ? 'Sound human, confident, respectful, and helpful. Avoid criticizing the existing website. Explain that the redesign is an independently prepared concept, not an approved project. Include the prototype link naturally and suggest a compelling but non-clickbait subject line. Keep the email concise. Also provide a shorter version suitable for a website contact form. Do not invent facts or promise results.' : 'No redesign prototype is available yet. Do not imply a prototype link exists. Ask whether the business would be open to seeing a redesign concept. Keep the email concise, personalized, respectful, and factual. Do not invent facts or promise results.'
  ].join('\n');
}

export function buildFollowUpPrompt(business: BusinessRecord): string {
  const events = business.clientJourney?.communications ?? [];
  const history = events.map((event, index) => [
    'MESSAGE / ACTIVITY ' + (index + 1),
    'Date: ' + event.occurredAt,
    'Type: ' + event.kind,
    'Channel: ' + event.channel,
    'Contact: ' + (event.contact || 'Not recorded'),
    'Subject: ' + (event.subject || 'Not applicable'),
    'Exact message or reply:',
    event.message || '(No message body recorded)',
    'Notes: ' + (event.notes || 'None'),
    'Next follow-up: ' + (event.followUpAt || 'Not scheduled'),
  ].join('\n')).join('\n\n');
  return [
    'Act as a thoughtful business development specialist. Draft an appropriate follow-up for manual review. Do not send it.',
    '',
    'Business: ' + business.name,
    'Industry: ' + (business.category || 'Not recorded'),
    'Original website: ' + (business.websiteUrl || 'Not recorded'),
    'Prototype URL: ' + (business.clientJourney?.prototype.url || 'Not recorded'),
    'Current pipeline status: ' + (business.pipelineStage || 'Not recorded'),
    'Business notes: ' + (business.contextNotes || 'None'),
    '',
    'Complete communication history, in order:',
    history || 'No communication has been recorded.',
    '',
    'Use the full message and reply bodies above to preserve context. Do not invent what was said or imply that a message was sent unless it is recorded. Return a concise draft for me to review and send manually.'
  ].join('\n');
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname && !parsed.username && !parsed.password && value.length <= 2048 && !/\s/.test(value);
  } catch {
    return false;
  }
}

export function communicationStage(kind: ProspectCommunication['kind']): 'contacted' | 'replied' | 'meeting' | 'won' | 'closed' | undefined {
  if (kind === 'sent') return 'contacted';
  if (kind === 'reply' || kind === 'interested') return 'replied';
  if (kind === 'meeting') return 'meeting';
  if (kind === 'won') return 'won';
  if (kind === 'lost') return 'closed';
  return undefined;
}

export function appendCommunication(history: ProspectCommunication[], entry: ProspectCommunication): ProspectCommunication[] {
  if (history.some(item => item.id === entry.id)) return history;
  if (history.length >= 500) throw new Error('This prospect has reached the 500-entry communication limit. Existing history was preserved; no entries were removed.');
  return [...history, entry];
}
