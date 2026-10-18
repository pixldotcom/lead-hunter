# External search buttons — 17 October 2026

Updated the existing Find Websites screen with two consistent dark-theme external search actions, a generated-query selector, new-tab labels, keyboard focus/hover/disabled states and a direct paste/save handoff. Desktop actions sit side by side and stack on narrow screens at the default 175% text scale. They remain outside the automatic-search fieldset and do not depend on provider setup or loading. No new API, dependency, scraping or import behavior was introduced.

The user confirmed permission for both logos. Official Google and Microsoft Bing PNG assets are now stored locally under `public/brands/`, with source URLs and trademark attribution in `public/brands/README.md`. Original colors and aspect ratios are preserved on white backing plates; decorative images do not duplicate the accessible link names. The buttons retain their independent loading behavior, keyboard focus and responsive layout.

Source: https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/mscle/documents/presentations/Bing_Trademark_Guidelines_2026.pdf
Google reference: https://about.google/brand-resource-center/guidance/

Additional completion files: `public/brands/google.png`, `public/brands/microsoft-bing.png`, `public/brands/README.md`.

Changed files: src/ExternalSearch.tsx (new component), src/QuickSearch.tsx (replace plain links), src/Discover.tsx (paste-section anchor), src/style.css (scoped action styles), src/ExternalSearch.test.ts (encoding/render/disabled checks), scripts/external-search-browser.mjs (browser verification), this report.

Validation:
- All 261 tests across 13 files passed.
- TypeScript check and production build passed (1,601 modules).
- External-search browser smoke passed: all generated query variants including punctuation and Unicode decode to the expected query for both engines; actual Google and Bing new tabs are created; keyboard navigation, 175% desktop/mobile layout, disabled invalid options, paste focus and unchanged storage verified.
- Existing quick-search browser smoke passed: manual import, dedup, review, CSV, reload persistence, controlled API saves, cancellation and storage-failure retry.

The first new browser run checked focus while external tabs had moved the original page into the background. The test now returns the original page to the foreground before checking the paste shortcut; the missing paste-section anchor was also corrected before the passing run.

Browser checks used disposable profiles and local services. No prospect data was imported by opening search links. External engine results and availability are outside the app's control. No commit or push was performed.

After logo integration: all 261 tests, typecheck and production build passed again. The browser smoke also verifies both local logo images load successfully.
