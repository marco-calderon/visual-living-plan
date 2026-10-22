# ADR 0015: Diagnostic logs stay in the service process

- Status: Accepted
- Date: 2026-10-22

## Context

The plan page shows status, forms, the workflow, and settings. Failures that do not belong to those surfaces were easy to miss. A plan reload error was broadcast as an `error` event the page never rendered. Browser console output, a dropped event stream, and service failures such as a local-name publish or a prune error only reached the detached process log at `~/.visual-living-plan/registry.log`.

These messages are not submissions. An agent should not see them on `events`, and they should not be stored as `plan_events`.

## Decision

The service keeps a ring of errors, warnings, and logs in memory. `console.error`, `console.warn`, and `console.log` in the server process are copied into that ring. Plan reload and theme reload failures are recorded there too. The open page posts its own console output, script errors, and unhandled rejections to `POST /api/logs`.

`GET /api/logs` on the service returns every entry. `GET /plans/<id>/api/logs` returns that plan's entries plus entries that are not tied to a plan. `live-plan logs` prints that list and can filter with `--level error|warn|log`. The plan page and the dashboard do not render it.

The ring is capped and does not survive a restart. Identical messages inside a short window increment `repeat` instead of adding another row. Logging does not write a `plan_events` row and does not notify the agent stream.

## Consequences

`live-plan logs` is the way to read a failure that previously only existed in the process log or the browser console. The open page stays free of that list. Restarting the service clears it. `registry.log` still receives the lines the process prints.
