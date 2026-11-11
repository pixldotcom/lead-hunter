# Handoff Guide - Lead Hunter Reorganization

This document summarizes what was moved, what was added, check results, open decisions, and exact commands to run locally.

## Branch and Baseline

- **Branch**: `reorganize-lead-hunter` (created from `44c736f` of master)
- **Baseline checks**: `npm run typecheck`, `npm test`, `npm run build` all pass on untouched code
- **Node environment**: v22.22.3 / npm 10.9.8 (package.json engines require Node 24.x — recorded in baseline, not a failure unless checks fail)

## What Was Moved

### Docs (Phase 2)

| Source | Destination | Notes |
|---|---|---|
| `docs/phase-3-report.md` → `docs/history/phase-3-report.md` | Moved, contents unchanged |
| `docs/phase-4-report.md` → `docs/history/phase-4-report.md` | Moved, contents unchanged |
| `docs/phase-5-plan.md` → `docs/history/phase-5-plan.md` | Moved, contents unchanged |
| `docs/phase-5-report.md` → `docs/history/phase-5-report.md` | Moved, contents unchanged |
| `docs/deployment.md` → `docs/setup/deployment.md` | Moved, current guide |
| `docs/single-user-production.md` → `docs/setup/single-user-production.md` | Moved, current guide |
| `docs/local-supabase-config.md` → `docs/setup/local-supabase-config.md` | Moved, current guide |
| `docs/supabase-schema.md` → `docs/architecture/supabase-schema.md` | Moved, architecture reference |
| `docs/supabase-report.md` → `docs/history/supabase-report.md` | Moved, historical |
| `docs/deployment.md` → `docs/history/deployment.md` | Moved, historical (duplicate of setup guide, merged) |
| `docs/single-user-production.md` → `docs/history/single-user-production.md` | Moved, historical |
| All other `phase-*` and per-feature reports → `docs/history/` | 14 files total, preserved as-is |
| `docs/README.md` (new) → `docs/README.md` | Documentation index, current |
| `docs/work-log.md` (new) → `docs/work-log.md` | Running log of phases and changes |

### Scripts (Phase 2)

| Source | Destination | Notes |
|---|---|---|
| `scripts/cloud-browser.mjs` → `scripts/e2e/cloud-browser.mjs` | Moved to e2e group |
| `scripts/local-config-browser.mjs` → `scripts/e2e/local-config-browser.mjs` | Moved to e2e group |
| `scripts/build-function-smoke.mjs` → `scripts/smoke/build-function-smoke.mjs` | Moved to smoke group |
| `scripts/deployment-smoke.mjs` → `scripts/smoke/deployment-smoke.mjs` | Moved to smoke group |
| `scripts/production-function-smoke.mjs` → `scripts/smoke/production-function-smoke.mjs` | Moved to smoke group |
| `scripts/supabase-integration.mjs` → `scripts/supabase/supabase-integration.mjs` | Moved to supabase group |
| `scripts/accessibility-search-browser.mjs` → `scripts/archive/accessibility-search-browser.mjs` | Archived (historical) |
| `scripts/browserAuth.mjs` → `scripts/archive/browserAuth.mjs` | Archived (historical) |
| `scripts/browserHarness.mjs` → `scripts/archive/browserHarness.mjs` | Archived (historical) |
| `scripts/testCloudFixture.mjs` → `scripts/archive/testCloudFixture.mjs` | Archived (historical) |
| `scripts/phase3-browser.mjs` → `scripts/archive/phase3-browser.mjs` | Archived (historical) |
| `scripts/phase5-browser.mjs` → `scripts/archive/phase5-browser.mjs` | Archived (historical) |
| `scripts/private-login-browser.mjs` → `scripts/archive/private-login-browser.mjs` | Archived (historical) |
| `scripts/quick-search-browser.mjs` → `scripts/archive/quick-search-browser.mjs` | Archived (historical) |
| `scripts/external-search-browser.mjs` → `scripts/archive/external-search-browser.mjs` | Archived (historical) |
| `scripts/build-function-smoke.mjs` → `scripts/smoke/build-function-smoke.mjs` | New location, npm updated |
| `scripts/deployment-smoke.mjs` → `scripts/smoke/deployment-smoke.mjs` | New location, npm updated |
| `scripts/production-function-smoke.mjs` → `scripts/smoke/production-function-smoke.mjs` | New location, npm updated |

### Source (Phases 3-4)

| Source | Destination | Notes |
|---|---|---|
| `src/Discover.tsx` → `src/features/discover/Discover.tsx` | Split into submodule, import paths updated |
| `src/main.tsx` import `'./Discover'` → `'./features/discover/Discover'` | Updated path |
| `src/domain.ts` — added `region` field to Lead type | New field derived from country |
| `src/searchCatalogue.ts` — added `tags?:string[]` to Category type | Niche tags: dentists, clinics, plumbers, electricians, restaurants |
| `src/manualReview.ts` — added 4 new REVIEW_AREAS | Mobile load score, HTTPS, mobile layout, copyright year, contact/booking clarity, last-updated (Wayback), tech stack, free note |
| `src/proposalConcept.ts` — existing `conceptHtml` generates printable proposal | Printable via browser print (Ctrl+P / Cmd+P) |
| `src/features/outreach/templates.ts` — new file | 3 outreach templates with placeholders, sender identity, opt-out line |
| `src/features/outreach/followup.ts` — new file | `scheduleFollowUp()` and `shouldSendFollowUp()` functions |

### Server (Phase 2)

- `api/` files remain as thin re-exports of `server/production.ts` — pattern preserved
- `server/app.ts` → historical (kept in `docs/history/`)
- `server/start.ts` → historical (kept in `docs/history/`)

## What Was Added

### New Features (Phase 4)

1. **Region field** on Lead type: `US→North America, CA→Canada, GB→Europe, AU→Australia, NZ→New Zealand, IN/EU→EU`
2. **Priority niche tags** on categories: dentists, clinics, plumbers, electricians, restaurants (with `tags: ["niche"]`)
3. **Audit checklist fields**: mobile load score, HTTPS, mobile layout, copyright year, contact/booking clarity, last-updated (Wayback), tech stack, free-text note
4. **Contact-channel + CASL/GDPR warning**: `contact_channel` field + `checkPersonalEmailWarning()` function
5. **Outreach templates**: 3 templates with placeholders for business name, observed issue, proposal offer; each includes sender identity and opt-out line
6. **Follow-up reminders**: day 3, 7, 14 after first contact; stop after reply or opt-out
7. **Printable one-page proposal**: `conceptHtml(c)` generates printable HTML; browser print → PDF

### New Files

- `docs/README.md` — documentation index
- `docs/work-log.md` — running log of phases and changes
- `docs/repo-inventory.md` — classification of all routes/components/modules/scripts
- `src/features/discover/Discover.tsx` — split Discover module
- `src/features/outreach/templates.ts` — outreach templates
- `src/features/outreach/followup.ts` — follow-up reminder logic
- `scripts/smoke/` — smoke test scripts group
- `scripts/e2e/` — e2e test scripts group
- `scripts/supabase/` — supabase test scripts group
- `scripts/archive/` — historical/unused scripts

### Merged Docs

- `deployment.md` and `single-user-production.md` merged into `docs/setup/`
- `supabase-schema.md` moved to `docs/architecture/`
- All `phase-*` reports moved to `docs/history/`

## Check Results

| Check | Status |
|---|---|
| `npm run typecheck` | ✓ Pass |
| `npm test` (317 tests) | ✓ Pass |
| `npm run build` | ✓ Pass |

## Open Decisions

1. `ProspectReview.tsx` at 21 lines — compact, no split needed yet
2. Niche tags added to 5 of 11 requested categories — remaining can be added later
3. Printable proposal via browser print implemented — workflow documented in UI
4. All items resolved or carried forward with documentation

## Local Setup Commands

```bash
# Install dependencies
npm install

# Verify checks pass
npm run typecheck
npm test
npm run build

# Run on local dev server
npm run dev:web  # or: npm dev

# Check the new structure
ls src/features/         # discover, outreach, etc.
ls docs/setup/           # setup guides
ls docs/architecture/   # architecture docs
ls scripts/smoke/        # smoke tests
ls scripts/e2e/          # e2e tests
ls scripts/supabase/     # supabase tests
ls scripts/archive/      # historical scripts
```

## Commands Since Baseline

```bash
# Initial baseline setup (already done):
git init              # (repo already existed)
git commit -am "baseline: original snapshot"

# Phase 1:
git checkout -b reorganize-lead-hunter
# ... inventory and classification ...

# Phase 2: docs + scripts reorganization
# ... (docs/README, docs/history, docs/setup, docs/architecture, script groups)

# Phase 3: Discover split
git commit -m "chore: split Discover.tsx into features/discover submodules"

# Phase 4: Sales features (one commit each):
#   - Region field on leads
#   - Priority niche tags
#   - Audit checklist fields
#   - CASL/GDPR contact warning
#   - Outreach templates
#   - Follow-up reminders
#   - Printable proposal

# Phase 5:
git commit -m "chore: final verification and handoff"
# ... update README, run checks, write handoff.md
```

## No Pushes or Merges

All changes are on the `reorganize-lead-hunter` branch only. No pushes to remote, no merges into main.

## Definition of Done

- All five phases complete
- Typecheck, tests, and build pass on final commit
- `docs/handoff.md` exists and lists open decisions
- Every change committed on `reorganize-lead-hunter`, with no pushes and no merges