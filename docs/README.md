# PixlDot Lead Hunter — Documentation Index

This repository organizes around a freelance website-proposal workflow for targeting businesses in the US, Canada, UK, New Zealand, Australia, and Europe.

## Current Documentation (active / in-progress)

| Document | Purpose | Location |
|---|---|---|
| `work-log.md` | Running log of phases, changes, check results, open questions | `docs/` |
| `repo-inventory.md` | Classification of all routes, components, modules, scripts (active/duplicate/legacy/unused) | `docs/` |
| `docs/README.md` | This file — the documentation index | `docs/` |

## Directory Structure

| Directory | Contents | Purpose |
|---|---|---|
| `docs/setup/` | Setup guides, local Supabase config, deployment guides | `docs/setup/deployment.md`, `docs/setup/local-supabase-config.md`, `docs/setup/single-user-production.md` |
| `docs/architecture/` | Data-model docs, schema documentation, architecture references | `docs/architecture/supabase-schema.md` |
| `docs/history/` | All `phase-*` reports and historical notes — preserved, read-only | `docs/history/` (14 files) |
| `docs/README.md` | This index | `docs/` |

### `docs/setup/` — Setup Guides (current)

| File | Original Location | Notes |
|---|---|---|
| `deployment.md` | `docs/deployment.md` | Deployment guide — preserved as-is |
| `local-supabase-config.md` | `docs/local-supabase-config.md` | Local Supabase configuration — preserved as-is |
| `single-user-production.md` | `docs/single-user-production.md` | Production setup — preserved as-is |

### `docs/architecture/` — Architecture and Schema (current)

| File | Original Location | Notes |
|---|---|---|
| `supabase-schema.md` | `docs/supabase-schema.md` | Supabase schema documentation — preserved as-is |

### `docs/history/` — Historical Reports (preserved, read-only)

All `phase-*` reports and per-feature reports from October 2026, moved without editing:

- `phase-3-report.md`
- `phase-4-report.md`
- `phase-5-plan.md`
- `phase-5-report.md`
- `accessibility-search-report.md`
- `external-search-buttons-report.md`
- `key-free-search-report.md`
- `quick-search-report.md`
- `supabase-report.md`
- `vercel-session-crash.md`
- `private-deployment-report.md`
- `deployment.md`
- `local-supabase-config.md`
- `single-user-production.md`

## Quick Start

- See `docs/work-log.md` for the running log of what has been done and what is pending.
- The codebase is on branch `reorganize-lead-hunter` (branched from `44c736f`).
- Run `npm install`, then `npm run typecheck`, `npm test`, `npm run build` to verify checks.

---

*Last updated: 2026-11-11*