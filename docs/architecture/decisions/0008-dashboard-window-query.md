# ADR 0008: Dashboard period filters run inside the finished-run query

- Status: Accepted
- Date: 2026-10-12

## Context

`GET /api/dashboard` groups plans by the local day, week, or month. Open sessions and live private processes are a small set. Finished runs live in `plan_runs`. Loading every finished run and then dropping the rows outside the selected window repeated that work for a day view.

## Decision

- `plan_runs` stores `ended_at` next to `started_at` as typed columns, read and written with Drizzle. The window end is the run's `endedAt`, or `heartbeatAt` when the plan has no end time, or `startedAt` when neither is set.
- Opening an older database copies a JSON `payload` into those columns, including `ended_at`.
- Indexes on `started_at` and `ended_at` support the window.
- `GET /api/dashboard` asks for finished runs with `started_at <= window end` and the window end `>= window start`.
- `GET /api/plans` still returns every finished run.
- The in-memory overlap rule stays in place for open sessions and live private processes.

## Consequences

A day view no longer loads finished runs from the rest of the month. A run that started before the window and ended inside it is still included. A run that ended before the window is left in the database and is not returned for that request.
