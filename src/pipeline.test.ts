import {describe,expect,it} from 'vitest';
import {emptyCloud,validateCloud} from './cloudModel';
import {createBusinessRecord} from './opportunityPersistence';
import {businessPipelineStage,groupFollowUps,updateBusinessStage,workspaceViewForPage,pipelineStageForOutreach,pipelineStageForPrototype} from './pipeline';
import type {OutreachActivity} from './outreachTracking';

const business=()=>createBusinessRecord({name:'Ludhi Dental',location:'Ludhiana',websiteUrl:'https://ludhi-dental.example'});
const activity=(businessId:string,stage:OutreachActivity['stage'],nextFollowUpAt:string):OutreachActivity=>({businessId,stage,channel:'email',lastContactAt:'2026-11-12T12:00:00.000Z',nextFollowUpAt,note:'Call about the proposal',updatedAt:'2026-11-12T12:00:00.000Z'});

describe('distinct prospect workspaces',()=>{
  it('routes the three navigation destinations to separate views',()=>{
    expect(workspaceViewForPage('Business Opportunities')).toBe('opportunities');
    expect(workspaceViewForPage('Pipeline')).toBe('pipeline');
    expect(workspaceViewForPage('Follow-ups')).toBe('followups');
  });

  it('derives useful stages for legacy records without rewriting them',()=>{
    const record=business();
    expect(businessPipelineStage(record)).toBe('new');
    expect(businessPipelineStage(record,{businessId:record.id,websiteStatus:'unknown',opportunities:[],evidence:[],totalScore:0,reputationScore:0,evidenceConfidence:0,analyzedAt:'2026-11-12T12:00:00.000Z',researchPrompt:'',researchNotes:null})).toBe('qualified');
    expect(businessPipelineStage(record,undefined,activity(record.id,'contacted','2026-11-14T12:00:00.000Z'))).toBe('contacted');
    expect(record.pipelineStage).toBeUndefined();
  });

  it('saves a stage on the existing business and preserves analyses, outreach and identity',()=>{
    const saved=business(),cloud=emptyCloud();cloud.discovery.businesses=[saved];cloud.discovery.outreachActivities=[activity(saved.id,'drafted','2026-11-14T12:00:00.000Z')];
    const next=validateCloud({...cloud,discovery:{...cloud.discovery,businesses:updateBusinessStage(cloud.discovery.businesses??[],saved.id,'ready_to_pitch','2026-11-13T12:00:00.000Z')}});
    expect(next.discovery.businesses?.[0]).toMatchObject({id:saved.id,name:saved.name,pipelineStage:'ready_to_pitch'});
    expect(next.discovery.outreachActivities).toEqual(cloud.discovery.outreachActivities);
  });

  it('rejects invalid persisted pipeline stages',()=>{
    const record={...business(),pipelineStage:'maybe' as never};
    expect(()=>validateCloud({...emptyCloud(),discovery:{...emptyCloud().discovery,businesses:[record]}})).toThrow('Invalid pipeline stage');
  });

  it('keeps outreach milestones aligned with the shared pipeline stage',()=>{
    expect(pipelineStageForOutreach('contacted')).toBe('contacted');
    expect(pipelineStageForOutreach('replied')).toBe('negotiating');
    expect(pipelineStageForOutreach('meeting')).toBe('negotiating');
    expect(pipelineStageForOutreach('won')).toBe('won');
    expect(pipelineStageForOutreach('closed')).toBe('lost');
    expect(pipelineStageForOutreach('drafted')).toBeUndefined();
  });

  it('promotes a prototype only from early stages and preserves advanced stages',()=>{
    expect(pipelineStageForPrototype('new',true)).toBe('ready_to_pitch');
    expect(pipelineStageForPrototype('qualified',true)).toBe('ready_to_pitch');
    for(const stage of ['ready_to_pitch','contacted','negotiating','won','lost'] as const) expect(pipelineStageForPrototype(stage,true)).toBeUndefined();
    expect(pipelineStageForPrototype('new',false)).toBeUndefined();
  });

  it('groups due today, overdue, upcoming and completed activity without changing source records',()=>{
    const record=business(),items=[activity(record.id,'contacted','2026-11-12T12:00:00.000Z'),{...activity(record.id,'contacted','2026-11-13T12:00:00.000Z'),businessId:'today'},{...activity(record.id,'contacted','2026-11-15T12:00:00.000Z'),businessId:'upcoming'},{...activity(record.id,'won',''),businessId:'won'},{...activity(record.id,'drafted',''),businessId:'unscheduled'}];
    const groups=groupFollowUps(items,'2026-11-13');
    expect(groups.overdue.map(item=>item.businessId)).toEqual([record.id]);
    expect(groups.today.map(item=>item.businessId)).toEqual(['today']);
    expect(groups.upcoming.map(item=>item.businessId)).toEqual(['upcoming']);
    expect(groups.completed.map(item=>item.businessId)).toEqual(['won']);
    expect(groups.unscheduled.map(item=>item.businessId)).toEqual(['unscheduled']);
    expect(items).toHaveLength(5);
  });
});
