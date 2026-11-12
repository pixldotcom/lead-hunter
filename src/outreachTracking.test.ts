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
 it('upserts activity without duplicating a business',()=>expect(upsertOutreachActivity([activity],{...activity,stage:'replied'})).toEqual([{...activity,stage:'replied'}]));
 it('flags overdue follow-ups, but not closed or won prospects',()=>{
  const now=new Date('2026-11-13T12:00:00.000Z');
  expect(followUpStatus(activity,now)).toBe('overdue');
  expect(followUpStatus({...activity,stage:'closed'},now)).toBe('none');
  expect(followUpStatus({...activity,nextFollowUpAt:'2026-11-15T12:00:00.000Z'},now)).toBe('upcoming');
 });
});
