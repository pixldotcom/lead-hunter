# Lead Hunter cloud deployment — Supabase + Vercel

Prepared locally on 17 October 2026. No hosted project, account, SQL migration, Git commit/push or Vercel deployment has been created or modified. Perform remote steps only after release approval. This guide supersedes earlier fixed-password/local-storage deployment instructions.

## Architecture and configuration

Keep the private GitHub repository, React/Vite frontend (`dist`) and Vercel Node.js 24 Functions (`api/`). The Node backend handles Supabase Auth, stores access/refresh tokens in HTTP-only cookies and forwards the authenticated user's JWT to PostgreSQL through the Supabase Data API. It never uses a service-role key. The browser communicates only with same-origin APIs; there is no browser Supabase client or VITE_ credential. No local development server, filesystem database or Vite proxy runs online.

In **Vercel > Project > Settings > Environment Variables**, set these for **Production**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Dedicated production project's HTTPS API URL, e.g. `https://PROJECT_REF.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | That project's `sb_publishable_...` key (a legacy anon key is also accepted); never service_role or sb_secret |
| `APP_ORIGIN` | Exact canonical HTTPS application origin, e.g. `https://lead-hunter-yourname.vercel.app`, without a trailing slash |

Use the **Connect/API Keys** areas of your Supabase project dashboard to obtain the URL and publishable key. Although publishable keys are designed to be public, this application keeps this configuration server-side. Authentication does not rely on the publishable key as a password: Supabase verifies the user's JWT and database policies enforce ownership.

Remove obsolete `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SESSION_SECRET`, `AUTH_SESSION_TTL_SECONDS` and Brave variables from the eventual hosting project. They are no longer used by production. Vercel supplies its production environment flags; they enable Secure and __Host- cookies. Cookies are HTTP-only, SameSite=Strict and host-only. Access cookies use Supabase's expiration; refresh cookies are retained for up to 30 days, subject to Supabase session policies and revocation. The server verifies the user remotely and refreshes expired access sessions. A valid session is required for every record/analyzer operation. Same-origin Host/Origin checks and noncacheable API responses are retained.

Production endpoints: `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/auth/recover`, `/api/auth/recovery`, `/api/auth/password`, `/api/workspace`, `/api/workspace/backup`, `/api/audit`, `/api/health`. There is no signup or automatic-search endpoint. GET session returns only account metadata, not tokens. The analyzer keeps DNS pinning, public-address/redirect checks, 1 MB response limits and cancellation; its application deadline is 35 seconds and configured function duration is 60 seconds. Vercel's static frontend and these functions share an origin; no permissive CORS or production proxy is needed.

## Supabase production setup — after approval

1. Create a **new dedicated Supabase project** in your chosen organization and region, with a strong database administrator password stored privately. Do not reuse a project containing other application records.
2. In **Authentication**, enable email/password login. In the signup/general configuration, **disable Allow new users to sign up**, and disable anonymous sign-in. Do not disable the email login provider itself. There is no registration UI/API in Lead Hunter, but disabling provider signup is also required to prevent direct provider registration.
3. Create your own confirmed email/password user through **Authentication > Users > Add user**. The application needs no administrator credential or user-creation code. Use a password manager. Each confirmed user has a separate workspace; there is no shared organization workspace.
4. Apply `supabase/migrations/202610170001_cloud_workspace.sql` once through the project's SQL Editor, or use Supabase CLI migrations if preferred. Review before running; this is a remote schema deployment and requires approval. The migration wraps creation in a transaction. Do not rerun its CREATE statements against an already initialized schema; later changes should be new versioned migrations.
5. Confirm every `lh_` public table has RLS enabled. Check the SQL schema/security guide (`docs/supabase-schema.md`). Authenticated clients can only read their own rows; table writes are revoked, and narrow RPC functions perform owner-bound transactions.
6. Set Auth **Site URL** to the final `APP_ORIGIN`. Add only the exact allowed recovery redirect `APP_ORIGIN/?recovery=1`; avoid broad production wildcards or unrelated domains.
7. Configure SMTP and the password-recovery email template as below. Verify recovery using your own inbox before relying on it.
8. Put the production project URL/key/origin in Vercel's Production environment and redeploy after any change. Missing/invalid configuration blocks access. Secret/service-role keys are explicitly rejected.

## Password recovery / SMTP

Use your own SMTP sender under **Authentication > Email/SMTP settings**. Supabase's default sender is restricted to project-team addresses, rate-limited and intended for testing, not dependable production recovery. SMTP credentials belong only in the Supabase dashboard, never in the frontend or source repository. Review the sender's current plan and delivery terms; no free allowance is guaranteed.

In **Authentication > Email Templates > Reset Password**, use a link to the application carrying the token hash, rather than the default fragment/ConfirmationURL flow:

```html
<h2>Reset your Lead Hunter password</h2>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&amp;type=recovery">Set a new password</a></p>
```

Configure Site URL without an extra trailing slash. The app removes the token from browser history, verifies it through Supabase on the server, then displays the new-password form. It never receives a service-role key. Invalid/expired/used links show an error. Set a 12-character-or-longer recovery password (and follow stronger provider requirements if configured).

Acceptance check: request a reset from the app, receive the message, open it in a fresh browser, update the password, confirm the old password fails and the new password logs in, and verify saved records still belong to that user. Provider email delivery is a real external check; local controlled Auth fixtures do not prove SMTP works.

## GitHub and Vercel — after approval

1. Create an empty **private** GitHub repository. The local repository still has an uncommitted baseline and no configured remote. Review `git status --short --untracked-files=all`; real `.env` files, exports, device recovery files, dependencies and build output are ignored.
2. After approval, stage the explicit source allowlist, review the entire staged diff, then commit/push:

```powershell
git add .gitignore .vercelignore .env.example .env.test.example README.md package.json package-lock.json index.html tsconfig.json vite.config.ts vercel.json src server api public scripts docs supabase
git diff --cached --stat
git diff --cached
```

Only after reviewing for credentials/private records:

```powershell
git commit -m "Integrate private Supabase cloud workspace"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/lead-hunter.git
git push -u origin main
```

3. In Vercel choose **Add New > Project**, import this private repository, repository root, framework **Vite**, Node **24.x**, install `npm ci`, build `npm run build`, output `dist`. These settings/functions/security headers are in `vercel.json`. No production start/dev command is required.
4. Set the three production variables above before deploying. The Supabase Site URL/email template and APP_ORIGIN must match the final canonical Vercel/custom domain. Correct the origin and redeploy if Vercel assigns a different project name/domain.
5. Keep Preview variables empty (fail closed), or configure a separate nonproduction Supabase project and exact preview origin. Never give untrusted preview branches production credentials. Imported repo pushes can trigger automatic Vercel deployments, so retain release approval discipline for future pushes.
6. After approval, deploy, inspect the Functions list and perform hosted acceptance checks: anonymous API denial, login/logout/recovery, one public analyzer scan and private-target rejection, a synthetic record visible in two independent browsers, a second user's isolation, full backup/export and a failed-save/retry. Then import real local data as described below.
7. Configure Vercel firewall rate limiting for login/recovery before routine public use: conditions paths `/api/auth/login` or `/api/auth/recover` or `/api/auth/recovery`, method POST; fixed-window source-IP rule, e.g. 10 requests / 60 seconds, response 429. Review the dashboard's current limits/terms before publishing. Built-in counters allow 10 login/token-verification attempts and 3 recovery-email requests per 15 minutes **per running function instance**, and reset on cold starts; they are basic protection, not distributed limits. Supabase also applies its own Auth limits.

Vercel/Supabase plan eligibility, quotas, uptime, database backups and charges are account-specific; no unlimited/free-production guarantee is made. The app is ready for hosted acceptance after configuration, not certified as deployed by local builds.

## Safe one-time local migration

No migration runs automatically. Legacy localStorage keys are never overwritten or cleared by this implementation.

1. From the old local origin, retain a complete copy of all original data. The new **Import existing local data or a full cloud backup** panel can download a raw local backup and preview it when opened on the same origin/profile. The raw backup includes leads, discovery, drafts, text-size preference and legacy recovery keys. Browser download completion must be confirmed by you; a requested download is not proof that the OS saved it.
2. If old records only exist at `http://127.0.0.1:5173`, the online origin cannot read them. Before retiring that local setup, export the raw local backup from that origin. Alternatively use DevTools Application > Local Storage to copy those key/value strings into the raw-envelope format below and save privately. Existing lead/discovery JSON alone excludes outreach drafts. The new import panel accepts a full raw envelope or full cloud backup; original lead JSON/CSV and discovery JSON remain supported by their respective existing screens.
3. Log into the final online account, open the panel and choose the saved file. Download a source backup, review additions and check the backup confirmation before importing. Only import data that belongs to this account.
4. Existing cloud lead domains, prospect domains and per-lead drafts win on duplicates. Lead-ID collisions are remapped, draft/prospect links are reconciled, promoted prospects and batch history are preserved, and orphaned draft records are retained in backups. A brand-new account can adopt source preferences; existing account preferences are kept. Duplicate records are not silently overwritten or field-merged; keep the source backup to reconcile different notes/history manually.
5. The entire cloud replacement is one transaction with a revision check. A SHA-256 source marker prevents repeat imports of the identical source. A pre-import cloud snapshot is also preserved server-side. Only after server acknowledgement does the app report import success. Verify counts and representative records in another browser before retiring the old setup.

Raw envelope, whose values are the exact original strings, not parsed objects:

```json
{
  "format": "pixldot-local-backup-v1",
  "stores": {
    "pixldot-lead-hunter-v1": "COPY EXACT JSON STRING HERE",
    "pixldot-discovery-v1": "COPY EXACT JSON STRING HERE",
    "pixldot-outreach-drafts-v1": "COPY EXACT JSON STRING HERE",
    "pixldot-text-scale-v1": "175"
  }
}
```

For a code-only export from the old origin, inspect this snippet before running it in browser DevTools. It reads local data and downloads it; it does not modify storage or send anything to a server:

```js
const keys = Object.keys(localStorage).filter(k => k.startsWith('pixldot-'));
const stores = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
const blob = new Blob([JSON.stringify({format: 'pixldot-local-backup-v1', stores}, null, 2)], {type: 'application/json'});
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = 'pixldot-local-original-backup.json';
link.click();
setTimeout(() => URL.revokeObjectURL(link.href), 1000);
```

Keep exports private, outside Git. Do not paste records, credentials or reset links into this chat or project settings.

## Saving, conflicts, offline recovery and backups

PostgreSQL is the primary store. Confirmed records load from the account on login in any browser. Use **Refresh cloud data** before continuing in another already-open browser. This release uses explicit refresh and whole-workspace revision checks, not realtime collaboration or field-level automatic merging.

Saving shows a pending state and briefly disables actions while the transaction runs. Outreach edits have a short autosave delay and an explicit pending-confirmation notice. A failed write preserves the proposed snapshot in account-scoped IndexedDB; draft input also has an account-scoped device recovery buffer. Legacy localStorage is used only as an explicit migration source, not as the primary or fallback record store. These device buffers are private browser data, not encrypted by the application and not synchronized.

Offline edits are **not** reported as cloud-saved. Keep the tab open, export pending work, or restore the connection and retry. After reload the app loads pending recovery copies before enabling editing. Successful retries reuse the same operation ID, so a lost HTTP response does not duplicate records. If another browser changed the revision, retry stops with a conflict; export pending work, load the newer cloud state and reapply intended field changes manually. There is no silent last-write-wins overwrite or background offline merge.

Logout hides cloud records and revokes this session's refresh token through Supabase; existing access JWTs follow Supabase's configured expiry. Other browser sessions remain active (`local` signout scope). Device recovery copies remain available only when the same account logs into that browser again. Export unresolved work before logging out. A user with physical/profile access can read device caches/legacy stores; login does not encrypt them.

**Export full cloud backup** includes leads, activity/finding history, discovery/reviews/batches, drafts and preferences. Existing lead JSON, discovery JSON, CSV and complete-message exports remain; CSV retains its intentionally narrower fields. Keep independent backups: the last 10 pre-save snapshots in `lh_backups` are application recovery copies, not a substitute for managed PostgreSQL backups or a user-held export. Deleting an active record can leave it in those rolling snapshots until retention removes it.

If valid cloud data cannot load, retry connectivity first. For malformed cloud records, **Download original cloud data** (including any device recovery copies), repair a private full copy, choose that repaired backup and confirm replacement. It is revision-checked and backs up the old state. For a damaged device recovery buffer, export the device copies before explicitly discarding only those copies. Neither action deletes legacy localStorage. If browser storage is blocked/unavailable, recovery protection can block editing/loading; enable IndexedDB or export cloud originals and use a supported browser profile rather than bypassing the protection.

Initial limits: 3 MB validated workspace, 5,000 leads/drafts, existing 1,000 discovery candidates/batches, existing import/scan bounds. This favors a small private acquisition workflow. At a limit, export and review/prune older records; saved data is not silently truncated. Notes/reviews/evidence are structured JSONB to preserve the established validated model. Screenshot references remain references; this phase adds no cloud image/file upload.

## Validation and separate hosted test project

Local checks:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:cloud
npm.cmd audit
```

Tests use an embedded PostgreSQL engine for the actual SQL/RLS/transaction behavior. `test:cloud` serves the compiled frontend with the real Node handler and real PostgreSQL, using a controlled synthetic Auth provider and disposable Chrome profiles. It exercises separate-browser persistence, cross-user isolation, migration, offline/network/lost-response paths, logout and recovery UI. It does not prove hosted Supabase configuration or email delivery.

For hosted integration, create a **second, dedicated test Supabase project** after approval, disable signup, apply the same SQL and manually create two confirmed temporary test users. Do not use production accounts/project. Copy `.env.test.example` to ignored `.env.test.local` and fill its test URL, publishable key, expected project reference and the two user credentials privately. Set `SUPABASE_TEST_ALLOW_WRITES=yes` only after checking the project is disposable. Then:

```powershell
npm.cmd run test:supabase
```

The script refuses missing configuration, checks signup is disabled, requires empty test accounts, and checks hosted Auth, anonymous denial, actual Data API/RLS isolation for all app tables, same-account fresh sessions, transaction conflicts/idempotency and logout. It leaves one synthetic fixture in test user A; delete both temporary users from the test project's Auth dashboard afterward (owned records cascade). It uses no admin/service-role key. A missing configuration is reported as **NOT RUN**, not a passing test.

Hosted test configuration has not been supplied, so these hosted assertions and SMTP delivery have not run. This remains an acceptance gate before declaring the deployment operational.

For local development with a configured test project, copy `.env.example` to `.env`, set its server variables, use exact `APP_ORIGIN=http://127.0.0.1:5173` and run `npm.cmd run dev`. Restart when changing environment values. Vercel production does not need that local folder/server afterward. Historical browser scripts assume the former local-store/fixed-login model; use `test:cloud` for the current cloud workflow. Domain/analyzer/security regressions remain in the full test suite.

## Official references

- [Supabase email/password Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase session/signout behavior](https://supabase.com/docs/guides/auth/signout)
- [Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)

Official documentation checked 17 October 2026. Credentials and remote changes remain owner-controlled.
