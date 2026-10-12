# ADR 0001: One HTTP server per living plan

- Status: Superseded by [ADR 0004](0004-one-plan-service.md)
- Date: 2026-10-09

## Context

The first release needed a page for one `.plan.md` file: live reload, human submissions, and a workflow canvas. An agent started that page by running `serve` or `review` and holding the process open.

## Decision

Each `serve` or `review` started its own Node HTTP server, bound to its own port, and kept that plan's state in memory. `wait` was a second process that polled `GET /api/plan` about once a second. Section diffs lived only in that process.

## Consequences

A plan died when its process died. Several open plans meant several Node processes, several ports, and several cold starts. The polling `wait` added up to a second of delay and held a process idle for the whole timeout.

`src/server.ts` still implements this shape for `--no-registry`. New plans on an installed machine use the shared service instead.
