# Private online release preparation report

Completed locally on 17 October 2026. Prepared for GitHub source control and Vercel hosting; no remote writes or deployment were performed. The repository still has its original uncommitted baseline, nothing staged, no remote configured. No real credentials were generated or saved.

## Architecture and implementation

The existing React/Vite frontend compiles to `dist`; five Vercel Node.js 24 Function entry points serve auth/login, auth/logout, auth/session, audit and protected health. The shared request handler runs without listening on a port. Local development still has a loopback server/proxy; production does not depend on either. The analyzer retains its DNS-pinned SSRF/redirect validation, body limits and bounded execution. Vercel function duration is 60 seconds against a 35-second application deadline. Legacy search is not published. No new package, database or paid authentication service was added.

Authentication uses one server-configured username/password, scrypt-derived password comparisons, fixed-length timing-safe comparisons, HMAC-signed expiring cookies, HTTP-only/Strict same-site cookies and Secure + __Host- naming in production. Every application API requires a valid session except the explicit login/session-status/logout lifecycle. Same-origin Host/Origin checks precede handlers and unsafe methods require Origin. Missing/invalid configuration fails closed. API responses are noncacheable. Configuration changes rotate signing validity. Login allows 10 attempts per 15 minutes per running instance, reserving attempts before asynchronous password work.

The frontend checks the session before mounting the workspace, supports visible login errors, expiration, logout and analyzer-session-loss handling. Existing data schemas, validators, lead/discovery/draft stores and recovery logic were preserved. Logout does not clear storage. The existing 175% scale and official branding remain.

## Files

| File | Change |
| --- | --- |
| `server/auth.ts` | Configuration validation, scrypt comparison, signed sessions, expiry, cookies and bounded login attempts |
| `server/app.ts` | Reusable request handler, server-side auth/origin guards, bounded raw or Vercel-parsed request bodies; loopback listener wrapper |
| `server/production.ts`, `api/audit.ts`, `api/health.ts`, `api/auth/*.ts` | Listener-free production entry points; no legacy search exposure |
| `src/PrivateWorkspace.tsx`, `src/main.tsx`, `src/style.css` | Private login gate, logout, lifecycle/error states and responsive UI |
| `src/analyzerApi.ts`, `src/analyzerApi.test.ts` | Hosted-safe errors and authentication-loss handoff |
| `server/auth.test.ts`, `server/deployment.test.ts` | Auth/security and actual function-export regressions |
| `server/network.test.ts`, `server/searchHttp.test.ts` | Explicit test-only bypass for existing focused network/search regressions; no production bypass |
| `vercel.json`, `.vercelignore`, `.gitignore`, `.env.example` | Production build/functions/security headers, file exclusions and empty credential template |
| `package.json`, `package-lock.json`, `tsconfig.json` | Pin Node 24.x and include function entry points in typechecking; no dependency changes |
| `scripts/browserAuth.mjs`, existing workflow browser scripts | Synthetic-account login support for isolated regression runs |
| `scripts/private-login-browser.mjs`, `scripts/deployment-smoke.mjs` | Browser auth/data retention and built-frontend/actual-functions checks without Vite |
| `README.md`, `docs/deployment.md`, this report | Exact operating, release, GitHub, Vercel and backup handoff |

## Validation

- `npm.cmd test`: PASS, 270 tests across 16 files (all prior regressions plus auth/function coverage).
- `npm.cmd run typecheck`: PASS; includes frontend, server and function entry points.
- `npm.cmd run build`: PASS; 1,602 modules, compiled production assets generated in ignored dist.
- `node scripts/private-login-browser.mjs`: PASS against isolated authenticated services. Invalid/valid credentials, HttpOnly visibility, authenticated reload, anonymous API rejection, logout, tampered cookie and simulated expired-session UI; valid lead/discovery/draft fixtures retained.
- `node scripts/deployment-smoke.mjs`: PASS against the compiled frontend, actual function exports and configured CSP/security headers, without Vite/proxy. Login/errors/logout, protected endpoints, private-target rejection, logos and 175% desktop/mobile layout.
- Existing phase 3, phase 5, external-search, quick-search and accessibility Chrome smokes: PASS after authenticating with synthetic credentials. Sales/drafts/follow-ups/recovery, discovery/promotion/pitch, imports/CSV/manual reviews, query destinations, text persistence and responsive widths preserved.
- Phase 5's separate authenticated public example.com analyzer smoke returned HTTP 200 with two confirmed observations; private destinations were rejected.
- `npm.cmd audit --omit=dev --json`: PASS, zero reported production-dependency vulnerabilities.
- Secret-pattern scan of source/docs/scripts/assets: no credential-shaped matches found. Server credential variable names, auth internals and synthetic test passwords were absent from production frontend JavaScript. No `.env` exists. This is a targeted check, not a formal security audit.

Initial test failures were corrected: Node fetch does not reliably honor a supplied Host header, so auth tests now use their actual bound origin (and raw Node HTTP for the explicit bad-Host test); old analyzer-client expectations referenced local startup commands and were updated to hosted-safe messages. The first login browser run used a reload wait that could inspect the previous document; it now waits for the new document before inspecting records. All results above are the final passing runs.

## Handoff and limitations

See `docs/deployment.md` for the complete commands and dashboard steps. Required server variables: `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SESSION_SECRET`, `APP_ORIGIN`; optional `AUTH_SESSION_TTL_SECONDS` (default 28,800). Production origin must be exact HTTPS. No VITE_ credentials or search key. Real values are to be entered privately by the owner in the hosting dashboard after release approval.

No live Vercel build/deployment, account integration, real HTTPS browser session or cloud verification was performed. Function exports were tested locally with Vercel-style parsed bodies and Secure-cookie flags; compiled-app browser checks used loopback HTTP. Cloud URL/origin and platform behavior must still be accepted after an approved deployment.

Rate counters are per process, reset on cold starts, and are not a distributed limiter. The handoff recommends an IP-based Vercel firewall rule, with current account terms to be reviewed; no firewall/account change was performed. Logout removes the cookie from this browser; a previously copied valid stateless token remains valid until expiry unless credentials/signing secret are rotated on all accessible deployments.

Login adds no cloud storage, device synchronization, encryption of localStorage or automatic backups. Static application code is public; local records remain readable to someone with access to the browser profile. A new online origin starts with separate browser storage. The guide covers existing lead/discovery JSON exports, separate draft text exports and an exact manual browser-store transfer for preserving draft metadata/recovery copies. No schema migration or data upload occurs automatically.

Ready for user review and approval of the concrete release preparation. No commit, push or deployment has been attempted.
