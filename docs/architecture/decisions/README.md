# Architecture decisions

Decisions are numbered in the order they were made. Superseded decisions stay here so later changes are readable.

| ADR | Date | Status | Decision |
|---|---|---|---|
| [0001](0001-one-server-per-plan.md) | 2026-10-09 | Superseded by 0004 | One HTTP server per living plan |
| [0002](0002-shared-registry-catalog.md) | 2026-10-10 | Superseded by 0004 | A shared registry only catalogs plan processes |
| [0003](0003-agent-event-stream.md) | 2026-10-10 | Accepted | Push user submissions to the agent on an event stream |
| [0004](0004-one-plan-service.md) | 2026-10-10 | Accepted | One machine service hosts every plan |
| [0005](0005-private-server-escape-hatch.md) | 2026-10-10 | Accepted | `--no-registry` keeps a private one-plan server |
| [0006](0006-session-durability.md) | 2026-10-10 | Accepted | Persist sessions, idle them out, restart on version change |
| [0007](0007-serve-stays-a-client.md) | 2026-10-11 | Accepted | `serve` stays a client and hears that plan's submissions |

Add the next decision as `0007-short-name.md` and link it in this table. Record the date, the status, what was decided, and what it replaced.
