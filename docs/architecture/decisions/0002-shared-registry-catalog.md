# ADR 0002: A shared registry only catalogs plan processes

- Status: Superseded by [ADR 0004](0004-one-plan-service.md)
- Date: 2026-10-10

## Context

With one server per plan, a person looking at one page could not see the other plans running on the machine. Each plan process was also the only copy of its own address.

## Decision

`serve` and `review` started a detached registry on `127.0.0.1:9477` when it was not already up. That process stored a directory in SQLite (`~/.visual-living-plan/registry.sqlite`). Each plan process registered itself and sent a heartbeat every 5 seconds, including a synchronous git status. The Plans panel on every page read that directory. The registry did not serve plan pages or accept submissions.

## Consequences

The plan list outlived any one plan, but interactivity did not. Each plan still paid for its own Node process, port, file watch, and event loop. Heartbeats from many plans ran git status at the same time.

The registry process and its SQLite file became the place the plan service was later built. The old process-registration API remains so externally registered rows can still be listed.
