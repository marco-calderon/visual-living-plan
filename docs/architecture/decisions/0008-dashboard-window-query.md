# ADR 0008: Dashboard period filters run inside the finished-run query

- Status: Accepted
- Date: 2026-10-12

## Context

`GET /api/dashboard` groups plans by the local day, week, or month. Open sessions and live private processes are a small set. Finished runs live in `plan_runs`, and each row's plan is a JSON payload. The dashboard loaded every payload, parsed it, and then dropped the rows outside the selected window. A month of runs was parsed again for a day view.

The registry store talks to SQLite through `node:sqlite` prepared statements. Drizzle is not on this path.

## Decision

- `plan_runs` stores `ended_at` next to `started_at`. The value is the run's `endedAt`, or `heartbeatAt` when the plan has no end time.
- Opening an older database adds `ended_at` and fills it from the payload.
- Indexes on `started_at` and `ended_at` support the window.
- `GET /api/dashboard` asks for finished runs with `started_at <= window end` and `ended_at >= window start`, then parses only those payloads.
- `GET /api/plans` still returns every finished run.
- The in-memory overlap rule stays in place for open sessions and live private processes.

## Consequences

A day view no longer parses finished runs from the rest of the month. A run that started before the window and ended inside it is still included. A run that ended before the window is left in the database and is not parsed for that request.
