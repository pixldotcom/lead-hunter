import type { QualifiedProspect } from './prospectQualification';
import { SERVICE_LABELS } from './opportunityModel';

export type OutreachChannel = 'email' | 'phone' | 'contact_form';
export type OutreachKit = {
  eligible: boolean;
  channel: OutreachChannel;
  subject: string;
  message: string;
  sourceUrls: string[];
  checks: string[];
};

/** Produces an editable, human-reviewed draft. Never sends or queues messages. */
export function prepareOutreach(prospect: QualifiedProspect, channel: OutreachChannel): OutreachKit {
  const {business,analysis} = prospect;
  const checks: string[] = [];
  if (prospect.tier !== 'ready') checks.push('Complete qualification and verify the business before outreach.');
  if (!business.sourceUrl) checks.push('Verify the business identity against a public source.');
  if (channel === 'email' && !business.email) checks.push('Find and verify a business email address.');
  if (channel === 'phone' && !business.phone) checks.push('Find and verify a public business phone number.');
  if (channel === 'contact_form' && !business.websiteUrl) checks.push('Verify that the official website has a contact form.');
  const finding = analysis?.evidence.find(item => item.confidence === 'confirmed' && !!item.sourceUrl && (!prospect.recommendedService || item.service === prospect.recommendedService));
  const fact = analysis?.researchNotes?.facts.find(item => /^https?:\/\//i.test(item.sourceUrl));
  const source = finding?.sourceUrl || fact?.sourceUrl;
  if (!source) checks.push('Verify at least one specific, source-linked opportunity before personalizing the message.');
  const service = prospect.recommendedService ? SERVICE_LABELS[prospect.recommendedService] : 'digital presence';
  const sourceUrls = [...new Set([business.sourceUrl,source].filter((url):url is string=>!!url))];
  // A research import is not independently verified. Do not assert the claim as a proven problem.
  const observation = finding
    ? `While reviewing your public website, I noticed an area worth checking: ${finding.signal.toLowerCase()}. I would be happy to share what I found and confirm whether it affects visitors.`
    : fact
      ? 'I reviewed some public information about your business and identified an area that may be worth exploring further.'
      : 'I came across your business while researching local businesses in your category.';
  const subject = `A quick idea for ${business.name}`;
  const message = channel === 'phone'
    ? `CALL PREPARATION — ${business.name}\n\nIntroduce yourself and ask whether this is a convenient time.\n\n${observation}\n\nI work with businesses on ${service}. Would you be open to a short conversation about whether this could be useful?\n\nIf not interested, thank them and do not follow up without permission.`
    : `Hello ${business.name} team,\n\n${observation}\n\nI help businesses with ${service}. If this is relevant to your priorities, I'd be glad to share a short, practical suggestion—no obligation.\n\nWould you be open to a brief conversation?\n\nBest regards,\n[Your name]\n[Your agency]\n\nIf you prefer not to receive further messages, please let me know.`;
  return {eligible:checks.length===0,channel,subject,message,sourceUrls,checks};
}
