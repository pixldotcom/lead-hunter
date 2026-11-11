# Session function crash investigation — 18 October 2026

Reported invocation: `bom1::np4h5-1792284118034-c59a432f162b`, `/api/auth/session`, HTTP 500 / `FUNCTION_INVOCATION_FAILED`.

## Evidence and limits

Node 24.19.0 imports the original TypeScript entry successfully. The API default export is a Node IncomingMessage/ServerResponse handler; it does not start a server. Supabase client creation is deferred until needed. Missing/invalid server configuration is caught and returns 503, and anonymous sessions with valid configuration return 401 without contacting Supabase. No evidence identifies missing credentials as the invocation crash.

Vercel CLI 64.5.0 was downloaded locally. `whoami` reports logged out; `build --prod --yes` fails to load project settings with an invalid-token error; `dev` requires login and was stopped. No linked project or usable account access is available. Runtime Logs and deployed Node/environment/build settings could not be read. No deployment was performed. The reported invocation's exact stack is therefore **not confirmed**.

An independent local reproduction uses the CLI's `@vercel/node` 24.0.3 builder with the installed TypeScript 5.7.3. Its `meta.isDev` option skips installation/account access but still traces dependencies and compiles the function. This is a compiler/package smoke test, not a complete linked-project production build or Vercel front door emulation.

Before the fix, the materialized output contains `api/auth/session.js` importing `../../server/production.ts`, but only `server/production.js` is packaged. Node throws `ERR_MODULE_NOT_FOUND` on import. This independently demonstrated defect explains how a cold start can fail before any application handler executes; correlate it with Runtime Logs before assigning it as the cause of the reported invocation.

## Changes

`rewriteRelativeImportExtensions: true` tells TypeScript to rewrite relative `.ts` imports to `.js` during Vercel compilation. Source imports remain compatible with direct Node 24 development. Verified emitted session and dependency imports now load. No package upgrade or output-directory change is required.

Production initialization now loads the application within a guarded invocation boundary. Diagnostics distinguish `MODULE_INIT`, `AUTH_CONFIG`, and `REQUEST_FAILED`, with allowlisted module error codes and stack frame locations. Messages, source excerpts, function names, arbitrary properties, headers, body, cookies, tokens, and environment values are not logged. Public errors remain generic and noncacheable. Invalid config still fails closed. Application request exceptions also receive stack diagnostics. Syntax/load failures in the thin entry or diagnostic module itself still require Vercel's runtime logs.

`vercel.json` retains Vite, `npm ci`, `npm run build`, static output `dist`, and separate `api/**/*.ts` Node Functions with a 60-second limit. `dist` is only the frontend; uploading it alone omits the API. `package.json` requires Node 24.x. Verify the actual hosted project uses those settings. Local CLI caches and clean-install copies are now explicitly excluded from deployment uploads. Authentication, origin checks, JWT forwarding, and database RLS are unchanged.

## Verification

Passed: 291 tests in 20 files, `npm run typecheck`, and `npm run build`. The emitted-function smoke test returns 401 / `AUTH_REQUIRED` anonymously and 403 for a foreign origin. It uses synthetic configuration and no Supabase network calls. Existing tests exercise parsed Vercel request bodies, login/logout, secure cookies and database isolation.

Repeat the emitted-function regression check from the repository root (Node 24):

```powershell
npm.cmd exec --yes --package vercel@64.5.0 -- node scripts/build-function-smoke.mjs
```

It writes isolated ignored artifacts under `.vercel/function-smoke-*` and fails if the emitted entry cannot load or authentication does not deny access.

## Exact redeployment steps

1. In Vercel, select the existing Lead Hunter project. Verify repository root, Vite, Node **24.x**, install `npm ci`, build `npm run build`, output `dist`. Verify Production variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN`; the latter must be the canonical HTTPS origin without a trailing slash. Use the publishable/anon key, never a secret/service-role key. Do not print variable values or paste them into logs.
2. From this updated repository root, authenticate and link to that existing project/team, then fetch its Production settings:

```powershell
npx.cmd --yes vercel@64.5.0 login
npx.cmd --yes vercel@64.5.0 link
npx.cmd --yes vercel@64.5.0 pull --yes --environment=production
```

3. Build locally. Stop if any command fails:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npx.cmd --yes vercel@64.5.0 build --prod
```

4. Confirm `.vercel/output/functions` includes the session function and its emitted relative imports resolve to packaged JavaScript. Deploy this newly built output (this publishes to Production):

```powershell
npx.cmd --yes vercel@64.5.0 deploy --prebuilt --prod
```

Do not redeploy an old deployment's source or upload only `dist`, since that does not include this fix. The equivalent Git workflow is to commit/review these changes and deploy that new revision through the existing Vercel integration.

5. At the canonical `APP_ORIGIN`, request `/api/auth/session` in a fresh logged-out browser. Expect HTTP 401 JSON, not 500. Log in and expect HTTP 200 with account metadata; confirm logout returns to 401. A 503 indicates controlled configuration/module/service failure; inspect diagnostics. A 403 indicates an origin/host mismatch and must not be fixed by bypassing the check.
6. Inspect Vercel Project → Logs, select Production and `/api/auth/session`, and locate the reported error ID if retained; otherwise reproduce once and capture the new request ID and stack. Look for `ERR_MODULE_NOT_FOUND` and `production.ts` to confirm the original packaging defect. With the authenticated CLI, retrieve runtime logs locally:

```powershell
npx.cmd --yes vercel@64.5.0 logs --environment production --since 2h --limit 100
```

Keep logs private and redact any platform-generated messages before sharing; application sanitization cannot control Vercel's own loader errors. Historical availability depends on the account's retention. Production acceptance and correlation with the original invocation remain pending account access.

References: [Vercel runtime logs](https://vercel.com/docs/cli/logs), [local builds](https://vercel.com/docs/cli/build), [deployment CLI](https://vercel.com/docs/cli/deploy).
