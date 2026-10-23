# ADR 0015: Diagnostic logs are files in the home directory

- Status: Accepted
- Date: 2026-10-22

## Context

The plan page shows status, forms, the workflow, and settings. Failures that do not belong to those surfaces were easy to miss. A plan reload error was broadcast as an `error` event the page never rendered. Browser console output, a dropped event stream, parse failures, execution start and stop, and service failures such as a local-name publish or a prune error only reached the detached process log at `~/.visual-living-plan/registry.log`.

These messages are not submissions. An agent should not see them on `events`, and they should not be stored as `plan_events`.

## Decision

Development logs are files under `~/.living-plan` (`LIVE_PLAN_LOG_HOME` in tests). winston writes them. `winston-daily-rotate-file` writes one registry file per local day at `registry/YYYY-MM-DD.log` and keeps 30 days. A plan event is also appended to `plans/<planId>.log` with winston's file transport (about 1MB, three files). Events that are not tied to a plan stay in the daily file only.

`console.error`, `console.warn`, and `console.log` in the server process are copied into those files. The level `log` is stored as winston `info`, with `levelName` set back to `log`. Plan reload and theme reload failures are recorded there. `parsePlan` records a frontmatter or fence failure and then throws. `check` records a missing workflow block. Execution start, update, and stop are recorded on the plan, and a graph that has no `nodes` array is a warning. The open page posts its own console output, script errors, and unhandled rejections to `POST /api/logs`.

`GET /api/logs` reads today's registry file. `GET /plans/<id>/api/logs` reads that plan's file, plus today's lines that are not tied to a plan. `live-plan logs` reads the same files and does not need a running service. `--day YYYY-MM-DD` selects a registry file. `--url` reads that plan's file and ignores `--day`. A missing file prints `No logs.` The plan page and the dashboard do not render the log.

Logging does not write a `plan_events` row and does not notify the agent stream. The directory is created mode `0700`.

## Consequences

`live-plan logs` is the way to read a failure that previously only existed in the process log or the browser console. The files stay after a restart. The open page stays free of that list. `registry.log` still receives the lines the process prints. The registry database is unchanged.
