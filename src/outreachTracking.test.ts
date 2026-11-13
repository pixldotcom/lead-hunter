import {describe,expect,it} from 'vitest';
import {createBusinessRecord} from './opportunityPersistence';
import {followUpStatus,upsertOutreachActivity,validateOutreachActivities,type OutreachActivity} from './outreachTracking';

const business=createBusinessRecord({name:'Example',location:'Ludhiana'});
const activity:OutreachActivity={businessId:business.id,stage:'contacted',channel:'email',lastContactAt:'2026-11-10T12:00:00.000Z',nextFollowUpAt:'2026-11-12T12:00:00.000Z',note:'Awaiting reply',updatedAt:'2026-11-10T12:00:00.000Z'};
describe('outreach activity tracking',()=>{
 it('validates saved outreach activity and preserves it',()=>expect(validateOutreachActivities([activity],[business])).toEqual([activity]));
 it('accepts legacy discovery records with no outreach history',()=>expect(validateOutreachActivities(undefined,[business])).toEqual([]));
 it('rejects orphan and duplicate records',()=>{
  expect(()=>validateOutreachActivities([{...activity,businessId:'missing'}],[business])).toThrow();
  expect(()=>validateOutreachActivities([activity,activity],[business])).toThrow();
 });
 it('upserts activity without duplicating a business and appends contact history',()=>{
  const first=upsertOutreachActivity([],{...activity,stage:'drafted',lastContactAt:''});
  const next=upsertOutreachActivity(first,{...activity,stage:'contacted'});
  expect(next).toHaveLength(1);
  expect(next[0].history).toHaveLength(2);
  expect(next[0].history?.map(event=>event.kind)).toEqual(['scheduled','contact']);
  expect(validateOutreachActivities(next,[business])).toEqual(next);
 });
 it('validates bounded history embedded in the canonical activity record',()=>{
  const valid={...activity,history:[{id:'event-1',kind:'contact' as const,occurredAt:activity.updatedAt,stage:activity.stage,channel:activity.channel,lastContactAt:activity.lastContactAt,nextFollowUpAt:activity.nextFollowUpAt,note:activity.note}]};
  expect(validateOutreachActivities([valid],[business])).toEqual([valid]);
  expect(()=>validateOutreachActivities([{...activity,history:Array.from({length:201},(_,i)=>({...valid.history[0],id:`event-${i}`}))}],[business])).toThrow();
 });
 it('flags overdue follow-ups, but not closed or won prospects',()=>{
  const now=new Date('2026-11-13T12:00:00.000Z');
  expect(followUpStatus(activity,now)).toBe('overdue');
  expect(followUpStatus({...activity,stage:'closed'},now)).toBe('none');
  expect(followUpStatus({...activity,nextFollowUpAt:'2026-11-15T12:00:00.000Z'},now)).toBe('upcoming');
 });
});
