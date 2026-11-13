import type { BusinessRecord } from './opportunityModel';
import type { OutreachChannel } from './outreachPreparation';

export type OutreachStage = 'drafted' | 'contacted' | 'replied' | 'meeting' | 'won' | 'closed';
export const OUTREACH_STAGES: OutreachStage[] = ['drafted','contacted','replied','meeting','won','closed'];
export type OutreachEvent = {id:string;kind:'contact'|'stage'|'scheduled';occurredAt:string;stage:OutreachStage;channel:OutreachChannel;lastContactAt:string;nextFollowUpAt:string;note:string};
export type OutreachActivity = {
  businessId: string;
  stage: OutreachStage;
  channel: OutreachChannel;
  lastContactAt: string;
  nextFollowUpAt: string;
  note: string;
  updatedAt: string;
  /** Append-only snapshots keep contact and scheduling history on the existing business activity record. */
  history?: OutreachEvent[];
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
      typeof v.note !== 'string' || v.note.length > 2000 || (v.history !== undefined && (!Array.isArray(v.history) || v.history.length > 200 || v.history.some(event=>!event||typeof event.id!=='string'||!event.id||!['contact','stage','scheduled'].includes(event.kind)||!validDate(event.occurredAt)||!OUTREACH_STAGES.includes(event.stage)||!['email','phone','contact_form'].includes(event.channel)||typeof event.lastContactAt!=='string'||!validDate(event.lastContactAt)||typeof event.nextFollowUpAt!=='string'||!validDate(event.nextFollowUpAt)||typeof event.note!=='string'||event.note.length>2000)))) throw Error('Invalid outreach activity fields.');
    seen.add(v.businessId);
    return v;
  });
}
export function followUpStatus(activity: OutreachActivity, now = new Date()): 'overdue' | 'upcoming' | 'none' {
  if (!activity.nextFollowUpAt || ['won','closed'].includes(activity.stage)) return 'none';
  return Date.parse(activity.nextFollowUpAt) < now.getTime() ? 'overdue' : 'upcoming';
}
export function upsertOutreachActivity(current: OutreachActivity[], value: OutreachActivity): OutreachActivity[] {
  const previous=current.find(activity=>activity.businessId===value.businessId);
  const history=[...(previous?.history??value.history??[])];
  const changed=!previous||previous.stage!==value.stage||previous.channel!==value.channel||previous.lastContactAt!==value.lastContactAt||previous.nextFollowUpAt!==value.nextFollowUpAt||previous.note!==value.note;
  if(changed){
    const kind:OutreachEvent['kind']=!previous?'scheduled':value.lastContactAt!==previous.lastContactAt&&!!value.lastContactAt?'contact':value.stage!==previous.stage?'stage':'scheduled';
    history.push({id:crypto.randomUUID(),kind,occurredAt:value.updatedAt,stage:value.stage,channel:value.channel,lastContactAt:value.lastContactAt,nextFollowUpAt:value.nextFollowUpAt,note:value.note});
  }
  return [...current.filter(activity=>activity.businessId!==value.businessId),{...value,history:history.slice(-200)}];
}
