import { describe, expect, it } from 'vitest';
import { pageForRoute, routeForPage } from './pageRouting';

describe('browser page routing', () => {
  it('round-trips every application destination through a stable URL', () => {
    for (const page of ['Business Opportunities', 'Pipeline', 'Follow-ups', 'Settings', 'Find Websites', 'Discover Prospects', 'Overview', 'Leads', 'Website Analyzer', 'Outreach']) {
      expect(pageForRoute(routeForPage(page))).toBe(page);
    }
  });

  it('leaves section anchors and unknown routes unclaimed', () => {
    expect(pageForRoute('#v2-import')).toBeNull();
    expect(pageForRoute('#/missing-page')).toBeNull();
  });

  it('rejects routes for unknown page names', () => {
    expect(() => routeForPage('Not a page')).toThrow('Unknown application page.');
  });
});
