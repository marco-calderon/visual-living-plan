# ADR 0006: Persist sessions, idle them out, and restart on version change

- Status: Accepted
- Date: 2026-10-10

## Context

After [ADR 0004](0004-one-plan-service.md), the service outlives the `serve` command. A restart would otherwise drop answers the user had already submitted. A plan whose agent had finished would otherwise keep a file watch forever. A long-lived process would also keep running yesterday's code after the installed package changed.

## Decision

- Each session is stored in the registry SQLite database: plan path, mode, iteration, responses, execution, review, token, and last-seen time. Startup reopens those plan files and restores that state.
- A session with no browser connection and no agent stream for 6 hours is closed and removed. `live-plan close` removes one immediately. `review` closes its plan after the decision.
- The lock file records the package version that started the service. If the CLI's version differs, it stops that process and starts the current one.
- A missing plan file on startup drops that stored session.

The plan file remains the source of the document. The database stores the interaction state that is not in the file.

## Consequences

A service restart keeps submitted answers, and a reconnecting agent sees them in `hello`. Abandoned plans do not accumulate watches, but a plan with nobody connected is gone after 6 hours and must be registered again. An upgrade interrupts open streams once. Clients reconnect to the new process and read `hello`.
