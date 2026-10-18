# PixlDot Lead Hunter

Private cloud workspace for finding, reviewing and managing website prospects. React/Vite frontend + Node.js 24 backend, prepared for Vercel and Supabase Auth/PostgreSQL. **No cloud project, migration, commit, push or deployment has been performed.**

Start with [deployment/setup instructions](docs/deployment.md), [database schema/RLS](docs/supabase-schema.md) and the [cloud integration report](docs/supabase-report.md). These supersede previous local-only/fixed-password phase reports.

## Current workflow

1. Log in with your manually created Supabase email/password account. Public registration must be disabled in Supabase and is absent from the app. Login, logout, session restoration and password recovery use same-origin Node APIs; session tokens stay in HTTP-only cookies.
2. **Find Websites** offers 100 business categories, location and editable keyword/query variants. Choose **Search with Google** or **Search with Bing** to open a new tab. Copy actual business URLs, return, and paste/save multiple URLs or import CSV. There is no paid search API, scraping or automatic result-import claim.
3. Review prospects using **Open Website**, **Review**, **Worth Pursuing**, **Skip** or **Review Later**. Notes, checklist and individual findings are human observations. The app does not visually inspect a website automatically. Advanced **Discover Prospects** retains bounded scans, evidence-based qualification, proposals and lead promotion.
4. Use Leads, Pipeline, Follow-ups and Outreach for sales work. Drafts autosave after a short delay; **pending** does not mean saved. Record actual contact manually. Messages are never sent automatically.
5. Cloud-confirmed records belong to your account and load in other browsers. Use **Refresh cloud data** in an already-open browser. Concurrent editing uses revision checks; conflicts require reviewing and reapplying pending edits rather than silently overwriting another browser.

The official PixlDot logo is `public/Logo-2x.png`, with exact blue `#3757F5` and orange `#E87552`. Default text size is **175%**; Settings offers 100/125/150/175 and saves the preference to the account. Google/Bing artwork is locally served with attribution in `public/brands/README.md`.

## Data, import and recovery

PostgreSQL is the primary store for leads, activities/findings, prospects, reviews, discovery batches/evidence, drafts and preferences. Every exposed application table has RLS and owner-scoped access. Direct table writes are revoked; validated owner-bound RPC transactions handle saves. No frontend service-role/secret key is used.

Existing localStorage data is not uploaded, overwritten or cleared automatically. Use the explicit backup/preview/import panel. For records that exist only on the old local URL, first export the complete raw local envelope from that origin, then import it online. The [deployment guide](docs/deployment.md) covers exact steps, duplicate rules and drafts. Download and confirm a source backup before importing. Existing cloud records win on duplicates; identical imports are idempotent.

**Export full cloud backup** includes all application stores. Existing lead version 1 JSON, discovery JSON, CSV and complete-message exports remain available. CSV intentionally excludes full activity/finding history. Lead/discovery exports do not include the separate draft store; use the full cloud backup for all data. Private exports are Git-ignored.

Failed saves keep proposed work in per-account IndexedDB recovery copies and offer retry/export. Outreach input has its own per-account buffer. A true offline reload is covered by the browser smoke. These unsaved copies are device-specific and not automatically encrypted or synchronized. Export pending edits before logout, account switching or device/browser clearing. Saved cloud records are not deleted by logout. A blocked browser-storage profile can block the recovery safety mechanism.

The database keeps the last 10 pre-save snapshots for recovery. This does not replace independent exports or Supabase-managed backups. Full-cloud recovery can download the original and explicitly restore a validated repaired file with a revision check. Source local records remain untouched.

Initial limits: 3 MB validated workspace, 5,000 leads/drafts and existing 1,000 candidates/batches. The workflow targets small, private batches; no records are silently truncated.

## Analyzer and external tools

The analyzer runs only for explicitly submitted public URLs after authentication. It checks homepage HTML, root robots.txt and sitemap.xml. DNS responses and redirects are validated; connections are DNS-pinned. Private/reserved addresses, credentials and nonstandard ports are rejected. Requests have timeouts, cancellation and response-size limits. JavaScript is not executed. Static evidence cannot establish mobile usability, conversions, rankings, purchasing intent or Core Web Vitals.

Within manual review, **Audit Tools** opens [PageSpeed Insights](https://pagespeed.web.dev/), [The HOTH SEO Audit](https://www.thehoth.com/seo-audit-tool/), [WAVE](https://wave.webaim.org/) and [SSL Labs](https://www.ssllabs.com/ssltest/). Copy/paste the target URL at the external service; these are manual links, not APIs or imported reports. Third-party forms may require details and their own current terms apply.

Manual screenshots: use [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode/) to inspect a viewport and capture screenshots. [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/) and [DevTools accessibility tools](https://developer.chrome.com/docs/devtools/accessibility/reference/) support manual deeper review. Store screenshot URL/time/filename references in the app; image files are not uploaded in this phase. Redesign previews remain labeled concepts with placeholders; review before sharing.

## Run locally / validate

Requires Node.js **24.x**. Install with `npm.cmd ci`. For a real configured test project, copy `.env.example` to a private `.env`, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`, and run `npm.cmd run dev`. The default local origin is `http://127.0.0.1:5173`; use the exact printed host/port and restart after environment changes. Missing config fails closed. Production uses Vercel Functions, not this dev server/proxy.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:cloud
npm.cmd audit
```

`test:cloud` needs standard Windows Chrome. It serves compiled `dist` without Vite, uses real embedded PostgreSQL and controlled synthetic Auth, and creates disposable browser profiles. It tests persistence across browsers and user isolation without touching hosted projects or real records.

`npm.cmd run test:supabase` is the separate hosted integration gate. Configure ignored `.env.test.local` from `.env.test.example`, apply reviewed migrations to a **dedicated test project**, and manually create two temporary test users. It requires explicit test-project/write confirmation, checks signup disabled and refuses nonempty test accounts. Missing credentials produce **NOT RUN**, not success. Actual SMTP delivery and real Vercel HTTPS verification remain separate acceptance steps. See the deployment guide before running.

Dependencies: official `@supabase/supabase-js` for the backend; embedded PostgreSQL `@electric-sql/pglite` is test-only. The old vulnerable test runner was updated to patched Vitest 5.0.5, compatible with existing Vite 6/Node 24. No Supabase admin key is required.

Historical work: [Phase 3](docs/phase-3-report.md), [Phase 5](docs/phase-5-report.md), [previous private-login preparation](docs/private-deployment-report.md). Historical localStorage and fixed-credential behavior is retained as migration/test context, not current production behavior.
