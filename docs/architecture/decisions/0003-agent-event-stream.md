# ADR 0003: Push user submissions to the agent on an event stream

- Status: Accepted. How `events` prints, and the name of a live submission on the agent stream (`notice`), are superseded by [ADR 0012](0012-submission-delivery.md). The stream itself remains.
- Date: 2026-10-10

## Context

A form, choice, question, approval, or review on the plan page has to reach the agent that is waiting on it. The page already received server-sent events. The agent's `wait` command did not. It polled `GET /api/plan` once a second from a separate process. `review` was notified only because it ran inside the same process as the server.

## Decision

The plan session writes each user submission to an agent event stream, `GET /api/agent-events`. The event names match the browser stream: `interaction` and `review`, plus `hello` when a client connects. `hello` carries the responses and review already stored, so a client that connects late still sees them.

`events` prints every event until it is stopped. `wait` and `review` read the same stream and return when the event they asked for arrives. A blocking request for a single id was considered and not used. One subscription covers every interaction on that plan.

On the shared service the stream requires the plan token or the service token. The private `--no-registry` server leaves the stream open, like the rest of its API.

## Consequences

The agent hears a submission when the user makes it, without a poll loop and without a process sitting between polls. Clients must hold the HTTP connection open. A service restart drops the connection. The new service sends `hello` again, including anything saved before the restart.
