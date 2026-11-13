const pages = ['Business Opportunities', 'Pipeline', 'Follow-ups', 'Settings', 'Find Websites', 'Discover Prospects', 'Overview', 'Leads', 'Website Analyzer', 'Outreach'] as const;
export type AppPage = typeof pages[number];

export function routeForPage(page: string): string {
  if (!pages.includes(page as AppPage)) throw new Error('Unknown application page.');
  return `#/${page.toLowerCase().replace(/\s+/g, '-')}`;
}

export function pageForRoute(hash: string): AppPage | null {
  if (!hash.startsWith('#/')) return null;
  const slug = hash.slice(2).toLowerCase();
  return pages.find(page => page.toLowerCase().replace(/\s+/g, '-') === slug) ?? null;
}
