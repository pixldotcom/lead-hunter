# Lead Hunter: single-user production setup

Prepared 18 October 2026. Code and disposable local tests only. No commit, push, deployment, hosted Auth configuration, hosted migration, policy change, or production-data modification was performed. This is the current setup guide; it supersedes earlier per-user/three-variable instructions.

## Confirmed configuration failure

The current ignored `.env.local` has an empty `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. They reach Node as empty strings. The local `APP_ORIGIN` is correct. Before the file was created, all three variables were absent and the old validator threw `ERR_INVALID_URL` on `new URL('')`. This is not evidence of a bad existing Supabase project.

`npm run dev` runs Node 24 with `--env-file-if-exists=.env --env-file-if-exists=.env.local`, then `server/dev.mjs` starts sibling frontend and backend processes inheriting that environment. Later env files override earlier files; existing shell variables take precedence over both. The backend does not load `.env.test.local` or Vite-specific dotenv files. Restart after editing configuration: the backend caches initialization.

The browser requests `/api/auth/session` at 127.0.0.1:5173. Vite preserves Host and proxies `/api` to Node at 127.0.0.1:5174, where `server/start.ts` uses the same guarded handler as the Vercel entries. Valid configuration plus no session returns 401, not a successful connection claim. Missing/invalid configuration returns 503 `AUTH_CONFIG`; logs report only fixed field names/reason labels and sanitized stack locations. The UI distinguishes configuration, owner denial, origin denial, and network errors.

## Existing Supabase project: manual owner setup

These are reviewable instructions, **not executed remote changes**. Obtain approval before applying hosted configuration or SQL changes.

1. Open your existing project in the Supabase Dashboard. In **Connect**, copy the **Project URL**, an HTTPS API origin such as `https://<project-ref>.supabase.co`, not a database connection string. In **Settings → API Keys**, copy the publishable key beginning `sb_publishable_`. A legacy `anon` JWT is supported. Do not use `sb_secret_`, `service_role`, a management token, or a database password. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
2. In **Authentication → configuration/sign-up settings**, disable **Allow new users to sign up** and anonymous sign-in. Keep email/password login enabled; disable unused OAuth/phone providers. There is no signup endpoint in this app, but the provider's own signup API must also be closed. Dashboard labels can vary; verify `/auth/v1/settings` reports `disable_signup: true`. [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
3. In **Authentication → Users**, use your existing owner account if already created. Otherwise manually add the one email/password account, confirm its email through the Dashboard, and keep its password privately. Copy the account UUID and email. Do not create another account merely to resolve the configuration error. `OWNER_USER_ID` is the authorization boundary; `OWNER_EMAIL` also binds the account email and restricts unauthenticated recovery requests without needing an admin key. [Supabase users](https://supabase.com/docs/guides/auth/users).
4. Review/export existing database data and application backups before changing access rules. Check which migrations are already applied. Apply `supabase/migrations/202610170001_cloud_workspace.sql` only if the baseline schema is not installed, then apply `supabase/migrations/202610180001_single_owner.sql` once. Do not rerun the baseline against existing tables. The new migration moves the existing transaction implementations into a private schema and adds owner-checked public wrappers; it does not replace or delete records.
5. After reviewing the UUID, seed the private database owner registry using the SQL Editor as the project administrator. Replace the placeholder below with exactly the same UUID used for `OWNER_USER_ID`:

```sql
begin;
insert into lead_hunter_private.owner (singleton, user_id)
values (true, 'REPLACE_WITH_OWNER_UUID'::uuid);
commit;
```

This intentionally fails if a registry row already exists; inspect it before making any deliberate owner change. The UUID must already exist in `auth.users`. Do not expose `lead_hunter_private` in Data API settings or grant API roles access to it. An empty registry denies everyone. API roles cannot enroll themselves or change the owner. Existing non-owner records remain stored but inaccessible; this setup never reassigns or deletes them.

The private singleton cannot read environment variables. Keeping its UUID equal to `OWNER_USER_ID` is an explicit setup requirement. Both application authorization and database authorization must pass. All ten public tables retain RLS. Direct SELECT requires `auth.uid() = user_id` and `lh_is_owner()`; direct writes are revoked. Both RPC wrappers authorize the owner before running the original user-bound transactions. No service-role key is used. See [schema details](supabase-schema.md).

## Local environment

The prepared `.env.local` is gitignored and contains no invented credentials. Fill it privately:

```dotenv
SUPABASE_URL=https://YOUR_EXISTING_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_EXISTING_PUBLISHABLE_OR_ANON_KEY
APP_ORIGIN=http://127.0.0.1:5173
OWNER_USER_ID=YOUR_MANUALLY_CREATED_OWNER_UUID
OWNER_EMAIL=YOUR_OWNER_ACCOUNT_EMAIL
```

These labels are placeholders, not valid settings. `.env.example` documents the same five names. Do not use frontend `VITE_` variables. Do not add `NODE_ENV=production` or `VERCEL=1` to the local env file. In development the only accepted configured application origin is exactly `http://127.0.0.1:5173`; localhost, different ports, paths and trailing slashes are rejected. Vite uses a strict 5173 port so it cannot silently change the origin. Production requires an exact canonical HTTPS origin instead. Request Host/Origin checks remain active in both modes.

Stop the running development command with Ctrl+C, then:

```powershell
npm.cmd run dev
```

Use `http://127.0.0.1:5173/`. A fresh anonymous session should receive 401 and show the login form. A verified owner login should succeed. Other valid accounts receive 403 `OWNER_REQUIRED`. Empty or invalid fields continue to fail closed with a safe server diagnostic, rather than a fake connection success.

## Recovery and sessions

For production, set Supabase Auth **Site URL** to the canonical production `APP_ORIGIN`; add the exact permitted recovery redirect `APP_ORIGIN/?recovery=1`. For local recovery testing, add `http://127.0.0.1:5173/?recovery=1` explicitly. Do not use broad wildcard production redirects.

Use your existing SMTP sender/configuration in Supabase. Review the existing [email template and acceptance steps](deployment.md#password-recovery--smtp). The reset template must carry the token hash to the app; for recovery at both allowed origins use the validated `RedirectTo` value:

```html
<h2>Reset your Lead Hunter password</h2>
<p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Set a new password</a></p>
```

This app always supplies an allowlisted `/?recovery=1` redirect, so the appended query parameters use `&amp;`. Configure exact allowed redirects first. Do not switch the Site URL from production to local just to test locally. Supabase email rendering/delivery is a manual acceptance gate; the local fixtures do not prove delivery. See [Supabase email-template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

The UI removes the token hash from browser history before exchanging it via POST. Only recovery sessions matching the configured owner UUID/email receive cookies or can update a password. Invalid/used links fail. Requests for other email addresses receive the same generic message but do not send email. A supplied unauthorized session is denied on auth routes too. Login/OTP responses for non-owners clear cookies, return 403 without tokens, and attempt to revoke the newly issued local Supabase session.

Supabase manages sessions. The server verifies access tokens with `auth.getUser`, refreshes expired sessions, verifies the refreshed user, and checks the owner before issuing cookies. Cookies are HttpOnly, SameSite=Strict, Path=/, host-only; production uses Secure and `__Host-` prefixes. Logout requires an authenticated owner, revokes the current refresh session, and clears cookies. As with Supabase normally, an already issued access token can remain valid until expiry; app authorization and database owner checks apply on each use. No password, cookie, token or environment value is logged.

## Vercel settings and environment scopes

### Private subdomain and search indexing

For `leads.pixldot.com`, add that domain to the existing Vercel project's Domains settings and configure the exact DNS record Vercel displays at your DNS provider. After domain verification/TLS, use `APP_ORIGIN=https://leads.pixldot.com` in Production and update Supabase's Site URL and exact recovery redirect to `https://leads.pixldot.com/?recovery=1`. Redeploy after changing environment settings. Local APP_ORIGIN stays `http://127.0.0.1:5173`.

The HTML includes a robots `noindex, nofollow, noarchive` meta tag, and Vercel adds the same X-Robots-Tag to all project paths, including APIs and assets, on the custom and Vercel domains. These controls take effect online only after deploying the updated source. Do not add a robots.txt `Disallow: /`: crawlers must be able to retrieve the public login page to observe noindex. Protected data remains behind owner authentication and RLS. Noindex requests exclusion by compliant search engines; it is not an access restriction or an absolute guarantee against discovery. Do not submit this subdomain in a sitemap. If already indexed, use Google Search Console Removals for temporary hiding while Google processes the permanent noindex rule. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

After an approved deployment, verify `curl.exe -I https://leads.pixldot.com/` contains `X-Robots-Tag: noindex, nofollow, noarchive`, and the HTML source contains the robots meta tag. No domain, DNS, or production configuration was changed by the local source edit.

Use the existing React/Vite frontend and Node/TypeScript backend. Select the repository root, framework **Vite**, Node **24.x**, install `npm ci`, build `npm run build`, output `dist`. `api/**/*.ts` creates separate Node Functions with a 60-second duration. `dist` alone is not a deployable API. The TypeScript relative-import rewriting fix remains enabled so emitted `.js` entries import packaged `.js` dependencies. Security headers and no-store API responses remain configured in `vercel.json`.

| Variable | Production scope | Local development | Preview scope |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Existing project's HTTPS API origin | Existing approved development/project URL | Leave unset, or use an explicitly isolated test project |
| `SUPABASE_PUBLISHABLE_KEY` | Same project's publishable/anon key | Matching publishable/anon key | Never provide production settings to untrusted previews |
| `APP_ORIGIN` | Exact canonical HTTPS app origin, no trailing slash | `http://127.0.0.1:5173` | Exact approved HTTPS preview origin if enabled |
| `OWNER_USER_ID` | Manually created owner UUID matching database registry | Same intended account in the selected project | Test-project owner UUID if enabled |
| `OWNER_EMAIL` | That owner account's email | Same intended account's email | Test-project owner email if enabled |

Keep all five server-side. Vercel supplies production/runtime flags; do not add a development bypass. Leave previews unconfigured by default so they fail closed. Changes to Vercel env values require a new deployment. Do not upload `.env.local`; `.gitignore` and `.vercelignore` exclude environment files. [Vercel environment scopes](https://vercel.com/docs/environment-variables).

### Login and recovery rate limiting

The app limits 10 login/token-verification attempts and 3 recovery-email requests per 15 minutes per running function instance, with HTTP 429 and Retry-After. These counters are bounded but reset on cold starts and are not distributed across Vercel instances. Supabase applies its own provider limits as well.

Before production use, configure a **Vercel Firewall rate-limit rule** for POST paths `/api/auth/login`, `/api/auth/recover`, `/api/auth/recovery`, using the source IP, e.g. 10 requests/60 seconds with 429 response. Review account support/limits and test the rule. This uses the hosting platform, not a new service. Treat this dashboard step as a release gate; local counters alone do not provide a distributed production limit. No firewall rule was changed by this work. [Vercel rate limiting](https://vercel.com/kb/guide/add-rate-limiting-vercel).

### Manual release commands — not run

After reviewing changes, configuring Auth/database/environment/firewall, and approving release, authenticate and link the existing project. Stop on any failed command:

```powershell
npx.cmd --yes vercel@64.5.0 login
npx.cmd --yes vercel@64.5.0 link
npx.cmd --yes vercel@64.5.0 pull --yes --environment=production
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npx.cmd --yes vercel@64.5.0 build --prod
```

Inspect generated functions, then publish only after approval:

```powershell
npx.cmd --yes vercel@64.5.0 deploy --prebuilt --prod
```

The authenticated linked-project production build has not been run here because usable Vercel credentials are unavailable. The account-free compiler smoke check below does not verify hosted settings. No deployment command has been executed.

## Existing data and acceptance gates

Keep the existing export/full-backup/import panel and per-account IndexedDB recovery buffers. No migration runs automatically against localStorage, and this setup does not overwrite or clear it. Export a source backup first at the old origin, preview the import at the destination, confirm the backup, then import explicitly. Existing cloud duplicates win; source hashes prevent identical imports, revisions prevent conflicting replacements, and pre-save snapshots remain available. Full-cloud backups include all data; CSV is intentionally narrower. See [migration workflow](deployment.md#safe-one-time-local-migration).

Local checks:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:local-config
npm.cmd run test:cloud
npm.cmd exec --yes --package vercel@64.5.0 -- node scripts/build-function-smoke.mjs
```

The suite covers missing/invalid/valid configuration, exact local/production origins, Node env-file inheritance, safe diagnostic redaction, owner/invalid/non-owner login, session expiration/refresh/logout, owner/non-owner/used recovery links, rate limiting, direct anonymous 401 and unauthorized 403 API calls, and denial of analyzer execution. Real embedded PostgreSQL applies the new migration and verifies owner/row RLS, direct RPC denial, denied self-enrollment/private helpers/direct writes, empty-registry denial and preserved pre-existing data. Baseline transaction/conflict/idempotency/import tests remain in place.

Compiled-app browser checks use synthetic Auth plus real embedded PostgreSQL: independent browser profiles, persistence, unauthorized account denial, backup-first legacy import without localStorage writes, offline reload/retry, lost-response idempotency, drafts/preferences, recovery, and responsive layout. The isolated Vite check uses ports 15173/15174 so it does not stop the user's existing dev server; it validates the real configured local origin before relocating only its test handler. No synthetic settings are written into application env files.

Local tests cannot prove hosted Auth, SMTP, Vercel settings, or physical-device synchronization. After approved deployment, manually verify on the canonical domain: anonymous 401; owner login/session; non-owner direct API 403 using a separately obtained valid session in an approved test environment; logout/expired session; email recovery; synthetic save visible after login in another real device/browser; backup export; import preview/duplicates; failed-save recovery. Do not create non-owner production accounts or replace real records to run tests. Use an already designated disposable test project for the optional `test:supabase` runner, with test user A configured as its database owner. Missing test settings report NOT RUN. This work does not request a new project or key rotation.

### Actual results for this change

- Full suite: **317 tests passed in 23 files**.
- Typecheck and production frontend build: **passed**.
- Cached Vercel CLI 64.5.0 / Node builder: emitted session function imports successfully; anonymous request **401**, foreign origin **403**. This is an account-free compiler/package test, not a linked-project `vercel build --prod`.
- Real Vite/Node/browser configuration checks: missing fields produce **503 AUTH_CONFIG** and the configuration warning; valid synthetic settings produce **401 AUTH_REQUIRED**, the login form, and correct warning recovery/network-error feedback.
- Compiled frontend + embedded PostgreSQL + controlled Auth browser acceptance: **passed**, including a second account denied at login and the existing export/migration/offline/recovery/persistence workflows.
- Hosted `test:supabase`: **NOT RUN**, because `.env.test.local` and its required settings are absent. No hosted calls or writes occurred.
- Real owner credentials, email delivery, physical devices, hosted settings, firewall enforcement, and production invocation logs: **not verified**. No hosted setup or release was attempted.

## Changed files for this setup

- `server/supabaseConfig.ts`, `.env.example`, ignored `.env.local`: required owner UUID/email, safe validation and exact development origin.
- `server/supabaseApp.ts`, `src/PrivateWorkspace.tsx`: owner authorization across auth/data/analyzer APIs and correct UI denial.
- `supabase/migrations/202610180001_single_owner.sql`: private singleton, RLS tightening, protected RPC wrappers; **unapplied remotely**.
- `server/ownerApi.test.ts`, `server/ownerDatabase.test.ts`, `server/supabaseConfig.test.ts`, `server/supabase.test.ts`, `server/deployment.test.ts`: API, migration, configuration and entry-point coverage.
- `scripts/testCloudFixture.mjs`, `scripts/cloud-browser.mjs`, `scripts/local-config-browser.mjs`, `scripts/production-function-smoke.mjs`, `scripts/supabase-integration.mjs`: single-owner fixtures, browser and optional hosted checks.
- `README.md`, `docs/deployment.md`, `docs/supabase-schema.md`, `docs/local-supabase-config.md`, this guide: current setup and historical-scope clarification.
