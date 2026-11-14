import { useEffect, useRef, useState } from 'react';
import type { BusinessRecord, ClientJourney, ProspectCommunication } from './opportunityModel';
import { buildFollowUpPrompt, buildOutreachPrompt, buildWebsiteContextPrompt, emptyClientJourney, isSafeHttpUrl } from './prospectStudio';

type Props = {
  business: BusinessRecord;
  onSave: (journey: ClientJourney, event?: ProspectCommunication, contextNotes?: string) => Promise<void>;
};
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const field = document.createElement('textarea');
    field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select();
    const ok = document.execCommand('copy'); field.remove(); return ok;
  }
}
const localToday = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};

export function ProspectStudio({ business, onSave }: Props) {
  const [journey, setJourney] = useState<ClientJourney>(() => business.clientJourney ?? emptyClientJourney());
  const [contextNotes, setContextNotes] = useState(business.contextNotes ?? '');
  const [kind, setKind] = useState<ProspectCommunication['kind']>('sent');
  const [channel, setChannel] = useState<ProspectCommunication['channel']>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(business.email || '');
  const [activityDate, setActivityDate] = useState(localToday());
  const [followUpAt, setFollowUpAt] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pendingEventId = useRef<string | null>(null);
  const persistedKey = JSON.stringify([business.clientJourney ?? null, business.contextNotes ?? '', business.email]);

  useEffect(() => {
    setJourney(business.clientJourney ?? emptyClientJourney());
    setContextNotes(business.contextNotes ?? '');
    setContact(business.email || '');
  }, [business.id, persistedKey]);

  const persist = async (nextJourney = journey, event?: ProspectCommunication, nextNotes = contextNotes) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await onSave(nextJourney, event, nextNotes);
      if (event) pendingEventId.current = null;
      setJourney(current => event && !current.communications.some(item => item.id === event.id)
        ? { ...nextJourney, communications: [...nextJourney.communications, event] }
        : nextJourney);
      setNotice(event ? (event.kind === 'sent' ? 'Sent message recorded. Lead Hunter did not send it.' : 'Activity recorded for this prospect.') : 'Prospect details saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this prospect update.');
    } finally { lock.current = false; setBusy(false); }
  };

  const savePrototype = () => {
    const url = journey.prototype.url.trim();
    if (!url) { setError('Enter the prototype URL before saving it.'); return; }
    if (!isSafeHttpUrl(url)) { setError('Prototype URL must be a complete HTTP or HTTPS address.'); return; }
    const next: ClientJourney = { ...journey, prototype: { ...journey.prototype, url, updatedAt: new Date().toISOString() } };
    void persist(next);
  };
  const copy = async (text: string, label: string) => {
    setError(''); setNotice(await copyText(text) ? label + ' copied. Paste it into ChatGPT.' : 'Copy was blocked. Select and copy the text manually.');
  };
  const saveEvent = () => {
    if (journey.communications.length >= 500) { setError('This prospect has reached the 500-entry history limit. All existing history is preserved; no older entries were removed.'); return; }
    if (!activityDate) { setError('Choose the actual date of this message or activity.'); return; }
    if (kind === 'sent' && !message.trim()) { setError('Paste the exact message you sent before recording it.'); return; }
    if (kind !== 'sent' && !message.trim() && kind !== 'meeting' && kind !== 'note') { setError('Add the message or reply text so the complete history is retained.'); return; }
    const stamp = (value: string) => value ? new Date(value + 'T12:00:00').toISOString() : '';
    const event: ProspectCommunication = {
      id: pendingEventId.current ?? (pendingEventId.current = crypto.randomUUID()), kind, channel, subject, message, contact,
      occurredAt: stamp(activityDate), prototypeUrl: journey.prototype.url,
      followUpAt: stamp(followUpAt), notes,
    };
    void persist(journey, event);
  };
  const updatePrototype = (key: keyof ClientJourney['prototype'], value: string) =>
    setJourney(current => ({ ...current, prototype: { ...current.prototype, [key]: value } }));

  return <section className="prospect-studio" aria-label={'Client journey for ' + business.name}>
    <div className="studio-business">
      <h3>Website context</h3>
      <p><strong>{business.name}</strong> · {[business.category, business.location].filter(Boolean).join(' · ') || 'Industry and location not recorded'}</p>
      <p>{business.websiteUrl ? <a href={business.websiteUrl} target="_blank" rel="noopener noreferrer">Original website: {business.websiteUrl}</a> : 'Original website not recorded'}</p>
      {business.websiteUrl && <a className="secondary" href={business.websiteUrl} target="_blank" rel="noopener noreferrer">Open original website</a>}
      <label>Additional business or website context<textarea rows={2} maxLength={5000} value={contextNotes} onChange={e => setContextNotes(e.target.value)} placeholder="Services, audience, brand details, or anything you already know."/></label>
      <div className="headbuttons">
        <button className="primary" disabled={busy} onClick={() => void copy(buildWebsiteContextPrompt(business, contextNotes), 'Website context')}>Copy Website Context for ChatGPT</button>
        <button className="secondary" disabled={busy} onClick={() => void persist(journey, undefined, contextNotes)}>Save context notes</button>
      </div>
      <p className="muted">Lead Hunter provides saved facts only. ChatGPT performs the research and writes the website build prompt. No audit is required.</p>
    </div>

    <div className="studio-prototype">
      <h3>Prototype</h3>
      <div className="formgrid">
        <label>Prototype URL<input type="url" maxLength={2048} value={journey.prototype.url} placeholder="https://your-preview.example" onChange={e => updatePrototype('url', e.target.value)}/></label>
        <label>Platform (optional)<input value={journey.prototype.platform} maxLength={120} placeholder="e.g. Vercel" onChange={e => updatePrototype('platform', e.target.value)}/></label>
        <label>Project reference (optional)<input value={journey.prototype.projectReference ?? ''} maxLength={200} placeholder="e.g. ABC-Dental-Redesign" onChange={e => updatePrototype('projectReference', e.target.value)}/></label>
        <label>Prototype creation date<input type="date" value={journey.prototype.completedAt.slice(0,10)} onChange={e => updatePrototype('completedAt', e.target.value)}/></label>
        <label>Improvements or redesign notes<textarea rows={3} maxLength={5000} value={journey.prototype.improvements || journey.prototype.notes} onChange={e => { updatePrototype('improvements', e.target.value); updatePrototype('notes', e.target.value); }}/></label>
      </div>
      <div className="headbuttons">
        <button className="primary" disabled={busy || !journey.prototype.url.trim()} onClick={savePrototype}>Save Prototype</button>
        {journey.prototype.url && isSafeHttpUrl(journey.prototype.url) && <a className="secondary" href={journey.prototype.url} target="_blank" rel="noopener noreferrer">Open Prototype</a>}
        <button className="secondary" disabled={busy} onClick={() => void copy(buildOutreachPrompt({ ...business, contextNotes, clientJourney: journey }), 'Outreach context')}>Copy Outreach Context for ChatGPT</button>
      </div>
      {journey.prototype.updatedAt && <p className="muted">Last updated {new Date(journey.prototype.updatedAt).toLocaleString()}.</p>}
    </div>

    <div className="studio-outreach">
      <h3>Outreach and follow-up</h3>
      <p className="muted">ChatGPT drafts the message. Send it yourself, then record the exact message here.</p>
      {journey.communications.length > 0 && <button className="secondary" disabled={busy} onClick={() => void copy(buildFollowUpPrompt({ ...business, contextNotes, clientJourney: journey }), 'Follow-up context')}>Copy Follow-up Context for ChatGPT</button>}
      <div className="formgrid">
        <label>Activity<select value={kind} onChange={e => setKind(e.target.value as ProspectCommunication['kind'])}>{['sent','reply','meeting','interested','won','lost','note'].map(v => <option key={v} value={v}>{v === 'sent' ? 'Message sent' : v[0].toUpperCase()+v.slice(1)}</option>)}</select></label>
        <label>Channel<select value={channel} onChange={e => setChannel(e.target.value as ProspectCommunication['channel'])}>{['email','contact_form','phone','meeting','other'].map(v => <option key={v} value={v}>{v.replace('_',' ')}</option>)}</select></label>
        <label>Contact or recipient<input value={contact} maxLength={300} onChange={e => setContact(e.target.value)}/></label>
        <label>Subject<input value={subject} maxLength={500} onChange={e => setSubject(e.target.value)}/></label>
        <label>Date<input type="date" required value={activityDate} onChange={e => setActivityDate(e.target.value)}/></label>
        <label>Follow-up date (optional)<input type="date" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)}/></label>
        <label>Exact message sent, reply, or activity<textarea rows={5} maxLength={20000} value={message} onChange={e => setMessage(e.target.value)} placeholder={kind === 'sent' ? 'Paste the exact message you sent.' : 'Record the complete reply or activity details.'}/></label>
        <label>Notes (optional)<textarea rows={2} maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)}/></label>
      </div>
      <p className="muted">Each entry can contain up to 20,000 characters; history keeps up to 500 entries. Saved history is never automatically removed.</p><button className="primary" disabled={busy} onClick={saveEvent}>Record actual activity</button>
      {journey.communications.length > 0 && <details className="studio-history"><summary>Complete communication history ({journey.communications.length})</summary><ol>{journey.communications.map(event => <li key={event.id}><strong>{event.kind}</strong> · {event.channel} · {new Date(event.occurredAt).toLocaleString()}<p>Contact: {event.contact || 'Not recorded'}{event.subject ? ' · Subject: ' + event.subject : ''}</p>{event.message && <pre>{event.message}</pre>}{event.prototypeUrl && <p>Prototype proposed: <a href={event.prototypeUrl} target="_blank" rel="noopener noreferrer">{event.prototypeUrl}</a></p>}{event.followUpAt && <p>Follow-up: {new Date(event.followUpAt).toLocaleDateString()}</p>}{event.notes && <p>{event.notes}</p>}</li>)}</ol></details>}
    </div>
    {notice && <p className="opportunity-notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
