import type { AppData, Lead } from './domain.ts';

export const NUMERIC_FIELDS = ['attempts', 'proposalAmount', 'revenueWon', 'monthlyRevenue'] as const;
export type NumericField = typeof NUMERIC_FIELDS[number];
const stages = ['New','Researching','Qualified','Ready to contact','Contacted','Replied','Meeting booked','Proposal sent','Negotiation','Won','Lost','Nurture'];
const priorities = ['High','Medium','Low'];
const fail = (path: string, message: string): never => { throw new Error(`${path}: ${message}. Existing data was not changed.`); };
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, required = false): string {
  if (typeof value !== 'string' || (required && !value.trim())) return fail(path, required ? 'expected nonempty text' : 'expected text');
  return value;
}
function choice(value: unknown, choices: readonly string[], path: string): string {
  if (typeof value !== 'string' || !choices.includes(value)) return fail(path, `expected one of ${choices.join(', ')}`);
  return value;
}
export function numericValue(value: unknown, path: string, integer = false, max = Number.MAX_SAFE_INTEGER): number {
  // Deliberately support decimal strings written by the original HTML numeric controls.
  // Blank form values mean zero; persisted blank strings are rejected by validateLead.
  if (typeof value === 'string' && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) return fail(path, `expected a finite nonnegative ${integer ? 'whole number' : 'number'} no greater than ${max}`);
  return value;
}
export function normalizeNumericInput(field: NumericField, value: unknown): number {
  return numericValue(value === '' ? 0 : value, field, field === 'attempts');
}
function date(value: unknown, path: string, optional = true): string {
  const v = text(value, path);
  if (!v && optional) return v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) !== v) return fail(path, 'expected a real calendar date in YYYY-MM-DD format');
  return v;
}
function timestamp(value: unknown, path: string): string {
  const v = text(value,path,true);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) || !Number.isFinite(Date.parse(v))) return fail(path, 'expected an ISO timestamp with a timezone');
  date(v.slice(0,10),path,false);
  return v;
}
function webUrl(value: unknown, path: string, optional = true): string {
  const v = text(value,path);
  if (!v && optional) return v;
  try {
    if (!v || /[\s\\]/.test(v)) throw new Error();
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.hostname.includes('..')) throw new Error();
  } catch { return fail(path, 'expected an HTTP/HTTPS website URL without credentials'); }
  return v;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, 'expected an array');
  return value;
}
function uniqueIds(values: Record<string,unknown>[], path: string) {
  const ids = new Set();
  for (const item of values) { if (ids.has(item.id)) fail(path, 'duplicate IDs are not supported'); ids.add(item.id); }
}
export function validateLead(value: unknown, path = 'Lead'): Lead {
  const source = object(value,path);
  const x = { ...source };
  for (const key of ['id','name']) text(x[key],`${path}.${key}`,true);
  for (const key of ['country','city','industry','discovery','contactName','notes','fit','scoreExplanation','lastResponse','lossReason']) text(x[key],`${path}.${key}`);
  webUrl(x.website,`${path}.website`,false);
  for (const key of ['sourceUrl','contactPage']) webUrl(x[key],`${path}.${key}`);
  const email = text(x.email,`${path}.email`);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`${path}.email`,'expected a valid email address or empty text');
  choice(x.type,['Agency','Direct business','Referral','Other'],`${path}.type`);
  choice(x.stage,stages,`${path}.stage`);
  choice(x.priority,priorities,`${path}.priority`);
  if (x.manualPriority !== null) choice(x.manualPriority,priorities,`${path}.manualPriority`);
  for (const key of ['researchedAt','firstContact','lastContact','nextFollowUp','meetingDate','proposalDate','closedDate']) date(x[key],`${path}.${key}`);
  for (const key of ['createdAt','updatedAt']) timestamp(x[key],`${path}.${key}`);
  for (const key of NUMERIC_FIELDS) x[key] = numericValue(x[key],`${path}.${key}`,key === 'attempts');
  x.score = numericValue(x.score,`${path}.score`,true,100);
  const breakdown = { ...object(x.breakdown,`${path}.breakdown`) };
  for (const [key,max] of Object.entries({fit:30,problems:30,relevance:20,contact:10,source:10})) breakdown[key] = numericValue(breakdown[key],`${path}.breakdown.${key}`,true,max);
  x.breakdown = breakdown;
  x.services = array(x.services,`${path}.services`).map((v,i)=>text(v,`${path}.services[${i}]`,true));
  const activities = array(x.activities,`${path}.activities`).map((v,i)=> {
    const a = { ...object(v,`${path}.activities[${i}]`) };
    for (const key of ['id','type']) text(a[key],`${path}.activities[${i}].${key}`,true);
    text(a.note,`${path}.activities[${i}].note`);
    timestamp(a.timestamp,`${path}.activities[${i}].timestamp`);
    return a;
  });
  uniqueIds(activities,`${path}.activities`); x.activities = activities;
  const findings = array(x.findings,`${path}.findings`).map((v,i)=> {
    const f = { ...object(v,`${path}.findings[${i}]`) };
    for (const key of ['id','title','category']) text(f[key],`${path}.findings[${i}].${key}`,true);
    for (const key of ['explanation','evidence','recommendation']) text(f[key],`${path}.findings[${i}].${key}`);
    webUrl(f.pageUrl,`${path}.findings[${i}].pageUrl`,false);
    timestamp(f.timestamp,`${path}.findings[${i}].timestamp`);
    choice(f.severity,['high','medium','low','info'],`${path}.findings[${i}].severity`);
    choice(f.confidence,['confirmed','likely','unverified'],`${path}.findings[${i}].confidence`);
    return f;
  });
  uniqueIds(findings,`${path}.findings`); x.findings = findings;
  return x as Lead;
}
export function validateData(value: unknown): AppData {
  const data = object(value,'Backup');
  if (data.version !== 1) fail('Backup.version','unsupported version; only numeric version 1 is supported');
  const leads = array(data.leads,'Backup.leads').map((lead,i)=>validateLead(lead,`Lead ${i+1}`));
  // Duplicate lead IDs are handled in import previews; active workspaces must be unique.
  return { ...data, version:1, leads } as AppData;
}
export function requireUniqueLeadIds(data: AppData): AppData {
  uniqueIds(data.leads as unknown as Record<string,unknown>[], 'Workspace.leads');
  return data;
}
