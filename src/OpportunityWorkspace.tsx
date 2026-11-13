import {buildAgentResearchPrompt,type AgentResearchMode} from './agentResearch';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloud } from './CloudWorkspace';
import { uid } from './domain';
import { requestAudit } from './analyzerApi';
import { readEvidence } from './discovery';
import { detectOpportunities, prioritizedOpportunities } from './opportunityDetection';
import { createBusinessRecord, parseBusinessCsv, parseImportedResearch, sameBusiness } from './opportunityPersistence';
import type { BusinessRecord, OpportunityEvidence, ServiceArea, WebsiteStatus } from './opportunityModel';
import { searchOpenStreetMap, type OSMBusiness } from './openStreetMap';
import { buildQualifiedShortlist, buildProspectBrief, type QualificationTier } from './prospectQualification';
import { prepareOutreach, type OutreachChannel } from './outreachPreparation';
import { OUTREACH_STAGES, followUpStatus, upsertOutreachActivity, type OutreachActivity, type OutreachStage } from './outreachTracking';

const statusLabels: Record<WebsiteStatus, string> = {
  no_website_found: 'No website found',
  outdated: 'Outdated website',
  needs_improvement: 'Needs improvement',
  healthy: 'Healthy',
  unknown: 'Not assessed',
};
const serviceForFinding = (finding: { category: string; title: string; explanation: string }): ServiceArea => {
  const text = `${finding.category} ${finding.title} ${finding.explanation}`.toLowerCase();
  if (/performance|speed|lcp|cls|render|load time|image/.test(text)) return 'performance';
  if (/local seo|google business|map pack|nap|business profile|citation/.test(text)) return 'local_seo';
  if (/seo|canonical|robots|sitemap|meta|structured data|heading/.test(text)) return 'seo';
  if (/conversion|marketing|call.to.action|lead form|tracking|analytics/.test(text)) return 'marketing';
  return 'website';
};

export function OpportunityWorkspace({initialView = 'home'}: {initialView?: 'home'|'prospects'|'followups'}) {
  const cloud = useCloud();
  const data = cloud.snapshot.data.discovery;
  const businesses = data.businesses ?? [];
  const analyses = data.opportunityAnalyses ?? [];
  const outreachActivities = data.outreachActivities ?? [];
  const [name, Name] = useState('');
  const [category, Category] = useState('');
  const [location, Location] = useState('');
  const [websiteUrl, Website] = useState('');
  const [websiteStatus, WebsiteStatusInput] = useState<WebsiteStatus>('unknown');
  const [rating, Rating] = useState('');
  const [reviewCount, Reviews] = useState('');
  const [phone, Phone] = useState('');
  const [sourceUrl, Source] = useState('');
  const [mobileView, MobileView] = useState<'home'|'discover'|'prospects'|'followups'>(initialView);
  const [showImport, ShowImport] = useState(false);
  const [filter, Filter] = useState('all');
  const [qualificationFilter, QualificationFilter] = useState<QualificationTier | 'all'>('all');
  const [outreachBusinessId, OutreachBusiness] = useState('');
  const [outreachChannel, OutreachChannelInput] = useState<OutreachChannel>('email');
  const [outreachDraft, OutreachDraft] = useState('');
  const [outreachApproved, OutreachApproved] = useState(false);
  const [activityBusinessId, ActivityBusiness] = useState('');
  const [activityStage, ActivityStage] = useState<OutreachStage>('drafted');
  const [activityChannel, ActivityChannel] = useState<OutreachChannel>('email');
  const [activityLastContact, ActivityLastContact] = useState('');
  const [activityNextFollowUp, ActivityNextFollowUp] = useState('');
  const [activityNote, ActivityNote] = useState('');
  const [busy, Busy] = useState(false);
  const [notice, Notice] = useState('');
  const [error, ErrorMessage] = useState('');
  const [researchBusinessId, ResearchBusiness] = useState('');
  const [researchJson, ResearchJson] = useState('');
  const [agentResearchMode, AgentResearchModeInput] = useState<AgentResearchMode>('investigate');
  const [osmResults, OSMResults] = useState<OSMBusiness[]>([]);
  const [selectedOSM, SelectedOSM] = useState<string[]>([]);
  const [discoveryView, DiscoveryView] = useState<'priority'|'all'|'listed'>('priority');
  const [verifiedWebsites, VerifiedWebsites] = useState<Record<string,string>>({});
  const [autoAnalyzeOSM, AutoAnalyzeOSM] = useState(true);
  const [discoveryProgress, DiscoveryProgress] = useState('');
  const [queueProgress, QueueProgress] = useState<{done:number;total:number;failed:number;current:string}|null>(null);
  const [queueFailures, QueueFailures] = useState<Record<string,string>>({});

  const file = useRef<HTMLInputElement>(null);
  const cancelBatch = useRef(false);
  const working = useRef({ businesses, analyses });
  useEffect(() => { working.current = { businesses, analyses }; }, [data]);

  const persist = async (nextBusinesses: BusinessRecord[], nextAnalyses = working.current.analyses) => {
    const next = { ...cloud.snapshot.data.discovery, businesses: nextBusinesses, opportunityAnalyses: nextAnalyses };
    if (!await cloud.change('discovery', next)) throw new Error('Could not save the opportunity workspace to cloud. Your previous records are unchanged.');
    working.current = { businesses: nextBusinesses, analyses: nextAnalyses };
  };

  const addBusiness = async (row: Parameters<typeof createBusinessRecord>[0]) => {
    const record = createBusinessRecord(row);
    const currentBusinesses = working.current.businesses;
    const currentAnalyses = working.current.analyses;
    const existing = currentBusinesses.find(item => sameBusiness(item, record));
    if (existing) {
      const merged = currentBusinesses.map(item => item.id === existing.id ? {
        ...item,
        category: item.category || record.category,
        websiteUrl: item.websiteUrl || record.websiteUrl,
        websiteStatus: item.websiteStatus === 'unknown' ? record.websiteStatus : item.websiteStatus,
        rating: item.rating ?? record.rating,
        reviewCount: item.reviewCount ?? record.reviewCount,
        phone: item.phone || record.phone,
        email: item.email || record.email,
        profiles: [...new Set([...item.profiles, ...record.profiles])],
        sourceUrl: item.sourceUrl || record.sourceUrl,
        discoverySource: item.discoverySource || record.discoverySource,
        updatedAt: new Date().toISOString(),
      } : item);
      await persist(merged, currentAnalyses.filter(a => a.businessId !== existing.id));
      return false;
    }
    await persist([record, ...currentBusinesses]);
    return true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    ErrorMessage(''); Notice('');
    try {
      if (!name.trim()) throw new Error('Business name is required.');
      await addBusiness({
        name, category, location, websiteUrl, websiteStatus,
        rating: rating.trim() ? Number(rating) : null,
        reviewCount: reviewCount.trim() ? Number(reviewCount) : null,
        phone, sourceUrl, discoverySource: 'Manual entry',
      });
      Notice('Business saved. You can analyze its available evidence or add more prospects.');
      Name(''); Website(''); Rating(''); Reviews(''); Phone(''); Source('');
    } catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Could not save business.'); }
  };

  const importFile = async (fileValue?: File) => {
    if (!fileValue) return;
    ErrorMessage(''); Notice('');
    try {
      if (fileValue.size > 100_000) throw new Error('CSV exceeds the 100 KB import limit.');
      const rows = parseBusinessCsv(await fileValue.text());
      let nextBusinesses = [...working.current.businesses];
      let nextAnalyses = [...working.current.analyses];
      let added = 0;
      for (const row of rows) {
        const record = createBusinessRecord(row);
        const existing = nextBusinesses.find(item => sameBusiness(item, record));
        if (!existing) { nextBusinesses = [record, ...nextBusinesses]; added++; continue; }
        nextBusinesses = nextBusinesses.map(item => item.id === existing.id ? { ...item, category: item.category || record.category, websiteUrl: item.websiteUrl || record.websiteUrl, websiteStatus: item.websiteStatus === 'unknown' ? record.websiteStatus : item.websiteStatus, rating: item.rating ?? record.rating, reviewCount: item.reviewCount ?? record.reviewCount, phone: item.phone || record.phone, email: item.email || record.email, profiles: [...new Set([...item.profiles, ...record.profiles])], sourceUrl: item.sourceUrl || record.sourceUrl, discoverySource: item.discoverySource || record.discoverySource, updatedAt: new Date().toISOString() } : item);
        nextAnalyses = nextAnalyses.filter(item => item.businessId !== existing.id);
      }
      await persist(nextBusinesses, nextAnalyses);
      Notice(`${added} new businesses added; ${rows.length - added} matched existing records and were merged.`);
    } catch (e) { ErrorMessage(e instanceof Error ? e.message : 'CSV import failed.'); }
  };

  const analyze = async (business: BusinessRecord) => {
    let current = working.current.businesses.find(item => item.id === business.id) ?? business;
    const evidence: OpportunityEvidence[] = [];
    if (business.websiteUrl) {
      try {
        const scan = readEvidence(await requestAudit(business.websiteUrl));
        for (const finding of scan.findings) {
          evidence.push({
            id: uid(),
            service: serviceForFinding(finding),
            signal: finding.title,
            description: finding.evidence || finding.explanation,
            sourceUrl: finding.pageUrl || scan.website,
            observedAt: finding.timestamp || scan.analyzedAt,
            confidence: finding.confidence === 'confirmed' ? 'confirmed' : finding.confidence === 'likely' ? 'likely' : 'unknown',
          });
        }
        const confirmed = scan.findings.filter(f => f.confidence === 'confirmed' && f.severity !== 'info');
        if (current.websiteStatus === 'unknown' && (confirmed.some(f => f.severity === 'high') || confirmed.length >= 2)) {
          current = { ...current, websiteStatus: 'needs_improvement', updatedAt: new Date().toISOString() };
        }
      } catch (e) {
        throw new Error(`Website scan failed for ${business.name}: ${e instanceof Error ? e.message : 'scan failed'}. No new analysis was saved; retry later or verify the website URL.`);
      }
    }
    const analysis = detectOpportunities(current, evidence);
    const nextBusinesses = working.current.businesses.map(item => item.id === current.id ? current : item);
    const previous = working.current.analyses.find(item => item.businessId === current.id);
    if (previous?.researchNotes) analysis.researchNotes = previous.researchNotes;
    const nextAnalyses = [...working.current.analyses.filter(item => item.businessId !== current.id), analysis];
    await persist(nextBusinesses, nextAnalyses);
    return analysis;
  };

  const analyzeOne = async (business: BusinessRecord) => {
    if (busy) return;
    Busy(true); ErrorMessage(''); Notice(`Analyzing ${business.name}…`);
    try { await analyze(business); QueueFailures(current => { const next = {...current}; delete next[business.id]; return next; }); Notice(`Analysis saved for ${business.name}. Review the evidence and generated research prompt before deciding.`); }
    catch (e) { QueueFailures(current => ({...current,[business.id]:e instanceof Error ? e.message : 'Analysis failed'})); ErrorMessage(e instanceof Error ? e.message : 'Analysis failed.'); }
    finally { Busy(false); }
  };

  // One bounded client-side queue shared by discovery imports and the opportunity workspace.
  // Completed analyses are saved individually; interrupted runs resume from remaining records.
  const runQueue = async (targets: BusinessRecord[]) => {
    const pending = targets.filter(item => !working.current.analyses.some(a => a.businessId === item.id) || queueFailures[item.id]);
    if (!pending.length) {
      Notice('All selected businesses already have analyses. Use Re-analyze on a business to refresh its evidence.');
      return;
    }
    const bounded = pending.slice(0, 25);
    cancelBatch.current = false;
    Busy(true); ErrorMessage(''); QueueFailures({});
    let done = 0, failed = 0;
    try {
      for (const business of bounded) {
        if (cancelBatch.current) break;
        QueueProgress({done,failed,total:bounded.length,current:business.name});
        try {
          await analyze(business);
          done++;
        } catch (e) {
          failed++;
          QueueFailures(current => ({...current,[business.id]:e instanceof Error ? e.message : 'Analysis failed'}));
          // A cloud persistence error is not a website problem: stop to protect saved data.
          if (e instanceof Error && /save|cloud|workspace/i.test(e.message)) {
            ErrorMessage('Cloud saving failed. The queue stopped to protect your existing records.');
            break;
          }
        }
      }
      const remaining = bounded.length - done - failed;
      Notice(`Queue finished: ${done} analyzed, ${failed} failed, ${remaining} remaining. ${pending.length > bounded.length ? `${pending.length - bounded.length} more await the next run.` : ''} Results are saved as they complete.`);
    } finally {
      QueueProgress(null); Busy(false); cancelBatch.current = false;
    }
  };

  const analyzeAll = async () => {
    if (busy || !businesses.length) return;
    const targets = businesses.filter(b => !analyses.some(a => a.businessId === b.id));
    await runQueue(targets);
  };

  const retryFailures = async () => {
    if (busy) return;
    const failed = working.current.businesses.filter(item => queueFailures[item.id]);
    await runQueue(failed);
  };

  const editActivity = (businessId: string) => {
    const existing = outreachActivities.find(a => a.businessId === businessId);
    ActivityBusiness(businessId);
    ActivityStage(existing?.stage ?? 'drafted');
    ActivityChannel(existing?.channel ?? 'email');
    ActivityLastContact(existing?.lastContactAt ? existing.lastContactAt.slice(0,10) : '');
    ActivityNextFollowUp(existing?.nextFollowUpAt ? existing.nextFollowUpAt.slice(0,10) : '');
    ActivityNote(existing?.note ?? '');
  };

  const saveActivity = async () => {
    if (!activityBusinessId || busy) return;
    const toStamp = (value: string) => value ? new Date(`${value}T12:00:00.000Z`).toISOString() : '';
    try {
      if (activityNote.length > 2000) throw Error('Notes must be under 2,000 characters.');
      if (activityStage !== 'drafted' && !activityLastContact && activityStage !== 'closed') throw Error('Record the actual contact date before changing the outreach stage.');
      const activity: OutreachActivity = {businessId:activityBusinessId,stage:activityStage,channel:activityChannel,lastContactAt:toStamp(activityLastContact),nextFollowUpAt:toStamp(activityNextFollowUp),note:activityNote,updatedAt:new Date().toISOString()};
      Busy(true); ErrorMessage('');
      const current = cloud.snapshot.data.discovery;
      const next = {...current,outreachActivities:upsertOutreachActivity(current.outreachActivities ?? [],activity)};
      if (!await cloud.change('discovery',next)) throw Error('Cloud save failed; outreach status was not changed.');
      ActivityBusiness(''); Notice('Outreach status and follow-up saved. No message was sent.');
    } catch(e) {ErrorMessage(e instanceof Error ? e.message : 'Could not save outreach status.');}
    finally {Busy(false);}
  };

  const openOutreach = (prospect: ReturnType<typeof buildQualifiedShortlist>[number]) => {
    const channel: OutreachChannel = prospect.business.email ? 'email' : prospect.business.phone ? 'phone' : 'contact_form';
    OutreachBusiness(prospect.business.id);
    OutreachChannelInput(channel);
    OutreachDraft(prepareOutreach(prospect,channel).message);
    OutreachApproved(false);
  };

  const changeOutreachChannel = (prospect: ReturnType<typeof buildQualifiedShortlist>[number], channel: OutreachChannel) => {
    OutreachChannelInput(channel);
    OutreachDraft(prepareOutreach(prospect,channel).message);
    OutreachApproved(false);
  };

  const copyPrompt = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); Notice('Research prompt copied. Paste it into ChatGPT when you are ready to research this business.'); }
    catch { ErrorMessage('Clipboard access was blocked. Open the analysis and copy the research prompt manually.'); }
  };

  const researchPreview = (() => {
    if (!researchJson.trim()) return null;
    try {
      const notes = parseImportedResearch(researchJson);
      return { valid: true as const, notes };
    } catch (e) {
      return { valid: false as const, message: e instanceof Error ? e.message : 'Invalid research JSON.' };
    }
  })();

  const researchTemplate = JSON.stringify({
    summary: 'Replace with sourced research summary',
    facts: [],
    hypotheses: [],
    unknowns: ['Verify the official business website and identity'],
    nextSteps: ['Cross-check business details using public sources'],
  }, null, 2);

  const startAgentResearch = (businessId:string,mode:AgentResearchMode='investigate') => {
    ResearchBusiness(businessId);
    AgentResearchModeInput(mode);
    ResearchJson('');
  };

  const saveResearch = async (businessId: string) => {
    try {
      const notes = parseImportedResearch(researchJson);
      const next = working.current.analyses.map(item => item.businessId === businessId ? { ...item, researchNotes: notes } : item);
      if (!next.some(item => item.businessId === businessId)) throw new Error('Analyze this business before importing research.');
      await persist(working.current.businesses, next);
      ResearchBusiness(''); ResearchJson(''); Notice('Research saved. Imported claims remain unverified until you check their sources.');
    } catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Could not save research.'); }
  };

  const searchOSM = async () => {
    Busy(true); ErrorMessage(''); Notice('Searching OpenStreetMap…'); OSMResults([]); SelectedOSM([]); VerifiedWebsites({}); DiscoveryProgress('');
    try { const results = await searchOpenStreetMap(category, location); OSMResults([...results].sort((a,b)=>Number(Boolean(a.websiteUrl))-Number(Boolean(b.websiteUrl)))); SelectedOSM(results.filter(row=>!row.websiteUrl).map(row => row.sourceUrl)); DiscoveryView('priority'); Notice(`${results.length} OpenStreetMap candidates found. Review the source links before importing.`); }
    catch (e) { ErrorMessage(e instanceof Error ? e.message : 'OpenStreetMap search failed.'); Notice(''); }
    finally { Busy(false); }
  };

  const importOSM = async () => {
    if (busy || !selectedOSM.length) return;
    Busy(true); ErrorMessage(''); DiscoveryProgress('Preparing selected businesses…');
    try {
      const selected = osmResults.filter(row => selectedOSM.includes(row.sourceUrl)).map(row => ({...row, websiteUrl: verifiedWebsites[row.sourceUrl]?.trim() || row.websiteUrl}));
      for (const row of selected) {
        const entered = verifiedWebsites[row.sourceUrl]?.trim();
        if (entered) {
          try {
            const url = new URL(entered);
            if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.')) throw Error('Invalid URL');
          } catch { throw Error(`Enter a valid http(s) official website URL for ${row.name}, or clear that field.`); }
        }
      }
      let nextBusinesses = [...working.current.businesses], added = 0;
      const imported: BusinessRecord[] = [];
      for (const row of selected) {
        const record = createBusinessRecord(row);
        if (nextBusinesses.some(item => sameBusiness(item, record))) continue;
        nextBusinesses = [record, ...nextBusinesses]; imported.push(record); added++;
      }
      if (added) await persist(nextBusinesses);
      Notice(`${added} businesses imported; ${selected.length - added} duplicates skipped. Missing OSM website tags are not proof a business has no website.`);
      OSMResults([]); SelectedOSM([]); VerifiedWebsites({});
      if (autoAnalyzeOSM && imported.length) {
        // The import itself is already saved. Queue processing is resumable from the workspace.
        Busy(false);
        await runQueue(imported);
      }
    } catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Could not import OpenStreetMap results.'); }
    finally { Busy(false); DiscoveryProgress(''); cancelBatch.current = false; }
  };

  const importExistingCandidates = async () => {
    if (!data.candidates.length) return;
    try {
      let nextBusinesses = [...working.current.businesses];
      let added = 0;
      for (const candidate of data.candidates) {
        const record = createBusinessRecord({
          name: candidate.review?.name.trim() || candidate.name || candidate.domain,
          category: candidate.industry,
          location: candidate.geography,
          websiteUrl: candidate.website,
          websiteStatus: 'unknown',
          discoverySource: `Existing website prospect: ${candidate.source}`,
        });
        const existing = nextBusinesses.find(item => sameBusiness(item, record));
        if (!existing) { nextBusinesses = [record, ...nextBusinesses]; added++; continue; }
        nextBusinesses = nextBusinesses.map(item => item.id === existing.id ? {
          ...item, category: item.category || record.category, websiteUrl: item.websiteUrl || record.websiteUrl,
          updatedAt: new Date().toISOString(),
        } : item);
      }
      await persist(nextBusinesses, working.current.analyses);
      Notice(`${added} existing website prospects added to the opportunity workspace; ${data.candidates.length - added} matched existing businesses.`);
    } catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Could not import existing prospects.'); }
  };

  const searchQuery = [category.trim(), location.trim()].filter(Boolean).join(' in ');
  const updateWebsiteStatus = async (business: BusinessRecord, status: WebsiteStatus) => {
    const updated = working.current.businesses.map(item => item.id === business.id ? { ...item, websiteStatus: status, updatedAt: new Date().toISOString() } : item);
    try { await persist(updated, working.current.analyses.filter(item => item.businessId !== business.id)); Notice('Website status updated. Re-analyze to refresh the opportunity score.'); }
    catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Could not update website status.'); }
  };
  const visible = businesses.filter(business => filter === 'all' || filter === 'no-site' && business.websiteStatus === 'no_website_found' || filter === 'outdated' && business.websiteStatus === 'outdated' || filter === 'unreviewed' && !analyses.some(a => a.businessId === business.id)).sort((a, b) => {
    const score = (analyses.find(item => item.businessId === b.id)?.totalScore ?? -1) - (analyses.find(item => item.businessId === a.id)?.totalScore ?? -1);
    return score || (b.rating ?? -1) - (a.rating ?? -1) || (b.reviewCount ?? -1) - (a.reviewCount ?? -1) || a.name.localeCompare(b.name);
  });
  const shortlist = buildQualifiedShortlist(businesses, analyses);
  const activityByBusiness = new Map(outreachActivities.map(a => [a.businessId,a]));
  const dueActivities = outreachActivities.filter(a => followUpStatus(a) === 'overdue').sort((a,b)=>a.nextFollowUpAt.localeCompare(b.nextFollowUpAt));
  const shortlisted = shortlist.filter(item => qualificationFilter === 'all' || item.tier === qualificationFilter);
  const qualificationCounts = { ready: shortlist.filter(item => item.tier === 'ready').length, research: shortlist.filter(item => item.tier === 'research').length, verify: shortlist.filter(item => item.tier === 'verify').length, analyze: shortlist.filter(item => item.tier === 'analyze').length };
  const csvTemplate = 'name,category,location,website,rating,reviewCount,phone,email,websiteStatus,sourceUrl,discoverySource\nExample Dental,dentist,Ludhiana,,4.7,186,9876543210,,no_website_found,https://example.com/listing,Google Maps listing';
  return <div className="opportunity-workspace">
    <div className="pagehead"><div><i>LEAD HUNTER V2</i><h1>Opportunity workspace</h1><p>Discover businesses, analyze opportunities, qualify prospects, research, prepare outreach, and track follow-ups — all in one place.</p></div></div>
    <nav className="v2-workflow-nav" aria-label="Desktop workflow stages">
      <a href="#v2-discover"><span>01</span> Discover</a>
      <a href="#v2-import"><span>02</span> Import</a>
      <a href="#v2-queue"><span>03</span> Analyze</a>
      <a href="#v2-qualify"><span>04</span> Qualify & research</a>
      <a href="#v2-followup"><span>05</span> Outreach & follow-ups</a>
    </nav>
    <nav className="v2-mobile-tabs" aria-label="Mobile workspace navigation">
      <button type="button" aria-current={mobileView==='home'?'page':undefined} onClick={()=>MobileView('home')}>⌂<span>Home</span></button>
      <button type="button" aria-current={mobileView==='discover'?'page':undefined} onClick={()=>MobileView('discover')}>⌕<span>Discover</span></button>
      <button type="button" aria-current={mobileView==='prospects'?'page':undefined} onClick={()=>MobileView('prospects')}>▤<span>Prospects</span></button>
      <button type="button" aria-current={mobileView==='followups'?'page':undefined} onClick={()=>MobileView('followups')}>◷<span>Follow-ups</span>{dueActivities.length>0&&<em>{dueActivities.length}</em>}</button>
    </nav>
    {mobileView==='home'&&<div className="v2-mobile-home">
      <div className="v2-home-heading"><strong>Your next actions</strong><p>Move from discovery to a qualified opportunity.</p></div>
      <button className="v2-action-card" type="button" onClick={()=>MobileView('discover')}><span>Find businesses</span><small>Search public business listings by location and category</small><b>Explore →</b></button>
      <button className="v2-action-card" type="button" onClick={()=>MobileView('prospects')}><span>Review opportunities</span><small>{businesses.length} saved · {qualificationCounts.ready} ready for review</small><b>Open →</b></button>
      <button className="v2-action-card" type="button" onClick={()=>MobileView('followups')}><span>Follow up</span><small>{dueActivities.length} overdue follow-ups to review</small><b>View →</b></button>
    </div>}
    <div className="v2-overview" aria-label="Workspace overview">
      <div><strong>{businesses.length}</strong><span>Businesses</span></div>
      <div><strong>{analyses.length}</strong><span>Analyzed</span></div>
      <div><strong>{qualificationCounts.ready}</strong><span>Ready for review</span></div>
      <div><strong>{dueActivities.length}</strong><span>Follow-ups due</span></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status" className="opportunity-notice">{notice}</p>}
    <section id="v2-discover" className={`panel v2-view-panel ${mobileView==='discover'?'v2-mobile-active':''}`}>
      <div className="between"><div><h2>1. Discover businesses</h2><p>Find public business listings by category and location, then import selected prospects and optionally analyze them automatically. Ratings are not supplied by OpenStreetMap.</p></div><span className="muted">{businesses.length} saved · {analyses.length} analyzed</span></div>
      <div className="formgrid">
        <label>Business category<input value={category} maxLength={80} onChange={e => Category(e.target.value)} placeholder="e.g. dentist, gym, hotel"/></label>
        <label>City or administrative area<input value={location} maxLength={120} onChange={e => Location(e.target.value)} placeholder="e.g. Ludhiana"/></label>
      </div>
      <div className="headbuttons"><button className="primary" disabled={busy || !category.trim() || !location.trim()} onClick={() => void searchOSM()}>{busy ? 'Working…' : 'Find businesses'}</button>
        {searchQuery && <a className="secondary" href={`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer">Cross-check on Google Maps</a>}
      </div>
      {discoveryProgress && <div className="headbuttons"><p role="status" className="opportunity-notice">{discoveryProgress}</p><button className="secondary" onClick={() => {cancelBatch.current = true;}}>Stop after current business</button></div>}
      {osmResults.length > 0 && <>
        <div className="between"><div><h3>2. Review discovery results</h3><p>{osmResults.length} candidates · {selectedOSM.length} selected · {osmResults.filter(row => !row.websiteUrl).length} need website verification</p></div><div className="headbuttons"><button className="secondary" disabled={busy} onClick={() => SelectedOSM(osmResults.map(row => row.sourceUrl))}>Select all</button><button className="secondary" disabled={busy} onClick={() => SelectedOSM(osmResults.filter(row=>!row.websiteUrl).map(row => row.sourceUrl))}>Select unlisted</button><button className="secondary" disabled={busy} onClick={() => SelectedOSM([])}>Clear selection</button></div></div>
        <div className="discovery-review-tabs" role="group" aria-label="Filter discovery candidates">
          <button type="button" className={discoveryView==='priority'?'active':''} aria-pressed={discoveryView==='priority'} onClick={()=>DiscoveryView('priority')}>Verify websites ({osmResults.filter(row=>!row.websiteUrl).length})</button>
          <button type="button" className={discoveryView==='listed'?'active':''} aria-pressed={discoveryView==='listed'} onClick={()=>DiscoveryView('listed')}>Listed websites ({osmResults.filter(row=>!!row.websiteUrl).length})</button>
          <button type="button" className={discoveryView==='all'?'active':''} aria-pressed={discoveryView==='all'} onClick={()=>DiscoveryView('all')}>All ({osmResults.length})</button>
        </div>
        <p className="muted discovery-review-note">No website listed in OpenStreetMap is a research lead, not proof that a business has no website. Verify before outreach.</p>
        <div className="opportunity-list discovery-review-list">{osmResults.filter(row=>discoveryView==='all' || (discoveryView==='priority'?!row.websiteUrl:!!row.websiteUrl)).map((row, i) => <label key={`${row.sourceUrl}-${i}`} className="discovery-review-card">
          <input type="checkbox" disabled={busy} checked={selectedOSM.includes(row.sourceUrl)} onChange={e => SelectedOSM(current => e.target.checked ? [...current,row.sourceUrl] : current.filter(url => url !== row.sourceUrl))}/>
          <span className="discovery-review-detail"><strong>{row.name}</strong><small>{row.location}</small><span className="discovery-review-evidence">{row.websiteUrl ? <a href={row.websiteUrl} target="_blank" rel="noopener noreferrer">Listed website</a> : <span className="muted">Website not listed — verify independently</span>}</span>
          <span className="discovery-verification-tools">
            <a href={`https://www.google.com/search?q=${encodeURIComponent(row.name+' '+row.location+' official website')}`} target="_blank" rel="noopener noreferrer">Research official site</a>
            <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">OSM source</a>
          </span>
          {!row.websiteUrl && <span className="discovery-verification-entry">
            <span>Found an official website? Add its URL before importing.</span>
            <input type="url" placeholder="https://official-business-site.com" aria-label={`Verified website for ${row.name}`} value={verifiedWebsites[row.sourceUrl] ?? ''} disabled={busy} onChange={e=>VerifiedWebsites(current=>({...current,[row.sourceUrl]:e.target.value}))}/>
          </span>}</span>
        </label>)}</div>
        <label style={{display:'flex',gap:9,alignItems:'center',margin:'12px 0'}}><input type="checkbox" checked={autoAnalyzeOSM} disabled={busy} onChange={e => AutoAnalyzeOSM(e.target.checked)}/> Analyze newly imported businesses automatically (uses existing free website scanner)</label>
        <div className="headbuttons"><button className="primary" disabled={busy || !selectedOSM.length} onClick={() => {cancelBatch.current = false; void importOSM();}}>Import {selectedOSM.length} selected {autoAnalyzeOSM ? 'and analyze' : 'businesses'}</button><button className="secondary" disabled={busy} onClick={() => {OSMResults([]);SelectedOSM([]);}}>Discard results</button>{busy && <button className="secondary" onClick={() => {cancelBatch.current = true;}}>Stop after current business</button>}</div>
      </>}
      <p className="muted">Supported types include dentist, restaurant, cafe, hotel, hair salon, pharmacy, beauty salon, gym, veterinary clinic, car repair, bakery, optician, real estate agency, law firm, accounting firm, travel agency, clothing store, supermarket and school. OpenStreetMap coverage varies by area.</p>
    </section>
    <div className={`v2-mobile-import-control ${mobileView==='discover'?'v2-import-visible':''}`}><button type="button" className="secondary" onClick={()=>ShowImport(value=>!value)} aria-expanded={showImport}>{showImport?'Hide manual import':'Add a business manually or import CSV'}</button></div>
    <section id="v2-import" className={`panel v2-view-panel ${mobileView==='discover'&&showImport?'v2-mobile-active':''}`}>
      <div className="between"><div><h2>Add businesses</h2><p>Website URL is optional. Keep the source of each business and its reputation data so opportunities can be verified later.</p></div><div className="headbuttons"><button className="secondary" disabled={!data.candidates.length} onClick={() => void importExistingCandidates()}>Import existing website prospects ({data.candidates.length})</button><button className="secondary" onClick={() => file.current?.click()}>Import business CSV</button></div></div>
      <input ref={file} hidden type="file" accept=".csv,text/csv" onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = ''; }}/>
      <form onSubmit={submit}>
        <div className="formgrid">
          <label>Business name<input required value={name} onChange={e => Name(e.target.value)} placeholder="e.g. City Dental Clinic"/></label>
          <label>Category<input value={category} onChange={e => Category(e.target.value)} placeholder="e.g. Dentist, hotel, restaurant"/></label>
          <label>Location<input value={location} onChange={e => Location(e.target.value)} placeholder="City, area"/></label>
          <label>Website URL (optional)<input value={websiteUrl} onChange={e => Website(e.target.value)} placeholder="https://example.com"/></label>
          <label>Website status<select value={websiteStatus} onChange={e => WebsiteStatusInput(e.target.value as WebsiteStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Rating (optional)<input type="number" min="0" max="5" step="0.1" value={rating} onChange={e => Rating(e.target.value)} placeholder="4.6"/></label>
          <label>Review count (optional)<input type="number" min="0" step="1" value={reviewCount} onChange={e => Reviews(e.target.value)} placeholder="125"/></label>
          <label>Public phone (optional)<input value={phone} onChange={e => Phone(e.target.value)} placeholder="Business phone"/></label>
          <label>Source URL (optional)<input value={sourceUrl} onChange={e => Source(e.target.value)} placeholder="https://listing-or-profile.example"/></label>
        </div>
        <div className="headbuttons"><button className="primary" type="submit">Save business</button><button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(csvTemplate).then(() => Notice('CSV template copied.')).catch(() => ErrorMessage('Could not copy CSV template.'))}>Copy CSV template</button>{searchQuery && <><a className="secondary" href={`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer">Search Google Maps</a><a className="secondary" href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' business')}`} target="_blank" rel="noopener noreferrer">Search Google</a></>}</div>
      </form>
      <p className="muted">CSV columns: name, category, location, website, rating, reviewCount, phone, email, websiteStatus, sourceUrl, discoverySource. Leave website blank when no official website was found. That status should be used only after checking the available sources.</p>
    </section>
    <section id="v2-qualify" className={`panel v2-view-panel ${mobileView==='prospects'?'v2-mobile-active':''}`}>
      <div className="between"><div><h2>3. Qualification shortlist</h2><p>Evidence-first ranking for outreach decisions. Scores are signals, not proof; no messages are sent automatically.</p></div><span className="muted">{qualificationCounts.ready} ready for review · {qualificationCounts.research} research next</span></div>
      <div className="headbuttons"><label>Qualification stage<select value={qualificationFilter} onChange={e => QualificationFilter(e.target.value as QualificationTier | 'all')}><option value="all">All ({shortlist.length})</option><option value="ready">Ready for human review ({qualificationCounts.ready})</option><option value="research">Research next ({qualificationCounts.research})</option><option value="verify">Verify details ({qualificationCounts.verify})</option><option value="analyze">Needs analysis ({qualificationCounts.analyze})</option></select></label></div>
      {!shortlisted.length && <p className="muted">No businesses in this qualification stage yet.</p>}
      <div className="opportunity-list">{shortlisted.slice(0,40).map(item => <article key={item.business.id} className="panel opportunity-card">
        <div className="between"><div><h3>{item.business.name}</h3><p>{[item.business.category,item.business.location].filter(Boolean).join(' · ')}</p></div><strong>{item.tier === 'ready' ? 'Ready for human review' : item.tier === 'research' ? 'Research next' : item.tier === 'verify' ? 'Verify details' : 'Needs analysis'}</strong></div>
        <p>{item.reason}</p><p><strong>Opportunity score:</strong> {item.analysis?.totalScore ?? 'Not analyzed'} · <strong>Best service:</strong> {item.recommendedService?.replace('_',' ') ?? 'Not verified'}</p>
        {item.missing.length > 0 && <p className="muted">Missing: {item.missing.join(' · ')}</p>}
        {activityByBusiness.get(item.business.id) && <p><strong>Outreach:</strong> {activityByBusiness.get(item.business.id)!.stage} · {followUpStatus(activityByBusiness.get(item.business.id)!) === 'overdue' ? 'Follow-up overdue' : activityByBusiness.get(item.business.id)!.nextFollowUpAt ? 'Follow-up '+activityByBusiness.get(item.business.id)!.nextFollowUpAt.slice(0,10) : 'No follow-up scheduled'}</p>}
        <div className="headbuttons"><button className="secondary" onClick={() => editActivity(item.business.id)}>Track outreach</button>{item.analysis && <button className="secondary" onClick={() => void copyPrompt(item.analysis!.researchPrompt)}>Copy research prompt</button>}<button className="secondary" onClick={() => void copyPrompt(buildProspectBrief(item))}>Copy qualification brief</button><button className="primary" onClick={() => openOutreach(item)}>Prepare outreach</button>{item.business.sourceUrl && <a className="secondary" href={item.business.sourceUrl} target="_blank" rel="noopener noreferrer">Check source</a>}</div>
        {activityBusinessId === item.business.id && <div className="opportunity-notice"><h4>Outreach activity</h4><p className="muted">Record what actually happened. Preparing or copying a draft does not count as contacting a business.</p><div className="formgrid"><label>Stage<select value={activityStage} onChange={e=>ActivityStage(e.target.value as OutreachStage)}>{OUTREACH_STAGES.map(stage=><option key={stage} value={stage}>{stage}</option>)}</select></label><label>Channel<select value={activityChannel} onChange={e=>ActivityChannel(e.target.value as OutreachChannel)}><option value="email">Email</option><option value="phone">Phone</option><option value="contact_form">Contact form</option></select></label><label>Last actual contact<input type="date" value={activityLastContact} onChange={e=>ActivityLastContact(e.target.value)}/></label><label>Next follow-up<input type="date" value={activityNextFollowUp} onChange={e=>ActivityNextFollowUp(e.target.value)}/></label></div><label>Notes<textarea rows={3} maxLength={2000} value={activityNote} onChange={e=>ActivityNote(e.target.value)} placeholder="Outcome, next action, consent or opt-out details"/></label><div className="headbuttons"><button className="primary" disabled={busy} onClick={()=>void saveActivity()}>Save outreach activity</button><button className="secondary" onClick={()=>ActivityBusiness('')}>Cancel</button></div></div>}
        {outreachBusinessId === item.business.id && (() => {
          const kit = prepareOutreach(item,outreachChannel);
          return <div className="opportunity-notice"><h4>Human-reviewed outreach studio</h4><p className="muted">Draft only. Nothing is sent or scheduled. Check the business, sources, contact permission, and local outreach rules before using this text.</p>
            <label>Channel<select value={outreachChannel} onChange={e => changeOutreachChannel(item,e.target.value as OutreachChannel)}><option value="email">Email</option><option value="phone">Phone call script</option><option value="contact_form">Website contact form</option></select></label>
            {outreachChannel === 'email' && <p><strong>Subject:</strong> {kit.subject} · <strong>Recipient:</strong> {item.business.email || 'Email not recorded'}</p>}
            {outreachChannel === 'phone' && <p><strong>Business phone:</strong> {item.business.phone || 'Phone not recorded'}</p>}
            {kit.sourceUrls.length > 0 && <p><strong>Sources to check:</strong> {kit.sourceUrls.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{url} </a>)}</p>}
            {kit.checks.length > 0 && <div role="alert"><strong>Complete before using this draft:</strong><ul>{kit.checks.map(check => <li key={check}>{check}</li>)}</ul></div>}
            <label>Editable message<textarea rows={11} value={outreachDraft} onChange={e => { OutreachDraft(e.target.value); OutreachApproved(false); }}/></label>
            <label><input type="checkbox" checked={outreachApproved} onChange={e => OutreachApproved(e.target.checked)}/> I reviewed the facts, verified the contact route, and will follow applicable outreach rules.</label>
            <div className="headbuttons"><button className="primary" disabled={!kit.eligible || !outreachApproved || !outreachDraft.trim()} onClick={() => void copyPrompt((outreachChannel === 'email' ? `Subject: ${kit.subject}\n\n` : '') + outreachDraft)}>Copy reviewed draft</button><button className="secondary" onClick={() => {OutreachBusiness(''); OutreachApproved(false);}}>Close</button></div>
          </div>;
        })()}

      </article>)}</div>
      {shortlisted.length > 40 && <p className="muted">Showing top 40 of {shortlisted.length} businesses. Filter by qualification stage to narrow the list.</p>}
    </section>
    <section id="v2-followup" className={`panel v2-view-panel ${mobileView==='followups'?'v2-mobile-active':''}`}><div className="between"><div><h2>4. Outreach follow-ups</h2><p>{outreachActivities.length} businesses tracked · {dueActivities.length} overdue follow-ups. All outreach is logged manually; no messages are sent automatically.</p></div></div>{dueActivities.length ? <div className="opportunity-list">{dueActivities.slice(0,25).map(activity => {const business=businesses.find(b=>b.id===activity.businessId);return business && <article key={activity.businessId} className="opportunity-card"><div className="between"><div><h3>{business.name}</h3><p>Follow-up due {activity.nextFollowUpAt.slice(0,10)} · {activity.stage} · {activity.channel}</p></div><button className="secondary" onClick={()=>editActivity(activity.businessId)}>Update activity</button></div>{activity.note && <p>{activity.note}</p>}{activityBusinessId === activity.businessId && <p className="muted">Edit this business's outreach activity in the qualification shortlist above.</p>}</article>})}</div> : <p className="muted">No overdue follow-ups. Use “Track outreach” on a qualified prospect to log actual contact and schedule the next action.</p>}</section>
    <section id="v2-queue" className={`panel v2-view-panel ${mobileView==='prospects'?'v2-mobile-active':''}`}>
      <div className="between"><div><h2>5. Prioritized opportunity queue</h2><p>{businesses.length} businesses saved · {analyses.length} analyzed · {businesses.filter(b => b.websiteStatus === 'no_website_found' || b.websiteStatus === 'outdated').length} flagged for website opportunities</p></div><button className="primary" disabled={!businesses.length || (busy && !queueProgress)} onClick={() => busy ? (cancelBatch.current = true) : void analyzeAll()}>{busy ? 'Stop after current business' : `Analyze pending (${businesses.filter(b => !analyses.some(a => a.businessId === b.id)).length})`}</button></div>
      <p className="muted">Analyze up to 25 pending businesses per run. Successful results are saved individually; failed scans remain pending for retry. Keep this tab open during processing.</p>
      {queueProgress && <div className="opportunity-notice" role="status"><strong>Processing {queueProgress.done + queueProgress.failed + 1} of {queueProgress.total}</strong> · {queueProgress.current} · {queueProgress.done} saved · {queueProgress.failed} failed <progress max={queueProgress.total} value={queueProgress.done + queueProgress.failed}/></div>}
      {Object.keys(queueFailures).length > 0 && <div className="opportunity-notice"><div className="between"><strong>{Object.keys(queueFailures).length} businesses need attention</strong><button className="secondary" disabled={busy} onClick={() => void retryFailures()}>Retry failed analyses</button></div><ul>{businesses.filter(b => queueFailures[b.id]).slice(0,10).map(b => <li key={b.id}><b>{b.name}:</b> {queueFailures[b.id]}</li>)}</ul></div>}
      <div className="headbuttons"><label>Show<select value={filter} onChange={e => Filter(e.target.value)}><option value="all">All businesses</option><option value="no-site">No website found</option><option value="outdated">Outdated websites</option><option value="unreviewed">Not analyzed yet</option></select></label></div>
      {!visible.length && <p className="empty">No businesses in this view yet. Add a business manually or import a CSV. You can include businesses with no website.</p>}
      <div className="opportunity-list">{visible.map(business => {
        const analysis = analyses.find(item => item.businessId === business.id);
        const top = analysis ? prioritizedOpportunities(analysis).filter(item => item.priority !== 'unverified').slice(0, 3) : [];
        return <article className="panel opportunity-card" key={business.id}>
          <div className="between"><div><h3>{business.name}</h3><p>{[business.category, business.location].filter(Boolean).join(' · ') || 'Category/location not recorded'}</p></div><label className="opportunity-status-control"><span>Website status</span><select aria-label={`Website status for ${business.name}`} value={business.websiteStatus} onChange={e => void updateWebsiteStatus(business, e.target.value as WebsiteStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <p>{business.websiteUrl ? <a href={business.websiteUrl} target="_blank" rel="noopener noreferrer">{business.websiteUrl}</a> : 'No website URL recorded'}{business.rating !== null ? ` · ★ ${business.rating}` : ''}{business.reviewCount !== null ? ` · ${business.reviewCount} reviews` : ''}{business.sourceUrl ? <> · <a href={business.sourceUrl} target="_blank" rel="noopener noreferrer">Discovery source</a></> : ''}</p>
          <p>Discovery source: {business.discoverySource || 'Not recorded'}</p>{queueFailures[business.id] && <p className="error" role="alert">Analysis needs retry: {queueFailures[business.id]}</p>}
          {analysis ? <><div className="opportunity-score"><strong>Opportunity score: {analysis.totalScore}/100</strong><span>Reputation: {analysis.reputationScore}/100 · Evidence confidence: {analysis.evidenceConfidence}%</span></div><ul className="opportunity-signals">{top.map(item => <li key={item.service}><b>{item.service.replace('_', ' ')} · {item.priority}</b> — {item.rationale}</li>)}</ul><details><summary>Evidence and research brief</summary><h4>All service areas</h4><ul className="opportunity-signals">{analysis.opportunities.map(item => <li key={item.service}><b>{item.service.replace('_', ' ')} · {item.priority} ({item.score}/100)</b> — {item.rationale}</li>)}</ul><p>{analysis.evidence.length ? `${analysis.evidence.length} evidence items collected.` : 'No technical evidence collected. This analysis is based on business information only.'}</p>{analysis.evidence.map(item => <p key={item.id}><b>[{item.confidence}] {item.signal}</b> — {item.description} {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>}</p>)}<textarea readOnly rows={12} value={analysis.researchPrompt}/><button className="secondary" onClick={() => void copyPrompt(analysis.researchPrompt)}>Copy ChatGPT research prompt</button><h4>Research findings</h4>{analysis.researchNotes ? <><p>{analysis.researchNotes.summary}</p><p className="muted">Imported {new Date(analysis.researchNotes.importedAt).toLocaleString()}; source claims are unverified.</p><ul>{analysis.researchNotes.facts.map((fact, i) => <li key={i}>{fact.claim} — <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></li>)}</ul>{analysis.researchNotes.hypotheses.length > 0 && <p>Hypotheses: {analysis.researchNotes.hypotheses.join(' · ')}</p>}{analysis.researchNotes.unknowns.length > 0 && <p>Unknowns: {analysis.researchNotes.unknowns.join(' · ')}</p>}{analysis.researchNotes.nextSteps.length > 0 && <p>Next steps: {analysis.researchNotes.nextSteps.join(' · ')}</p>}</> : <p className="muted">No research findings imported.</p>}<button className="secondary" onClick={() => startAgentResearch(business.id,analysis.researchNotes?'follow_up':'investigate')}>Continue / import AI research</button></details></> : <p className="muted">Not analyzed yet. Website scans use the existing local analyzer; no paid API or AI service is called.</p>}
          <div className="headbuttons"><button className="primary" disabled={busy} onClick={() => void analyzeOne(business)}>{analysis ? 'Re-analyze' : 'Analyze opportunity'}</button>{analysis && <button className="secondary" onClick={() => void copyPrompt(analysis.researchPrompt)}>Copy ChatGPT research prompt</button>}{analysis && <button className="secondary" onClick={() => startAgentResearch(business.id,analysis.researchNotes?'follow_up':'investigate')}>{analysis.researchNotes?'Continue AI research':'Import AI research'}</button>}</div>{researchBusinessId === business.id && <div><h4>AI research workbench</h4><p className="muted">1. Choose a research task. 2. Copy its complete context into ChatGPT, Claude, Gemini or another AI agent. 3. Paste the JSON findings here and review sources before saving.</p>
        <label>Research task<select value={agentResearchMode} onChange={e=>AgentResearchModeInput(e.target.value as AgentResearchMode)}><option value="investigate">Full business investigation</option><option value="follow_up">Investigate remaining unknowns</option><option value="outreach">Service and outreach research</option></select></label>
        <label>Portable AI prompt<textarea readOnly rows={9} value={buildAgentResearchPrompt(business,analysis,agentResearchMode)}/></label><div className="headbuttons"><button className="secondary" onClick={() => void copyPrompt(buildAgentResearchPrompt(business,analysis,agentResearchMode))}>Copy AI prompt</button><button className="secondary" onClick={() => ResearchJson(researchTemplate)}>Insert JSON template</button></div><label>Paste ChatGPT research JSON<textarea rows={10} value={researchJson} onChange={e => ResearchJson(e.target.value)} placeholder={'{"summary":"...","facts":[{"claim":"...","sourceUrl":"https://..."}],"hypotheses":[],"unknowns":[],"nextSteps":[]}'}/></label>{researchPreview && <div className="opportunity-notice" role="status">{researchPreview.valid ? <><strong>Valid research format</strong><p>{researchPreview.notes.facts.length} sourced claims · {researchPreview.notes.hypotheses.length} hypotheses · {researchPreview.notes.unknowns.length} unknowns · {researchPreview.notes.nextSteps.length} next steps</p><p className="muted">Format validation does not verify that sources or claims are true.</p></> : <p className="error">{researchPreview.message}</p>}</div>}<div className="headbuttons"><button className="primary" disabled={busy || !researchPreview?.valid} onClick={() => void saveResearch(business.id)}>Save validated research</button><button className="secondary" onClick={() => { ResearchBusiness(''); ResearchJson(''); }}>Cancel</button></div></div>}
        </article>;
      })}</div>
    </section>
  </div>;
}
