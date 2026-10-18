# Supabase schema and security model

Version: `202610170001_cloud_workspace.sql` in `supabase/migrations/`. It has been applied to embedded PostgreSQL during tests, not to a hosted Supabase project. Apply to a fresh dedicated project only after release approval.

## Tables

All ten public application tables enable RLS and scope records to `user_id = auth.uid()`.

| Table | Primary key | Contents |
| --- | --- | --- |
| `lh_workspaces` | user_id | Per-user revision and last update time; serializes transactions |
| `lh_leads` | user_id, id | Existing lead fields/findings/notes in JSONB, domain key; unique domain per user |
| `lh_activities` | user_id, lead_id, ordinal | Lead activities as JSONB in original order; composite owner/lead FK cascades |
| `lh_batches` | user_id, id | Discovery batch metadata and original counters |
| `lh_prospects` | user_id, id | Discovery candidate, manual/qualification reviews, notes, findings, evidence, capture/concept metadata and milestone history in JSONB; composite owner/batch FK; unique domain per user |
| `lh_drafts` | user_id, lead_id | Full draft text, type, purpose and timestamps; orphan drafts deliberately survive lead deletion/migration |
| `lh_preferences` | user_id | Text scale and discovery targeting preferences |
| `lh_operations` | user_id, operation_id | Payload hash, committed revision and timestamp for idempotent retries |
| `lh_imports` | user_id, source_hash | Completed source import marker |
| `lh_backups` | user_id, revision | Last ten pre-save workspace snapshots |

Owned tables reference managed `auth.users` directly or through composite cascading foreign keys. Deleting a test user through Supabase's administrative dashboard cascades its app records without touching other users. IDs remain legacy text IDs; user IDs are Supabase UUIDs. Arrays of activity events preserve order explicitly. Aggregate record order can be canonicalized when loaded; record identity and timestamps remain intact.

JSONB preserves the existing validated models and backup compatibility without flattening every analyzer finding/checklist field into a separate column. Review notes are in prospect payloads; lead notes/findings are in lead payloads. This is a per-user whole-workspace transaction model, not multi-user shared editing or field-level realtime synchronization.

## RLS and privileges

Every table has SELECT/INSERT/UPDATE/DELETE ownership policies, with USING and WITH CHECK preventing ownership changes. Actual privileges grant authenticated users **SELECT only** and revoke direct table writes. Anonymous/public roles have no table access. The normal app supplies each user's JWT to Supabase, so direct reads are still RLS-filtered by that user.

The two write/load entry points are narrowly defined SECURITY DEFINER functions with an empty search_path and fully qualified table/helper references. They derive the owner exclusively from `auth.uid()`; neither accepts a user-id argument. Their execute privilege is revoked from public/anon and granted only to authenticated. Definer privileges allow the atomic implementation to write while clients cannot bypass it with direct table updates. Explicit `WHERE user_id = auth.uid()` binding and owner-composite foreign keys remain essential even though definer functions bypass table RLS internally.

- `lh_load_workspace()` constructs only that user's complete legacy-compatible workspace plus revision. A new account receives empty stores and default 175% text.
- `lh_save_workspace(expected_revision, operation_id, payload, import_hash, payload_hash)` locks the user's revision row, checks retries/import markers, checks expected revision, preserves a pre-save snapshot, replaces that user's records transactionally, increments revision and records operation/import completion. Other users are not read or changed.

The backend validates the complete payload with the existing lead/discovery/draft validators and new cloud limits before calling the RPC. SQL additionally checks shape/bounds, keys, FKs, ownership and constraints. The backend computes the payload hash itself. A duplicate operation with a different hash is rejected; an already committed operation returns the current user workspace. An old revision raises SQLSTATE 40001, surfaced as HTTP 409. A failed SQL statement rolls the entire replacement back.

The authenticated account is also bound to browser save requests/responses. Pending requests are aborted on component/account teardown; a save declaring a different user from the verified session is refused. Account-scoped IndexedDB keys prevent restoring another account's pending buffer automatically.

## Validation and safeguards

- Real embedded PostgreSQL tests apply the migration and switch between anon/authenticated roles and two UUID claims.
- Tests verify RLS flags on every table, all-table cross-user SELECT isolation, shared record IDs across owners, forbidden direct writes, anonymous RPC denial, transaction rollback, revision conflicts, operation/import idempotency, pre-import backups and cascading account cleanup.
- Backend tests cover Supabase session checks, refresh, logout, recovery, ownership binding, protected analyzer calls, safe errors, origin guards and rate limits.
- Compiled-app browser tests use controlled Auth responses plus this actual PostgreSQL schema. Hosted Data API/JWT verification needs the separate test-project run; controlled Auth tests do not establish hosted Auth or SMTP behavior.

RLS is required even with the Node API. Never use an administrative/service-role key for routine app requests, grant public table writes, disable RLS to troubleshoot, or expose an administrative SQL interface. Run migrations only as the project owner through reviewed tooling. Later schema changes must be new ordered migration files; keep their forward/recovery instructions with the release.
