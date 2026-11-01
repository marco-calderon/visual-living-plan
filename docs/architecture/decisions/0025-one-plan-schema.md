# ADR 0025: One plan schema for the local registry and D1

- Status: Accepted
- Date: 2026-11-01
- Updates: the separate local and D1 plan tables in [0024](0024-one-plan-store.md)

## Context

The local registry and D1 both had a table named `plans`, and the columns did not match. The local row was a process catalog of about forty columns, plus `plan_sessions` and `plan_documents`. The D1 row was an account slot with `user_id`, `token`, `tier`, and `closed_at`. Drizzle can target bun SQLite and D1 from one `sqliteTable` module only when those databases share a shape.

Better Auth signs in the hosted account. The local service has no account. The person at the machine is allowed through with the registry token and the plan token.

## Decision

Both databases create the same tables.

- `plans` keeps the columns a query filters or sorts: `id`, `user_id`, `token`, `title`, `mode`, `status`, `plan_path`, `started_at`, `ended_at`, `heartbeat_at`. Configuration is one JSON object in `meta` (process details, git, session responses, and hosted `tier`).
- `user_id` is null on a local row. Better Auth tables are created locally and left empty. The library runs only on the host.
- `plan_runs` uses the same columns, with `run_id` as the primary key. The dashboard window still filters `started_at`, `ended_at`, and `heartbeat_at`.
- `plan_versions` is the document history in both places. The host keeps the latest 10. Local keeps the chain that used to be `plan_snapshots`.
- `plan_events` is the submission log. `user_settings` is `user_id` plus `meta`.
- The Durable Object keeps its own database. Its `events` columns match `plan_events`. Its key-value rows are the live room, which is separate from `plans.meta`.

Drizzle opens bun SQLite locally and D1 on the host. The schema module does not import the bun driver, so the Worker does not load it.

## Consequences

Opening a local registry folds `processes`, the wide `plans` columns, `plan_sessions`, payload `plan_runs`, and `plan_snapshots` into this shape. Apply `src/migrations/0004_one_schema.sql` on D1 (`npm run host:migrate` locally, `wrangler d1 migrations apply` in production) and redeploy the Worker. `0001` through `0003` stay as the applied history.
