import { createBusinessRecord, parseBusinessCsv, sameBusiness, type BusinessImportRow } from './opportunityPersistence.ts';
import type { BusinessRecord } from './opportunityModel.ts';

const isMapsUrl = (url: URL) => /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && (/\/maps(?:\/|$)/i.test(url.pathname) || /[?&](?:q|query|cid)=/i.test(url.search));

export function normalizeHttpUrl(value: string, label: string): string {
  const input = value.trim();
  if (!input) return '';
  let url: URL;
  try { url = new URL(input); } catch { throw Error(`${label} must be a complete http:// or https:// URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password || url.port) throw Error(`${label} must be a public http:// or https:// URL without credentials or a custom port.`);
  return url.href;
}

export function parseQuickImport(text: string): BusinessImportRow[] {
  if (!text.trim()) throw Error('Add a website URL, Google Maps reference, or a business name and location.');
  if (text.length > 50_000) throw Error('Quick import is limited to 50 KB per batch.');
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/^(?:business name|name),/i.test(firstLine.trim())) return parseBusinessCsv(text).map(({ rating: _rating, reviewCount: _reviewCount, phone: _phone, email: _email, profiles: _profiles, websiteStatus: _websiteStatus, ...row }) => row);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 100) throw Error('Quick import is limited to 100 businesses per batch.');
  return lines.map((line, index) => {
    const parts = line.split('|').map(part => part.trim());
    if (/^https?:\/\//i.test(parts[0])) {
      const reference = normalizeHttpUrl(parts[0], `Row ${index + 1} reference`);
      let url: URL;
      try { url = new URL(reference); } catch { throw Error(`Row ${index + 1} has an invalid URL.`); }
      if (isMapsUrl(url)) {
        const name = parts[1] || '';
        const location = parts[2] || '';
        if (!name || !location) throw Error(`Row ${index + 1} is a Google Maps reference. Add the business name and location after it, separated by |.`);
        return { name, location, sourceUrl: reference, discoverySource: 'Google Maps reference (user supplied)' };
      }
      const hostname = url.hostname.replace(/^www\./i, '');
      return { name: parts[1] || hostname, location: parts[2] || '', websiteUrl: reference, discoverySource: 'Official website (user supplied)' };
    }
    const [name, location, website = '', maps = ''] = parts;
    if (!name || !location) throw Error(`Row ${index + 1} needs a business name and location.`);
    return {
      name,
      location,
      ...(website ? { websiteUrl: normalizeHttpUrl(website, `Row ${index + 1} website`) } : {}),
      ...(maps ? { sourceUrl: normalizeHttpUrl(maps, `Row ${index + 1} Maps reference`), discoverySource: 'Google Maps reference (user supplied)' } : { discoverySource: 'Manual quick import' }),
    };
  }).map(row => { createBusinessRecord(row); return row; });
}

export function mergeImportedBusiness(existing: BusinessRecord, incoming: BusinessRecord): BusinessRecord {
  return {
    ...existing,
    category: existing.category || incoming.category,
    websiteUrl: existing.websiteUrl || incoming.websiteUrl,
    websiteStatus: existing.websiteStatus === 'unknown' ? incoming.websiteStatus : existing.websiteStatus,
    rating: existing.rating ?? incoming.rating,
    reviewCount: existing.reviewCount ?? incoming.reviewCount,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    sourceUrl: existing.sourceUrl || incoming.sourceUrl,
    profiles: [...new Set([...existing.profiles, ...incoming.profiles, ...(existing.sourceUrl || !incoming.sourceUrl ? [] : [incoming.sourceUrl])])],
    discoverySource: existing.discoverySource || incoming.discoverySource,
    updatedAt: new Date().toISOString(),
  };
}

export function importBusinessRows(rows: BusinessImportRow[], businesses: BusinessRecord[]) {
  let next = [...businesses];
  let added = 0;
  let merged = 0;
  for (const row of rows) {
    const record = createBusinessRecord(row);
    const index = next.findIndex(item => sameBusiness(item, record));
    if (index < 0) { next = [record, ...next]; added++; }
    else { next[index] = mergeImportedBusiness(next[index], record); merged++; }
  }
  return { businesses: next, added, merged };
}
