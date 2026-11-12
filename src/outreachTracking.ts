import type { BusinessRecord } from './opportunityModel';
import type { OutreachChannel } from './outreachPreparation';

export type OutreachStage = 'drafted' | 'contacted' | 'replied' | 'meeting' | 'won' | 'closed';
export const OUTREACH_STAGES: OutreachStage[] = ['drafted','contacted','replied','meeting','won','closed'];
export type OutreachActivity = {
  businessId: string;
  stage: OutreachStage;
  channel: OutreachChannel;
  lastContactAt: string;
  nextFollowUpAt: string;
  note: string;
  updatedAt: string;
};
const validDate = (s: string) => !s || (Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s);
export function validateOutreachActivities(raw: unknown, businesses: BusinessRecord[]): OutreachActivity[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 10000) throw Error('Invalid outreach activity collection.');
  const ids = new Set(businesses.map(b => b.id));
  const seen = new Set<string>();
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid outreach activity.');
    const v = value as OutreachActivity;
    if (typeof v.businessId !== 'string' || !ids.has(v.businessId) || seen.has(v.businessId) ||
      !OUTREACH_STAGES.includes(v.stage) || !['email','phone','contact_form'].includes(v.channel) ||
      typeof v.lastContactAt !== 'string' || !validDate(v.lastContactAt) ||
      typeof v.nextFollowUpAt !== 'string' || !validDate(v.nextFollowUpAt) ||
      typeof v.updatedAt !== 'string' || !v.updatedAt || !validDate(v.updatedAt) ||
      typeof v.note !== 'string' || v.note.length > 2000) throw Error('Invalid outreach activity fields.');
    seen.add(v.businessId);
    return v;
  });
}
export function followUpStatus(activity: OutreachActivity, now = new Date()): 'overdue' | 'upcoming' | 'none' {
  if (!activity.nextFollowUpAt || ['won','closed'].includes(activity.stage)) return 'none';
  return Date.parse(activity.nextFollowUpAt) < now.getTime() ? 'overdue' : 'upcoming';
}
export function upsertOutreachActivity(current: OutreachActivity[], value: OutreachActivity): OutreachActivity[] {
  return [...current.filter(a => a.businessId !== value.businessId), value];
}
