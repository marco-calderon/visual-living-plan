# ADR 0005: Keep a private one-plan server

- Status: Accepted
- Date: 2026-10-10

## Context

[ADR 0004](0004-one-plan-service.md) makes the machine service the default. Tests, CI, and a one-shot review still need a process that starts, serves one plan, and exits without shared state. A container that should not keep a user-level daemon has the same need.

## Decision

`--no-registry` keeps the original server from [ADR 0001](0001-one-server-per-plan.md). `src/server.ts` mounts one plan session at the root of its own port. That server's agent event stream does not require a token. `serve` and `review` use it only when the flag is set or when the service cannot be started. Tests that need a single plan in-process call `startLivingPlanServer` directly.

## Consequences

Two hosting modes remain. The session implementation is shared, so behavior stays the same. The private server does not restore sessions after exit, and it does not appear in the machine plan list unless something registers it the old way. Docs and skills describe the service as the default and this flag as the exception.
