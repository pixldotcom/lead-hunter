# Local Supabase configuration investigation

**Update: single-owner mode now also requires `OWNER_USER_ID` and `OWNER_EMAIL`; see [current setup](single-user-production.md).** The original missing-file investigation below is historical evidence. `.env.local` has since been created with blank URL/key fields and the correct local origin; those blanks are the currently confirmed cause of configuration failure. Owner fields have been added as blank placeholders. Local validation now accepts only `http://127.0.0.1:5173`; production still requires an exact HTTPS origin. The isolated browser harness validates that canonical origin before relocating its test server.

Investigated on 18 October 2026. No deployment, commit, push, project creation, key rotation, or database change was performed.

## Exact cause

The workspace contains `.env.example` and `.env.test.example`, but no `.env` or `.env.local`. A Node process launched with the development command's environment-file flags receives none of `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `APP_ORIGIN`. The same is true of its inherited child environment. The original validator's first expression, `new URL(env.SUPABASE_URL ?? '')`, therefore throws `TypeError`, code `ERR_INVALID_URL`, with an empty URL input. It never reaches the origin or key checks. The production handler catches that as `AUTH_CONFIG`, builds a handler without configuration, and both session and login return 503.

The already-running local frontend and backend were also requested directly: both `/api/auth/session` endpoints return the old configuration-related 503 JSON. They have not been stopped or restarted, and still serve their originally loaded code/environment.

This is not a demonstrated invalid existing Supabase project or rejected HTTP loopback origin. The validator accepts `APP_ORIGIN=http://127.0.0.1:5173` with a syntactically valid Supabase URL/key in development. HTTPS app origins are required only when `NODE_ENV=production` or `VERCEL=1`. Neither flag is present in the inspected development environment. No security requirement was relaxed.

The previous Vercel import-extension defect in `vercel-session-crash.md` is a separate issue. Here the handler runs and deliberately returns 503. Vercel is outside this investigation's scope.

## Complete request path

1. `PrivateWorkspace` in `src/PrivateWorkspace.tsx` mounts and requests same-origin `GET /api/auth/session` with cookies and no-store caching.
2. Vite on `http://127.0.0.1:5173` proxies `/api` to `http://127.0.0.1:5174`, preserving the browser's Host header (no `changeOrigin` override). Keeping that original host is necessary for the backend's exact application-origin check.
3. `server/dev.mjs` launches Vite and `server/start.ts` as sibling child processes. `start.ts` creates the Node HTTP server on 127.0.0.1:5174 with `productionHandler`.
4. On the first request, `server/production.ts` imports the application, validates configuration, and caches its handler. Invalid configuration is logged once during initialization and fails closed on requests. Fixing environment values requires restarting the backend.
5. With valid configuration, the handler validates Host/Origin, verifies any supplied user session through Supabase, and returns 401 `AUTH_REQUIRED` when no session cookies exist. An anonymous 401 requires no Supabase network request and is not evidence of a successful hosted connection.
6. Previously the UI mapped every session error except 401 to a generic connection warning. It now distinguishes 503 `AUTH_CONFIG`, 403 origin rejection, and connection/service failures. A later normal 401 clears a stale warning and displays the login form.

## Environment loading and required local settings

Previously `npm run dev` loaded **only** `.env` using Node's `--env-file-if-exists=.env`. The file is optional, so Node warns and continues if absent. `.env.example` is documentation, not an automatically loaded file. Vite's own dotenv loading happens in the separate frontend child and cannot configure its sibling backend. `npm run dev:web` alone does not start or configure the backend.

Now `dev` and the standalone `audit` backend command load `.env`, then optional `.env.local`. Later files override earlier files; existing shell variables override file values. Those values are inherited by both child processes. Tests verify the actual Node env-file loader and child inheritance, including precedence. `.env.test.local`, `.env.development`, `.env.production`, and `SUPABASE_TEST_*` are not backend configuration sources for these commands. The hosted integration runner separately loads `.env.test.local`.

Create the ignored local file without overwriting an existing file:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

Fill in these settings privately using the **existing** project's values:

```dotenv
SUPABASE_URL=https://YOUR_EXISTING_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_EXISTING_PUBLISHABLE_OR_ANON_KEY
APP_ORIGIN=http://127.0.0.1:5173
```

The displayed project/key text is a placeholder, not usable configuration. Use `sb_publishable_...` or the project's legacy anon JWT. Secret/service-role keys remain rejected. Do not prefix these variables with `VITE_`. No new project or key rotation is indicated by this evidence. An optional ignored `.env.local` can hold machine-specific overrides instead. Keep `NODE_ENV=production` and `VERCEL=1` out of local development configuration; production HTTPS enforcement remains intact.

Stop your existing development command with Ctrl+C and restart it from the repository root:

```powershell
npm.cmd run dev
```

Open exactly `http://127.0.0.1:5173/`. Vite now uses a strict port so it fails clearly instead of silently switching to a different origin when 5173 is occupied. A logged-out `/api/auth/session` should return 401, not 503. Then log in with the existing Supabase account. If a shell variable overrides the file, correct that variable and restart. `localhost` and `127.0.0.1` are different hosts for origin checks and cookies; use the configured address consistently.

## Safe diagnostics

The extracted shared validator reports only fixed field names and reason labels. Example for the current missing environment:

```json
{"category":"AUTH_CONFIG","configIssues":[{"field":"SUPABASE_URL","reason":"missing"},{"field":"APP_ORIGIN","reason":"missing"},{"field":"SUPABASE_PUBLISHABLE_KEY","reason":"missing"}]}
```

The actual server log also contains sanitized stack locations. It does not print URL/key/origin values, messages, cookies, tokens, request bodies, or credentials. Other labels distinguish invalid URLs, origin paths/trailing slashes, HTTPS requirements, privileged keys, and unsupported keys. Detailed field diagnostics stay server-side; the UI receives a generic configuration message and `AUTH_CONFIG` code. Authentication, cookie protection, JWT forwarding, and RLS are preserved.

## Files changed

| File | Change |
| --- | --- |
| `server/supabaseConfig.ts` | Shared validator with field/reason errors, preserving origin and key restrictions |
| `server/supabaseConfig.test.ts` | Configuration, redaction, dotenv precedence and child inheritance regressions |
| `server/supabaseApp.ts` | Re-export shared validator and return explicit `AUTH_CONFIG` code on 503 |
| `server/diagnostics.ts` | Log safe configuration field/reason metadata alongside stack locations |
| `src/PrivateWorkspace.tsx` | Distinguish configuration/origin/network failures and clear stale warnings |
| `package.json` | Load optional `.env.local` for both backend launch commands; add browser check command |
| `vite.config.ts` | Pin local port 5173 and fail clearly if occupied |
| `.env.example` | Explain backend env sources and existing-project settings |
| `scripts/local-config-browser.mjs` | Isolated real Vite/Node/browser regression checks |
| `docs/local-supabase-config.md` | Evidence, request trace, local setup and verification report |

The production handler and development launcher were inspected; their existing guarded initialization and child environment inheritance remain in use.

## Verification and remaining limitation

- 303 tests pass in 21 files, including local HTTP acceptance, production HTTPS enforcement, key restrictions, field diagnostics, Node dotenv precedence and child inheritance, and existing auth/database isolation tests.
- `npm run typecheck` and `npm run build` pass.
- `npm run test:local-config` uses the real Vite configuration/frontend, production Node handler and disposable Chrome profiles on isolated ports 15173/15174, leaving the existing 5173/5174 processes untouched. It checks session and login 503s with missing configuration and the explicit configuration UI warning. With syntactically valid synthetic configuration, anonymous session returns 401, malformed login data returns 400, and the login form has no configuration warning. It also checks warning recovery and connection-error feedback.
- Synthetic test settings never become application configuration files, never create a session, and do not claim a successful provider connection. No existing-project settings or account credentials were available. A real Supabase login remains unverified and the ordinary local command remains unconfigured until the actual existing-project values are supplied privately. No code can infer those values from the example files.

Repeat:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:local-config
```
