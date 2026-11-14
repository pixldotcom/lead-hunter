import { useState } from 'react';
import type { BusinessRecord, ClientJourney } from './opportunityModel';
import { buildOutreachPrompt, emptyClientJourney, isSafeHttpUrl } from './prospectStudioUtils';

type Props = { business: BusinessRecord; onSave: (prototype: ClientJourney['prototype']) => Promise<void> };
const protoOf = (business: BusinessRecord) => business.clientJourney?.prototype ?? emptyClientJourney().prototype;

export function PrototypeEditor({ business, onSave }: Props) {
  const saved = protoOf(business), hasPrototype = !!saved.url;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(saved.url), [projectReference, setProjectReference] = useState(saved.projectReference ?? ''), [notes, setNotes] = useState(saved.improvements || saved.notes);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const reset = () => { const value = protoOf(business); setUrl(value.url); setProjectReference(value.projectReference ?? ''); setNotes(value.improvements || value.notes); setError(''); setEditing(false); };
  const save = async () => {
    const normalized = url.trim();
    if (!normalized || !isSafeHttpUrl(normalized)) { setError('Enter a valid HTTP or HTTPS prototype URL.'); return; }
    setBusy(true); setError(''); setNotice('');
    const current = business.clientJourney ?? emptyClientJourney();
    const prototype = { ...current.prototype, url: normalized, projectReference: projectReference.trim(), notes: notes.trim(), improvements: notes.trim(), updatedAt: new Date().toISOString() };
    try { await onSave(prototype); setEditing(false); setNotice('Prototype saved.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save prototype.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remove this prototype URL? Communication history will be kept.')) return;
    setBusy(true); setError(''); setNotice('');
    const current = business.clientJourney ?? emptyClientJourney();
    try { await onSave({ ...current.prototype, url: '', projectReference: '', notes: '', improvements: '', updatedAt: '' }); setUrl(''); setProjectReference(''); setNotes(''); setEditing(false); setNotice('Prototype removed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove prototype.'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    const prompt = buildOutreachPrompt({ ...business, clientJourney: { ...(business.clientJourney ?? emptyClientJourney()), prototype: saved } });
    try { await navigator.clipboard.writeText(prompt); setNotice('Outreach context copied. Paste it into ChatGPT.'); }
    catch { setError('Copy was blocked by the browser.'); }
  };
  return <section className="website-proposal" aria-label={`Website Proposal for ${business.name}`}>
    <div className="proposal-heading"><h3>Website Proposal</h3>{hasPrototype && <span className="prototype-ready">Prototype Ready</span>}</div>
    <div className="proposal-links"><div><strong>Original Website</strong>{business.websiteUrl && isSafeHttpUrl(business.websiteUrl) ? <><a className="proposal-url" href={business.websiteUrl} target="_blank" rel="noopener noreferrer">{business.websiteUrl}</a><a className="text-button" href={business.websiteUrl} target="_blank" rel="noopener noreferrer">Open Original</a></> : <span className="muted">{business.websiteUrl || 'Not recorded'}</span>}</div>
      <div><strong>Proposed Redesign</strong>{hasPrototype && isSafeHttpUrl(saved.url) ? <><a className="proposal-url" href={saved.url} target="_blank" rel="noopener noreferrer">{saved.url}</a><div className="proposal-actions"><a className="secondary" href={saved.url} target="_blank" rel="noopener noreferrer">Open Prototype</a><button className="secondary" disabled={busy} onClick={() => { setEditing(true); setNotice(''); }}>Edit</button></div></> : <><p className="muted">No redesign prototype saved yet.</p><button className="primary" disabled={busy} onClick={() => { setEditing(true); setNotice(''); }}>+ Add Prototype URL</button></>}</div>
      {hasPrototype && saved.projectReference && <div><strong>Project Reference</strong><span className="proposal-url">{saved.projectReference}</span></div>}
    </div>
    {hasPrototype && <button className="text-button proposal-copy" disabled={busy} onClick={() => void copy()}>Copy Outreach Context</button>}
    {editing && <div className="proposal-editor"><label>Prototype URL<input type="url" maxLength={2048} autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-preview.example" aria-invalid={!!error}/></label><label>Project Reference (optional)<input maxLength={200} value={projectReference} onChange={e => setProjectReference(e.target.value)} placeholder="Texan-Built-Redesign"/></label><label>Notes (optional)<textarea rows={2} maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Short description of the redesign"/></label><div className="proposal-actions"><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button><button className="secondary" disabled={busy} onClick={reset}>Cancel</button>{hasPrototype && <button className="danger-outline" disabled={busy} onClick={() => void remove()}>Remove Prototype</button>}</div></div>}
    {notice && <p className="opportunity-notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
