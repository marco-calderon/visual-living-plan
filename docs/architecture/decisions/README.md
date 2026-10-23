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
| [0008](0008-dashboard-window-query.md) | 2026-10-12 | Accepted | Dashboard period filters run inside the finished-run query |
| [0009](0009-plan-part-comments.md) | 2026-10-13 | Accepted | Comments on plan parts use the same agent event stream |
| [0010](0010-local-hostname.md) | 2026-10-15 | Superseded by 0016 | Loopback plans are published as living-plan.local |
| [0011](0011-live-session-mode.md) | 2026-10-15 | Accepted | Session mode is live on the open tab, and review leaves the plan open |
| [0012](0012-submission-delivery.md) | 2026-10-17 | Accepted | Submissions are stored with `delivered_at` and the CLI exits after printing them |
| [0013](0013-iterate-keeps-review.md) | 2026-10-18 | Accepted | Iterate leaves the session in review and comments record an outcome |
| [0014](0014-comment-replies.md) | 2026-10-19 | Accepted | An agent reply is stored on the comment and shown on its thread |
| [0015](0015-service-logs.md) | 2026-10-22 | Accepted | Diagnostic logs are files under ~/.living-plan, by day and by plan |
| [0016](0016-loopback-address.md) | 2026-10-22 | Accepted | Loopback plans are published as 127.0.0.1 |

Add the next decision as `0017-short-name.md` and link it in this table. Record the date, the status, what was decided, and what it replaced.
