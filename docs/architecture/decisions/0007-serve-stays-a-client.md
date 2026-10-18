# ADR 0007: The serve command stays a client of the one service

- Status: Accepted. The bullet that keeps `serve` printing until it is stopped is superseded by [ADR 0012](0012-submission-delivery.md).
- Date: 2026-10-11

[ADR 0012](0012-submission-delivery.md) changes the attached client: `serve` and `events` print undelivered submissions and exit, instead of printing until the process is stopped. The page still stays up on the service.

## Context

[ADR 0004](0004-one-plan-service.md) hosts every plan on one service and had `serve` register the plan and exit. A later `events` or `wait` process was the only client that heard a form, choice, question, approval, or review. The command that created the plan was already gone, so the submission waited until something else subscribed.

## Decision

With the registry, there is still one server. It hosts every plan. Each `serve` process is a client of that server for the plan it just registered.

- The service pushes `interaction` and `review` to every client subscribed to that plan.
- A client subscribed to a different plan does not receive them.
- `serve` prints those events until it is stopped. Stopping it leaves the page up on the service.
- A client that connects after the submit still sees stored responses in `hello`.
- `--detach` registers and returns without subscribing. `events` and `wait` remain extra clients of the same plan.
- `--no-registry` is unchanged. That process is the server for one plan.

## Consequences

The process that created the plan hears the person's submission. Two plans on one machine stay isolated. Several clients of one plan all see the same submission. Agents that need the URL and then to keep working pass `--detach`.
