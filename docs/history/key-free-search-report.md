# Key-free Find Websites — 17 October 2026

Removed Brave setup instructions, API-key messaging, automatic-search submission, provider status requests, request/quota counters and provider-only country/language/result-limit controls from Find Websites. Category, location and editable keyword/query templates still drive the existing query generator. Google/Bing branded actions follow the form; query selection, new tabs, URL-paste focus and CSV import remain available. No credentials are required for this workflow.

Saved lead, discovery, historical search provenance, review and draft formats are unchanged. Existing backend search adapter code is retained for compatibility but is no longer called by the Find Websites UI; no provider integration was added or invoked. The website analyzer remains separate and available.

Changed: src/QuickSearch.tsx, src/Discover.tsx, src/QuickSearchUI.test.ts, README.md, scripts/quick-search-browser.mjs, scripts/accessibility-search-browser.mjs, scripts/external-search-browser.mjs, this report. Historical completion reports describe the earlier behavior; this report supersedes their automatic-search UI instructions.

Validation: 262 tests across 14 files passed; typecheck passed; production build passed. Chrome external-search, manual quick-search and accessibility checks passed: correct encoded Google/Bing new tabs, keyboard navigation, logo loading, manual URL/CSV import and dedup, saved reviews and reload persistence, bulk decisions, text-size persistence, nine screens at four viewport widths with no page overflow, and no setup prompt. Disposable profiles were used; user browser records were not modified. No commit or push.
