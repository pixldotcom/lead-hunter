import type { BusinessRecord, OpportunityAnalysis, PipelineStage } from './opportunityModel';
import type { OutreachActivity, OutreachStage } from './outreachTracking';

export { PIPELINE_STAGES } from './opportunityModel';
export type { PipelineStage } from './opportunityModel';

export function workspaceViewForPage(page: string): 'opportunities' | 'pipeline' | 'followups' {
  if (page === 'Pipeline') return 'pipeline';
  if (page === 'Follow-ups') return 'followups';
  return 'opportunities';
}

export function businessPipelineStage(business: BusinessRecord, analysis?: OpportunityAnalysis, activity?: OutreachActivity): PipelineStage {
  if (business.pipelineStage) return business.pipelineStage;
  if (activity?.stage === 'won') return 'won';
  if (activity?.stage === 'closed') return 'lost';
  if (activity?.stage === 'meeting' || activity?.stage === 'replied') return 'negotiating';
  if (activity?.stage === 'contacted') return 'contacted';
  if (analysis?.researchNotes && analysis.evidence.length) return 'ready_to_pitch';
  if (analysis?.researchNotes || analysis) return 'qualified';
  return 'new';
}

export type FollowUpGroups = { overdue: OutreachActivity[]; today: OutreachActivity[]; upcoming: OutreachActivity[]; completed: OutreachActivity[]; unscheduled: OutreachActivity[] };

export function groupFollowUps(activities: OutreachActivity[], today: string): FollowUpGroups {
  const groups: FollowUpGroups = { overdue: [], today: [], upcoming: [], completed: [], unscheduled: [] };
  for (const activity of activities) {
    if (activity.stage === 'won' || activity.stage === 'closed') groups.completed.push(activity);
    else if (!activity.nextFollowUpAt) groups.unscheduled.push(activity);
    else {
      const due = activity.nextFollowUpAt.slice(0, 10);
      if (due < today) groups.overdue.push(activity);
      else if (due === today) groups.today.push(activity);
      else groups.upcoming.push(activity);
    }
  }
  for (const group of Object.values(groups)) group.sort((a, b) => a.nextFollowUpAt.localeCompare(b.nextFollowUpAt));
  return groups;
}

/** Exact host + path match avoids linking separate sites on shared hosting. */
export function officialSiteKey(raw: string): string {
  if (!raw.trim()) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch { return ''; }
}

export function updateBusinessStage(businesses: BusinessRecord[], businessId: string, stage: PipelineStage, updatedAt = new Date().toISOString()): BusinessRecord[] {
  if (!businesses.some(business => business.id === businessId)) throw Error('This business is no longer in the workspace. Refresh and try again.');
  return businesses.map(business => business.id === businessId ? { ...business, pipelineStage: stage, updatedAt } : business);
}

export function pipelineStageForOutreach(stage: OutreachStage): PipelineStage | undefined {
  if (stage === 'contacted') return 'contacted';
  if (stage === 'replied' || stage === 'meeting') return 'negotiating';
  if (stage === 'won') return 'won';
  if (stage === 'closed') return 'lost';
  return undefined;
}
