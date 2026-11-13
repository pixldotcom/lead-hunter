import { describe, expect, it } from 'vitest';
import { pageForRoute, routeForPage } from './pageRouting';

describe('page routing', () => {
  it('maps every application destination to a stable direct route', () => {
    for (const page of ['Business Opportunities', 'Pipeline', 'Follow-ups', 'Settings', 'Find Websites', 'Discover Prospects', 'Overview', 'Leads', 'Website Analyzer', 'Outreach']) {
      expect(pageForRoute(routeForPage(page))).toBe(page);
    }
  });

  it('does not treat in-page section anchors as application routes', () => {
    expect(pageForRoute('#v2-import')).toBeNull();
    expect(pageForRoute('#/missing-page')).toBeNull();
  });
});
