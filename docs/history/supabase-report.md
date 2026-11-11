# Supabase cloud implementation report

Prepared 17 October 2026. Implemented and validated locally; not deployed. No Git staging, commit, push, remote configuration, hosted project creation or hosted SQL execution occurred.

The requested architecture now uses Supabase email/password Auth and PostgreSQL through same-origin Node/Vercel Functions. React/Vite and the established application models remain. The owner selected a new dedicated production project and a separate test project; neither project's configuration has been supplied. Hosted acceptance remains required.

## Delivered behavior

- Login, session restoration/refresh, logout and password recovery. No registration UI or application signup endpoint. Provider-side signup and anonymous login must also be disabled during setup.
- Server-only Supabase configuration and HTTP-only, SameSite cookies, Secure in production. No service-role key, frontend credential or browser token persistence. Protected workspace/analyzer APIs verify the Supabase user; requests also enforce the canonical origin.
- PostgreSQL records for leads, prospects, discovery batches/reviews/evidence, notes, outreach drafts, ordered activity history and preferences. Ten tables have RLS; authenticated direct writes are revoked. Owner-bound transactional RPCs handle saves, revision conflicts, idempotent retries and rolling backups.
- Cloud acknowledgement before success, saving/error/retry states, account-scoped device recovery copies, offline reload recovery and stale-draft conflict protection. Another browser can load confirmed records; already-open browsers use explicit refresh rather than realtime subscriptions.
- Explicit backup-first legacy import, duplicate detection and ID/link reconciliation. Existing cloud duplicates win. Legacy localStorage is read only and is neither cleared nor silently imported. New-account preference import is explicit; the normal default remains 175%.
- Existing manual Google/Bing queries, URL/CSV ingestion, review/audit links, analyzer SSRF safeguards, proposal workflow and export/recovery features retained. No search API or automatic external-result import introduced.

## Files changed or added for this phase

| Files | Purpose |
| --- | --- |
| `server/supabaseApp.ts`, `server/production.ts`, `server/start.ts`, `api/**` | Auth, protected APIs, production routing and server-only provider access |
| `supabase/migrations/202610170001_cloud_workspace.sql` | Versioned schema, RLS, permissions, transactional load/save and backups |
| `src/cloudModel.ts`, `src/CloudWorkspace.tsx`, `src/recoveryQueue.ts`, `src/MigrationPanel.tsx` | Validation, cloud persistence, device recovery, conflict handling and local migration |
| `src/PrivateWorkspace.tsx`, `src/useDrafts.ts`, `src/main.tsx`, `src/Discover.tsx`, `src/discoveryProcessing.ts`, `src/LeadDetail.tsx`, `src/TextSizeSettings.tsx`, `src/style.css` | Login/recovery and acknowledged cloud saves throughout the existing workflows |
| `src/domain.ts`, `src/dataValidation.ts`, `src/discovery.ts`, `src/manualReview.ts`, `src/draftPersistence.ts` | Shared validators loadable by Node without duplicating model rules |
| `src/cloudModel.test.ts`, `server/cloudDatabase.test.ts`, `server/supabase.test.ts`, `server/deployment.test.ts` | Migration, SQL/RLS, authentication, API and deployment regressions |
| `scripts/testCloudFixture.mjs`, `scripts/cloud-browser.mjs`, `scripts/supabase-integration.mjs`, `scripts/deployment-smoke.mjs` | Controlled local acceptance, compiled-app browser testing and separate hosted test gate |
| `package.json`, `package-lock.json` | Supabase SDK, embedded PostgreSQL test engine, current test runner and commands |
| `.env.example`, `.env.test.example`, `.gitignore`, `.vercelignore`, `README.md`, `docs/deployment.md`, `docs/supabase-schema.md`, this report | Configuration, private-file exclusions and release handoff |

Historical fixed-login modules remain regression helpers, outside the production entry point. Earlier local-storage reports/browser scripts describe previous phases and are not evidence of current cloud acceptance.

## Final local validation

| Check | Result |
| --- | --- |
| `npm.cmd test` | PASS: 289 tests across 19 files |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS: 1,606 modules; compiled frontend generated |
| `npm.cmd run test:cloud` | PASS against compiled frontend, real Node handler and embedded PostgreSQL, with controlled Auth |
| `npm.cmd audit` | PASS: zero reported vulnerabilities |
| Source/compiled-bundle checks | PASS: key-pattern scan; no server configuration or controlled Auth fixtures in frontend output; no configured environment files |
| Git release state | Nothing staged; no remote; original baseline remains uncommitted |
| `npm.cmd run test:supabase` | NOT RUN: missing separate hosted test project configuration; exits nonzero intentionally |

SQL tests execute the actual migration in embedded PostgreSQL with authenticated/anonymous roles and user identity settings. They cover all ten tables' RLS, cross-user reads, denied direct writes, transactional rollback, conflicts, retries, import markers, backups and account-deletion cascades. These are real local SQL assertions, not hosted Supabase claims.

The disposable-Chrome test covers invalid/valid controlled login, unauthorized API access, backup-first import without modifying legacy values, leads/prospects/review/draft/preference saves, failed-save retry, verified network disconnection and reload recovery, lost-response idempotency, stale recovered drafts refusing to replace another browser's newer draft, separate-browser persistence, a second user's isolation, logout and controlled recovery. Desktop and mobile overflow checks pass at 175%. Existing session expiration/refresh paths are covered by server tests. Browser tests do not certify every screen/device combination or actual OS download completion.

## Required setup and remaining acceptance

Follow [deployment.md](deployment.md) for exact GitHub/Vercel, SQL, SMTP and import steps. Set **only server-side** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` in Vercel's Production environment. Never use `VITE_`, `sb_secret_` or a service-role key. Configure the new project, manually create the confirmed owner account, disable public signup/anonymous login, apply the reviewed migration and configure the recovery email template/SMTP. Configure distributed hosting-level login/recovery rate limiting; application counters are per function instance.

Before declaring this operational, run the separate hosted integration gate with two disposable test accounts, verify actual email delivery/reset/session behavior and perform hosted Vercel acceptance. Hosted Auth/Data API behavior, deployment packaging, SMTP and production origin/cookie delivery have not been verified remotely. No credentials should be sent in chat.

Cloud storage has a validated 3 MB workspace limit and existing discovery/import bounds. Saves use whole-workspace revision checks, not field-level merges; conflicts require export and manual reconciliation. Device recovery copies remain private browser-profile data, are not application-encrypted and do not sync. Screenshot references are not uploaded image files. Keep independent exports in addition to the ten rolling server snapshots. The app is prepared for release approval and hosted validation; it is not yet online.
