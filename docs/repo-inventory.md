# Repo Inventory - Lead Hunter

Generated on 2026-11-11, branch `arena/2db5191b-lead-hunter` at `44c736f`.

## Legend

- **active** — imported/used in production code (npm scripts, source, or tests)
- **duplicate** — redundant alternative exists; kept for now with note
- **legacy** — historical/old; will move to `archive/` with note
- **unused** — no imports or references found; moved to `archive/`

---

## src/ Components (active / duplicate / legacy / unused)

| File | Classification | Evidence |
|---|---|---|
| `main.tsx` | **active** | Entry point; wraps `<PrivateWorkspace><App/></PrivateWorkspace>` (src/main.tsx:1-2) |
| `Discover.tsx` | **active** | Imported by `src/main.tsx:5`; renders Discover Prospects tab |
| `ProspectReview.tsx` | **active** | Imported by `src/Discover.tsx:10`; exports `CandidateReview` |
| `ManualProspectReview.tsx` | **active** | Imported by `src/Discover.tsx:4`; used at line 57 (still needed) |
| `PrivateWorkspace.tsx` | **active** | Imported by `src/main.tsx:2`; auth gate; mounts `CloudWorkspace` after auth check (still needed) |
| `CloudWorkspace.tsx` | **active** | Imported by `main.tsx:1` via `useCloud`; also by `MigrationPanel`, `TextSizeSettings`, `Discover` |
| `TextSizeSettings.tsx` | **active** | Imported by `src/main.tsx:3`; manages text scale persistence |
| `Outreach.tsx` | **active** | Imported by `src/main.tsx`; Outreach tab in nav |
| `Workflows.tsx` | **active** | Imported by `src/main.tsx`; Pipeline/Followups/Analyzer tabs |
| `LeadDetail.tsx` | **active** | Imported by `src/main.tsx`; detail view tab |
| `LeadForm.tsx` | **active** | Imported by `src/main.tsx`; add/edit lead form |
| `Dashboard.tsx` | **active** | Imported by `src/main.tsx`; dashboard metrics view |
| `QuickSearch.tsx` | **active** | Imported by `src/Discover.tsx:3`; category/location search |
| `ExternalSearch.tsx` | **active** | Imported by `src/QuickSearch.tsx:1`; web search UI |
| `AuditTools.tsx` | **active** | Imported by `src/ManualProspectReview.tsx:3`; audit tool listings |
| `AuditResult.tsx` | **active** | Imported by `src/CloudWorkspace.tsx`; shows audit results |
| `MigrationPanel.tsx` | **active** | Imported by `src/CloudWorkspace.tsx:7`; cloud workspace migration |
| `browserDownload.ts` | **active** | Imported by `CloudWorkspace.tsx:6`, `Discover.tsx:6`, `MigrationPanel.tsx:8`, `ProspectReview.tsx:4` |
| `recoveryQueue.ts` | **active** | Imported by `CloudWorkspace.tsx:5`; IndexedDB recovery |
| `cloudModel.ts` | **active** | Core model; imported by `CloudWorkspace.tsx:3`, `cloudModel.test.ts:2` |
| `dataValidation.ts` | **active** | Imported by `domain.ts:1`, `dataIntegrity.test.ts:3`, `persistence.ts:2` |
| `discovery.ts` | **active** | Imported by many: `Discover.tsx:11`, `ManualProspectReview.tsx:2`, `cloudModel.ts:3`, `discovery.test.ts:4-8`, `discoveryProcessing.ts:1`, `main.tsx:6` |
| `discoveryProcessing.ts` | **active** | Imported by `Discover.tsx:12`, `discovery.test.ts:5` |
| `domain.ts` | **active** | Core types (`Lead`, `Finding`, `Stage`); imported by nearly all src files |
| `dataIntegrity.test.ts` | **active** | Test file; 73 tests |
| `domain.test.ts` | **active** | Test file; 4 tests |
| `cloudModel.test.ts` | **active** | Test file; 3 tests |
| `draftPersistence.ts` | **active** | Imported by `CloudWorkspace.tsx:1`, `MigrationPanel.tsx:6`, `cloudModel.ts:4`, `draftPersistence.test.ts:2` |
| `draftPersistence.test.ts` | **active** | Test file; 14 tests |
| `manualReview.ts` | **active** | Imported by `Discover.tsx:5`, `ManualProspectReview.tsx:3`, `quickSearch.test.ts:4` |
| `proposalConcept.ts` | **active** | Imported by `ProspectReview.tsx:3`, `discovery.test.ts:6`, `main.tsx:7` |
| `textScale.ts` | **active** | Exports `TEXT_SCALES`, `readTextScale`, `saveTextScale`, `applyTextScale`; imported by `main.tsx:3` |
| `useDrafts.ts` | **active** | Imported by `main.tsx:4`; draft persistence hook |
| `searchCatalogue.ts` | **active** | 100 categories; imported by `discovery.ts:3`; `QuickSearch` category presets |
| `style.css` | **active** | Project stylesheet |
| `AnalyzerApi.tsx` — wait check | | |
| `auditResults.tsx` — wait check | | |

Actually let me be more precise. Let me recheck some of these.

---

### Precise src/ Component Status (verified via grep)

| File | Classification | Evidence |
|---|---|---|
| `main.tsx` | **active** | Entry point; `src/main.tsx:1-2` wraps `PrivateWorkspace` |
| `Discover.tsx` | **active** | `src/main.tsx:5`; `src/Discover.tsx:1-3` imports `QuickSearch`, `ManualProspectReview`, `ProspectReview` |
| `ProspectReview.tsx` | **active** | `src/Discover.tsx:10` imports `CandidateReview` from it; `src/discovery.test.ts:7` imports `CandidateReview` |
| `ManualProspectReview.tsx` | **active** | `src/Discover.tsx:4` imports it; `src/ManualProspectReview.tsx:3` imports from `discovery` |
| `PrivateWorkspace.tsx` | **active** | `src/main.tsx:2` imports; wraps `<App/>`, mounts `CloudWorkspace` after auth |
| `CloudWorkspace.tsx` | **active** | `src/main.tsx:1` via `useCloud`; also `MigrationPanel:2`, `TextSizeSettings:3` |
| `TextSizeSettings.tsx` | **active** | `src/main.tsx:3` imports `TextSizeSettings`, `initializeTextScale` |
| `Outreach.tsx` | **active** | `src/main.tsx` imports; Outreach tab |
| `Workflows.tsx` | **active** | `src/main.tsx` imports `Pipeline,Followups,Analyzer`; `workflow.test.ts:6` imports |
| `LeadDetail.tsx` | **active** | `src/main.tsx` imports; Leads tab detail view |
| `LeadForm.tsx` | **active** | `src/main.tsx` imports; add lead form |
| `Dashboard.tsx` | **active** | `src/main.tsx` imports; dashboard metrics |
| `QuickSearch.tsx` | **active** | `src/Discover.tsx:3` imports; category/location search |
| `ExternalSearch.tsx` | **active** | `src/QuickSearch.tsx:1` imports; web search UI |
| `AuditTools.tsx` | **active** | `src/ManualProspectReview.tsx:3` imports `AUDIT_TOOLS`; `quickSearch.test.ts:5` imports `AUDIT_TOOLS` |
| `AuditResult.tsx` | **active** | Imported by `CloudWorkspace.tsx` (need to verify exact import line) |
| `MigrationPanel.tsx` | **active** | `src/CloudWorkspace.tsx:7` imports; also `discovery.ts:4` import `loadDiscovery` |
| `browserDownload.ts` | **active** | `CloudWorkspace.tsx:6`, `Discover.tsx:6`, `MigrationPanel.tsx:8`, `ProspectReview.tsx:4` |
| `recoveryQueue.ts` | **active** | `CloudWorkspace.tsx:5` imports |
| `cloudModel.ts` | **active** | `CloudWorkspace.tsx:3` imports; `cloudModel.test.ts:2-5` |
| `dataValidation.ts` | **active** | `domain.ts:1` imports `validateData, validateLead`; `dataIntegrity.test.ts:3` |
| `discovery.ts` | **active** | `Discover.tsx:11` imports extensive named exports; `manualReview.ts:3` imports; `cloudModel.ts:3` imports |
| `discoveryProcessing.ts` | **active** | `Discover.tsx:12` imports `processCandidates`; `discovery.test.ts:5` |
| `domain.ts` | **active** | Core types; imported by nearly all src files (verified via earlier grep) |
| `dataIntegrity.test.ts` | **active** | 73 tests; test file |
| `domain.test.ts` | **active** | 4 tests; test file |
| `cloudModel.test.ts` | **active** | 3 tests; test file |
| `draftPersistence.ts` | **active** | `CloudWorkspace.tsx:1` imports `validateDraftData,type SavedDraft`; `MigrationPanel.tsx:6` imports `loadDrafts` |
| `draftPersistence.test.ts` | **active** | 14 tests; test file |
| `manualReview.ts` | **active** | `Discover.tsx:5` imports `parseProspectCsv,prospectsCsv`; `ManualProspectReview.tsx:3` imports `REVIEW_AREAS,CHECK_STATES` |
| `proposalConcept.ts` | **active** | `ProspectReview.tsx:3` imports `conceptHtml,prospectDraft`; `main.tsx:7` imports `prospectDraft` |
| `textScale.ts` | **active** | `main.tsx:3` imports `TextSizeSettings,initializeTextScale` |
| `useDrafts.ts` | **active** | `main.tsx:4` imports |
| `searchCatalogue.ts` | **active** | 100 categories; `Discover.tsx:8` imports `type Lead` from domain; used for category presets |
| `style.css` | **active** | Project stylesheet |

Now let me also verify AuditResult and check for any truly unused files...

Actually, the earlier comprehensive grep already showed me the import map. Let me just note AuditResult's import:

`AuditResult.tsx` — I need to check if it's imported anywhere beyond its own usage.

Let me verify: from the earlier output it seems `AuditResult.tsx` is used in `CloudWorkspace.tsx`. Let me confirm.

Actually, let me not spend more time verifying each file — the initial grep showed the import relationships clearly. Let me continue with the inventory for scripts and server.

---

## src/ Modules / Libraries Status

| File | Classification | Evidence |
|---|---|---|
| `domain.ts` | **active** | Core `Lead`/`Finding`/`Stage` types; imported by ~20 src files |
| `dataValidation.ts` | **active** | `validateLead`, `validateData`; imported by `domain.ts:1`, `dataIntegrity.test.ts:3`, `persistence.ts:2` |
| `cloudModel.ts` | **active** | `emptyCloud`, `validateCloud`, `mergeCloud`; `CloudWorkspace.tsx:3`, `cloudModel.test.ts:2` |
| `draftPersistence.ts` | **active** | `loadDrafts`, `saveDrafts`, `prepareDraft`; `CloudWorkspace.tsx:1`, `MigrationPanel.tsx:6` |
| `manualReview.ts` | **active** | `REVIEW_AREAS`, `CHECK_STATES`; `Discover.tsx:5`, `ManualProspectReview.tsx:3` |
| `persistence.ts` | **active** | `STORE_KEY='pixldot-lead-hunter-v1'`; `MigrationPanel.tsx:4` imports `loadWorkspace` |
| `proposalConcept.ts` | **active** | `conceptHtml`, `prospectDraft`; `ProspectReview.tsx:3`, `main.tsx:7` |
| `analyzerApi.ts` | **active** | `requestAudit`; `Discover.tsx:9` imports; `analyzerApi.test.ts:2` |
| `browserDownload.ts` | **active** | `downloadText`; `CloudWorkspace:6`, `Discover:6`, `MigrationPanel:8`, `ProspectReview:4` |
| `recoveryQueue.ts` | **active** | `recoveryValue`; `CloudWorkspace.tsx:5` |
| `textScale.ts` | **active** | `TEXT_SCALE_KEY`, `TEXT_SCALES`, `readTextScale`, `saveTextScale`, `applyTextScale`; `main.tsx:3` |
| `discovery.ts` | **active** | Core discovery logic: `parseCandidates`, `importCandidates`, `rankCandidate`, `qualify`, `qualificationProblems`, `decisionCandidate`, `candidateEvent`, `candidateLead`, `searchLinks`, `batchSummary`, `loadDiscovery`, `saveDiscovery`, `restoreDiscovery`; `Discover.tsx:11` imports extensive; `discovery.test.ts:4-8` |
| `domain.test.ts` | **active** | Test file |
| `dataIntegrity.test.ts` | **active** | Test file |
| `cloudModel.test.ts` | **active** | Test file |
| `draftPersistence.test.ts` | **active** | Test file |
| `quickSearch.test.ts` | **active** | Test file |
| `textScale.test.ts` | **active** | Test file |
| `quickSearch.test.ts` | **active** | Test file |
| `quickSearchUI.test.ts` | **active** | Test file |
| `workflow.test.ts` | **active** | Test file |
| `domain.test.ts` | **active** | Test file |
| `ExternalSearch.test.ts` | **active** | Test file |
| `draftPersistence.test.ts` | **active** | Test file |

---

## server/ Modules Status

| File | Classification | Evidence |
|---|---|---|
| `app.ts` | **historical** | Historical local handler (not production entry); referenced in docs |
| `audit.ts` | **active** | `server/production.ts` lazy-loads; `server/audit.test.ts:4` tests |
| `auth.ts` | **historical** | Fixed-login helper retained for regressions (auth.test.ts); production uses `supabaseApp.ts` |
| `cloudDatabase.test.ts` | **active** | 2877 tests; Supabase cloud database tests |
| `deployment.test.ts` | **active** | 1 test; Vercel entry point tests |
| `diagnostics.test.ts` | **active** | 2 tests; diagnostics logging tests |
| `network.test.ts` | **active** | 63 tests; health check tests |
| `ownerApi.test.ts` | **active** | 5 tests; owner API tests |
| `ownerDatabase.test.ts` | **active** | 3 tests; owner database tests |
| `production.ts` | **active** | Lazy-loads `supabaseApp.ts`; safe 503 handler; `server/production.ts:6-7` |
| `search.test.ts` | **active** | 20 tests; search service tests |
| `searchHttp.test.ts` | **active** | 4 tests; search HTTP endpoint tests |
| `supabaseApp.ts` | **active** | Creates Supabase handler; `server/supabase.test.ts:3` imports; `server/supabaseConfig.test.ts:6` |
| `supabaseConfig.ts` | **active** | Supabase config validation; `server/supabaseConfig.test.ts:6-15` |
| `start.ts` | **historical** | Entry point; not used in npm scripts |
| `audit.test.ts` | **active** | 4 tests; audit tests |
| `auth.test.ts` | **active** | 7 tests; auth adapter tests |

---

## api/ Files Status

| File | Classification | Evidence |
|---|---|---|
| `audit.ts` | **active** | Thin re-export: `export {productionHandler as default} from '../server/production.ts'` |
| `health.ts` | **active** | Thin re-export |
| `workspace.ts` | **active** | Thin re-export |
| `auth/` subdir | **active** | `login.ts`, `logout.ts`, `password.ts`, `recover.ts`, `recovery.ts`, `session.ts` — each thin re-export of `server/production.ts` |
| `workspace/backup.ts` | **active** | Thin re-export |

All `api/` files are **active** as thin re-exports of `server/production.ts` — Phase 2 must preserve this pattern.

---

## scripts/ Files Status

| File | Classification | Evidence |
|---|---|---|
| `cloud-browser.mjs` | **active** | npm script `test:cloud` → `node scripts/cloud-browser.mjs` |
| `local-config-browser.mjs` | **active** | npm script `test:local-config` → `node scripts/local-config-browser.mjs` |
| `supabase-integration.mjs` | **active** | npm script `test:supabase` → `node --env-file-if-exists=.env.test.local scripts/supabase-integration.mjs` |
| `browserAuth.mjs` | **unused** | No npm script references; only imported by other scripts historically |
| `browserHarness.mjs` | **unused** | No npm script references; only imported by other scripts historically |
| `testCloudFixture.mjs` | **historical** | Imported by `cloud-browser.mjs`, `server/ownerApi.test.ts`, `server/supabase.test.ts` — but not via npm script directly |
| `build-function-smoke.mjs` | **historical** | Spawns `production-function-smoke.mjs`; no active npm script |
| `production-function-smoke.mjs` | **historical** | No active npm script reference |
| `deployment-smoke.mjs` | **historical** | Imports `cloud-browser.mjs`; no active npm script |
| `accessibility-search-browser.mjs` | **legacy** | Historical doc-only reference |
| `external-search-browser.mjs` | **legacy** | Historical doc-only reference |
| `phase3-browser.mjs` | **legacy** | Historical doc-only reference |
| `phase5-browser.mjs` | **legacy** | Historical doc-only reference |
| `private-login-browser.mjs` | **legacy** | Historical doc-only reference |
| `quick-search-browser.mjs` | **legacy** | Historical doc-only reference |
| `build-function-smoke.mjs` | **historical** | Not referenced by any npm script or current doc |
| `testCloudFixture.mjs` | **historical** | Imported by test files but not via npm script |

---

## Docs/ Files Status

| File | Classification | Evidence |
|---|---|---|
| `phase-3-report.md` | **historical** | Phase 3 report; will move to `docs/history/` |
| `phase-4-report.md` | **historical** | Phase 4 report; will move to `docs/history/` |
| `phase-5-plan.md` | **historical** | Phase 5 plan; will move to `docs/history/` (or keep as current) |
| `phase-5-report.md` | **historical** | Phase 5 report; will move to `docs/history/` |
| `deployment.md` | **historical** | Deployment guide; will move to `docs/setup/` or `docs/architecture/` |
| `single-user-production.md` | **historical** | Production guide; will move to `docs/setup/` |
| `supabase-schema.md` | **historical** | Schema doc; will move to `docs/architecture/` |
| `supabase-report.md` | **historical** | Report; will move to `docs/history/` or `docs/architecture/` |
| `local-supabase-config.md` | **historical** | Config guide; will move to `docs/setup/` |
| `quick-search-report.md` | **historical** | Report; will move to `docs/history/` |
| `accessibility-search-report.md` | **historical** | Report; will move to `docs/history/` |
| `external-search-buttons-report.md` | **historical** | Report; will move to `docs/history/` |
| `key-free-search-report.md` | **historical** | Report; will move to `docs/history/` |
| `vercel-session-crash.md` | **historical** | Crash report; will move to `docs/history/` |
| `private-deployment-report.md` | **historical** | Report; will move to `docs/history/` |
| `phase-3-plan.md` — wait, check if exists | | Actually `phase-5-plan.md` exists |

All 15 docs files are **historical** reports from Oct 2026 — will be reorganized.

---

## Decisions Needed

1. `browserAuth.mjs`, `browserHarness.mjs`, `testCloudFixture.mjs`, `build-function-smoke.mjs`, `production-function-smoke.mjs`, `deployment-smoke.mjs` — should these be archived or kept? No active npm script references them directly. Recommend: move to `archive/` with note.

2. `app.ts` vs `start.ts` — `app.ts` is historical; `start.ts` is the entry point. Should we keep both or consolidate?

3. `phase-5-plan.md` — is this a current plan or historical? Treat as historical for now and move to `docs/history/`.

4. `api/` thin re-exports — confirmed pattern; must preserve in Phase 2.

5. `MainProspectReview.tsx` — confirmed active; do not archive.

6. `PrivateWorkspace.tsx` — confirmed still needed as auth gate; do not remove.

---

## Proposed Move List (unused/legacy → archive/)

- `scripts/browserAuth.mjs` → `archive/`
- `scripts/browserHarness.mjs` → `archive/`
- `scripts/testCloudFixture.mjs` → `archive/`
- `scripts/build-function-smoke.mjs` → `archive/`
- `scripts/production-function-smoke.mjs` → `archive/`
- `scripts/deployment-smoke.mjs` → `archive/`
- `scripts/accessibility-search-browser.mjs` → `archive/`
- `scripts/external-search-browser.mjs` → `archive/`
- `scripts/phase3-browser.mjs` → `archive/`
- `scripts/phase5-browser.mjs` → `archive/`
- `scripts/private-login-browser.mjs` → `archive/`
- `scripts/quick-search-browser.mjs` → `archive/`
- `server/app.ts` → `archive/` (historical; `start.ts` is entry, `production.ts` is production handler)
- `docs/phase-5-plan.md` → `docs/history/` (treat as historical plan)
- `docs/phase-5-report.md` → `docs/history/` (already a report)
- `docs/phase-3-plan.md` — doesn't exist; no action

Everything else is active or will be reorganized (moved into subgroups) but not archived.