import type { BusinessRecord, OpportunityAnalysis, ClientJourney, ProspectCommunication } from './opportunityModel';

export const emptyClientJourney = (): ClientJourney => ({
  prototype: { url: '', platform: '', completedAt: '', notes: '', improvements: '' },
  promptSnapshots: [],
  communications: [],
});
const isoNow = () => new Date().toISOString();

export function buildWebsiteRebuildPrompt(business: BusinessRecord, analysis?: OpportunityAnalysis): string {
  const evidence=(analysis?.evidence??[]).map(item=>`- [${item.confidence}] ${item.signal}: ${item.description} (source: ${item.sourceUrl||'not recorded'})`).join('\n')||'No analyzer evidence is stored.';
  const research=analysis?.researchNotes?`Imported external research (not independently verified):\n${analysis.researchNotes.summary}\n${analysis.researchNotes.facts.map(f=>`- ${f.claim} — ${f.sourceUrl||'source missing'}`).join('\n')}`:'No external research is stored.';
  return `You are preparing a website improvement concept for a real prospect. Use the supplied facts carefully.

BUSINESS
Name: ${business.name}
Category: ${business.category||'Not recorded'}
Location: ${business.location||'Not recorded'}
Official website: ${business.websiteUrl||'None recorded'}
Saved website status: ${business.websiteStatus}
Website audit score: ${analysis?`${analysis.totalScore}/100 (internal opportunity score, not a Lighthouse score)`:'Not analyzed'}

OBSERVED WEBSITE AUDIT EVIDENCE
${evidence}

EXTERNAL RESEARCH
${research}

TASK
1. Separate verified facts, analyzer observations, and assumptions.
2. Identify website usability, accessibility, content, trust, mobile, and conversion improvements supported by evidence. Say "not assessed" where evidence is absent.
3. Suggest a site structure and visual direction without inventing credentials, services, addresses, reviews, or performance measurements.
4. Produce a complete implementation prompt for an external website-building tool, including responsive behavior, accessible interactions, content requirements, and evidence-backed improvements.
5. Use placeholders for unknown details and list what the owner must confirm. Do not claim the concept is approved or deployed.

Do not invent Lighthouse, Core Web Vitals, analytics, customer, licensing, or competitor facts. Do not infer private data.`;
}

export function buildOutreachPrompt(business: BusinessRecord, analysis?: OpportunityAnalysis): string {
  const evidence=(analysis?.evidence??[]).map(e=>`- ${e.signal}: ${e.description} (${e.confidence})`).join('\n')||'No audit evidence saved.';
  const prototype=business.clientJourney?.prototype;
  return `Draft a concise, respectful first-contact message for manual review. Do not send it.

Business: ${business.name} (${business.category||'category not recorded'}, ${business.location||'location not recorded'})
Official website: ${business.websiteUrl||'not recorded'}
Website audit observations:
${evidence}
Prototype concept: ${prototype?.url||'none saved'}
Notes: ${prototype?.notes||'none'}

State that any prototype is an unsolicited concept, not an approved or live replacement. Refer only to observations above. Do not invent contact names, results, performance metrics, customer feedback, or business facts. Keep it easy to personalize and respectful.`;
}
export function buildFollowUpPrompt(business: BusinessRecord): string {
  const events=business.clientJourney?.communications??[];
  return `Prepare a brief follow-up draft for manual review; do not send it.

Business: ${business.name}
Website: ${business.websiteUrl||'not recorded'}
Prototype: ${business.clientJourney?.prototype.url||'not recorded'}
Prior communication history (newest last):
${events.map(e=>`- ${e.occurredAt}: ${e.kind} by ${e.channel}; subject: ${e.subject||'(none)'}; notes: ${e.notes||'(none)'}`).join('\n')||'No communication recorded.'}

Acknowledge only saved history. Do not imply a message was sent unless it appears above. Keep it polite and concise. Do not send anything.`;
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function buildEvidenceReportHtml(business: BusinessRecord, analysis?: OpportunityAnalysis): string {
 const rows=(analysis?.evidence??[]).map(e=>'<tr><td>'+escapeHtml(e.signal)+'</td><td>'+escapeHtml(e.description)+'</td><td>'+escapeHtml(e.confidence)+'</td><td>'+(e.sourceUrl?'<a href="'+escapeHtml(e.sourceUrl)+'">'+escapeHtml(e.sourceUrl)+'</a>':'Not recorded')+'</td></tr>').join('');
 const site=business.websiteUrl?'<a href="'+escapeHtml(business.websiteUrl)+'">'+escapeHtml(business.websiteUrl)+'</a>':'No website recorded';
 const score=analysis?'<div class="score">Internal opportunity score: <strong>'+analysis.totalScore+'/100</strong><br><small>This is not a Lighthouse or Core Web Vitals measurement. Reputation score: '+analysis.reputationScore+'/100. Evidence confidence: '+analysis.evidenceConfidence+'%.</small></div>':'<p>No website analysis is saved.</p>';
 const evidence=rows?'<table><thead><tr><th>Signal</th><th>Observation</th><th>Confidence</th><th>Source</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p>No evidence was recorded. This report does not infer website problems.</p>';
 const external=analysis?.researchNotes?'<p>'+escapeHtml(analysis.researchNotes.summary)+'</p><p class="muted">External research is user-imported and has not been independently verified.</p>':'<p>No external research is saved.</p>';
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Website review — '+escapeHtml(business.name)+'</title><style>body{font:15px/1.55 Arial,sans-serif;color:#172033;max-width:900px;margin:40px auto;padding:0 24px}h1,h2{color:#243dbe}header{border-bottom:3px solid #3757f5;padding-bottom:18px}small,.muted{color:#596579}.score{background:#eef0ff;padding:16px;border-radius:10px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #dce0e8;overflow-wrap:anywhere}footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd}@media print{body{margin:0;max-width:none}}</style></head><body><header><small>PIXLDOT · WEBSITE REVIEW</small><h1>'+escapeHtml(business.name)+'</h1><div>'+escapeHtml([business.category,business.location].filter(Boolean).join(' · ')||'Business details not recorded')+'</div><div>'+site+'</div></header><h2>Review summary</h2><p>Website status: <strong>'+escapeHtml(business.websiteStatus.replaceAll('_',' '))+'</strong></p>'+score+'<h2>Recorded audit evidence</h2>'+evidence+'<h2>External research</h2>'+external+'<footer><small>Generated from saved Lead Hunter records on '+new Date().toLocaleDateString()+'. Missing data is not assessed.</small></footer><script>window.addEventListener("load",()=>window.print())</script></body></html>';
}
export function makeCommunication(kind: ProspectCommunication['kind'], channel: ProspectCommunication['channel'], fields: Omit<ProspectCommunication,'id'|'kind'|'channel'|'occurredAt'>): ProspectCommunication {
 return {id:crypto.randomUUID(),kind,channel,occurredAt:isoNow(),...fields};
}