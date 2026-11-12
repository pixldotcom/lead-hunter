import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloud } from './CloudWorkspace';
import { uid } from './domain';
import { requestAudit } from './analyzerApi';
import { readEvidence } from './discovery';
import { detectOpportunities, prioritizedOpportunities } from './opportunityDetection';
import { createBusinessRecord, parseBusinessCsv, sameBusiness } from './opportunityPersistence';
import type { BusinessRecord, OpportunityEvidence, ServiceArea, WebsiteStatus } from './opportunityModel';

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

export function OpportunityWorkspace() {
  const cloud = useCloud();
  const data = cloud.snapshot.data.discovery;
  const businesses = data.businesses ?? [];
  const analyses = data.opportunityAnalyses ?? [];
  const [name, Name] = useState('');
  const [category, Category] = useState('');
  const [location, Location] = useState('');
  const [websiteUrl, Website] = useState('');
  const [websiteStatus, WebsiteStatusInput] = useState<WebsiteStatus>('unknown');
  const [rating, Rating] = useState('');
  const [reviewCount, Reviews] = useState('');
  const [phone, Phone] = useState('');
  const [sourceUrl, Source] = useState('');
  const [filter, Filter] = useState('all');
  const [busy, Busy] = useState(false);
  const [notice, Notice] = useState('');
  const [error, ErrorMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);
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
        Notice(`Website scan unavailable for ${business.name}: ${e instanceof Error ? e.message : 'scan failed'}. Saved an analysis using only recorded business information.`);
      }
    }
    const analysis = detectOpportunities(current, evidence);
    const nextBusinesses = working.current.businesses.map(item => item.id === current.id ? current : item);
    const nextAnalyses = [...working.current.analyses.filter(item => item.businessId !== current.id), analysis];
    await persist(nextBusinesses, nextAnalyses);
    return analysis;
  };

  const analyzeOne = async (business: BusinessRecord) => {
    if (busy) return;
    Busy(true); ErrorMessage(''); Notice(`Analyzing ${business.name}…`);
    try { await analyze(business); Notice(`Analysis saved for ${business.name}. Review the evidence and generated research prompt before deciding.`); }
    catch (e) { ErrorMessage(e instanceof Error ? e.message : 'Analysis failed.'); }
    finally { Busy(false); }
  };

  const analyzeAll = async () => {
    if (busy || !businesses.length) return;
    Busy(true); ErrorMessage('');
    let completed = 0;
    for (const business of [...businesses]) {
      try { await analyze(business); completed++; Notice(`Analyzed ${completed} of ${businesses.length} businesses.`); }
      catch (e) { ErrorMessage(`${business.name}: ${e instanceof Error ? e.message : 'analysis failed'}`); break; }
    }
    if (completed === businesses.length) Notice(`Finished analyzing ${completed} businesses. Review the ranked opportunities below.`);
    Busy(false);
  };

  const copyPrompt = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); Notice('Research prompt copied. Paste it into ChatGPT when you are ready to research this business.'); }
    catch { ErrorMessage('Clipboard access was blocked. Open the analysis and copy the research prompt manually.'); }
  };

  const visible = businesses.filter(business => filter === 'all' || filter === 'no-site' && business.websiteStatus === 'no_website_found' || filter === 'outdated' && business.websiteStatus === 'outdated' || filter === 'unreviewed' && !analyses.some(a => a.businessId === business.id));
  const csvTemplate = 'name,category,location,website,rating,reviewCount,phone,email,websiteStatus,sourceUrl,discoverySource\nExample Dental,dentist,Ludhiana,,4.7,186,9876543210,,no_website_found,https://example.com/listing,Google Maps listing';
  return <div className="opportunity-workspace">
    <div className="pagehead"><div><i>OPPORTUNITY-FIRST DISCOVERY</i><h1>Business Opportunities</h1><p>Prioritize businesses with a strong reputation and a weak or missing website, then uncover SEO, local SEO, performance and marketing opportunities.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status" className="opportunity-notice">{notice}</p>}
    <section className="panel">
      <div className="between"><div><h2>Add businesses</h2><p>Website URL is optional. Keep the source of each business and its reputation data so opportunities can be verified later.</p></div><button className="secondary" onClick={() => file.current?.click()}>Import business CSV</button></div>
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
        <div className="headbuttons"><button className="primary" type="submit">Save business</button><button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(csvTemplate).then(() => Notice('CSV template copied.')).catch(() => ErrorMessage('Could not copy CSV template.'))}>Copy CSV template</button></div>
      </form>
      <p className="muted">CSV columns: name, category, location, website, rating, reviewCount, phone, email, websiteStatus, sourceUrl, discoverySource. Leave website blank when no official website was found. That status should be used only after checking the available sources.</p>
    </section>
    <section className="panel">
      <div className="between"><div><h2>Opportunity queue</h2><p>{businesses.length} businesses saved · {analyses.length} analyzed</p></div><button className="primary" disabled={busy || !businesses.length} onClick={() => void analyzeAll()}>{busy ? 'Analyzing…' : 'Analyze all businesses'}</button></div>
      <div className="headbuttons"><label>Show<select value={filter} onChange={e => Filter(e.target.value)}><option value="all">All businesses</option><option value="no-site">No website found</option><option value="outdated">Outdated websites</option><option value="unreviewed">Not analyzed yet</option></select></label></div>
      {!visible.length && <p className="empty">No businesses in this view yet. Add a business manually or import a CSV. You can include businesses with no website.</p>}
      <div className="opportunity-list">{visible.map(business => {
        const analysis = analyses.find(item => item.businessId === business.id);
        const top = analysis ? prioritizedOpportunities(analysis).filter(item => item.priority !== 'unverified').slice(0, 3) : [];
        return <article className="panel opportunity-card" key={business.id}>
          <div className="between"><div><h3>{business.name}</h3><p>{[business.category, business.location].filter(Boolean).join(' · ') || 'Category/location not recorded'}</p></div><span className={`website-status status-${business.websiteStatus}`}>{statusLabels[business.websiteStatus]}</span></div>
          <p>{business.websiteUrl ? <a href={business.websiteUrl} target="_blank" rel="noopener noreferrer">{business.websiteUrl}</a> : 'No website URL recorded'}{business.rating !== null ? ` · ★ ${business.rating}` : ''}{business.reviewCount !== null ? ` · ${business.reviewCount} reviews` : ''}</p>
          {analysis ? <><div className="opportunity-score"><strong>Opportunity score: {analysis.totalScore}/100</strong><span>Evidence confidence: {analysis.evidenceConfidence}%</span></div><ul className="opportunity-signals">{top.map(item => <li key={item.service}><b>{item.service.replace('_', ' ')} · {item.priority}</b> — {item.rationale}</li>)}</ul><details><summary>Evidence and research brief</summary><p>{analysis.evidence.length ? `${analysis.evidence.length} evidence items collected.` : 'No technical evidence collected. This analysis is based on business information only.'}</p>{analysis.evidence.map(item => <p key={item.id}><b>[{item.confidence}] {item.signal}</b> — {item.description} {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>}</p>)}<textarea readOnly rows={12} value={analysis.researchPrompt}/><button className="secondary" onClick={() => void copyPrompt(analysis.researchPrompt)}>Copy ChatGPT research prompt</button></details></> : <p className="muted">Not analyzed yet. Website scans use the existing local analyzer; no paid API or AI service is called.</p>}
          <div className="headbuttons"><button className="primary" disabled={busy} onClick={() => void analyzeOne(business)}>{analysis ? 'Re-analyze' : 'Analyze opportunity'}</button></div>
        </article>;
      })}</div>
    </section>
  </div>;
}
