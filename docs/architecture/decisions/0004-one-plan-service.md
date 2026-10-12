# ADR 0004: One machine service hosts every plan

- Status: Accepted. The "serve exits" bullet is superseded by [ADR 0007](0007-serve-stays-a-client.md).
- Date: 2026-10-10

## Context

[ADR 0001](0001-one-server-per-plan.md) started a Node process per plan. [ADR 0002](0002-shared-registry-catalog.md) added a second long-lived process that only kept a directory. Agents on one machine often had several plans open. Each plan paid a cold Node start, its own port, and its own copy of the client assets. The plan page died with the agent process that had started it.

The alternative was one service installed on the machine. Every agent would be a client of it. The cost was a shared event loop, a shared failure domain, and a need to keep one agent's plan away from another.

## Decision

The registry process is the plan service. It hosts every plan for that machine.

- `serve` ensures the service, registers the plan file, prints `http://<host>:<port>/plans/<id>/`, and opens the browser. It used to exit here; [ADR 0007](0007-serve-stays-a-client.md) keeps it subscribed unless `--detach` is set.
- The service watches the file, serves the page, and keeps that plan's responses, execution state, and review state.
- Plan URLs live under `/plans/<id>/`. Client assets are served once from `/client/`.
- The same plan path returns the same id, so a later `serve` reattaches instead of starting a second copy.
- The agent event stream from [ADR 0003](0003-agent-event-stream.md) is how the CLI hears submissions.

This is one service per machine, for the user who installed the CLI. It is not a multi-tenant host. A cloud agent on its own machine runs its own service and shares that URL.

## Consequences

Open plans share one Node process and one port. `serve` no longer has to stay running for the page to stay up. A crash or a stalled event loop takes every plan on that machine down with it. Git status for the plan list is cached briefly so listing plans does not call git once per plan on a timer. Browser calls must use the plan prefix. The CLI resolves API paths against the printed plan URL, not against the origin alone.
