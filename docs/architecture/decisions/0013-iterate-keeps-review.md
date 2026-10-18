# ADR 0013: Iterate leaves the session in review

- Status: Accepted
- Date: 2026-10-18

## Context

[ADR 0011](0011-live-session-mode.md) stored every review decision and set the session back to watch. A person who chose Iterate still had comments that were not addressed. Sending the page to watch hid the verdict and left those comments idle. Addressing a comment only set `addressedAt`. There was no in-progress state and no outcome.

The session already had the three modes, and [ADR 0012](0012-submission-delivery.md) already stored the original comment as the delivery row.

## Decision

Approve and deny store the verdict and set the hosted session to watch. The plan stays open.

Iterate stores the verdict and leaves the mode on review. The verdict bar hides. Every comment that is not yet addressed is marked in progress (`addressingAt`) and copied onto the review payload (`id`, `sectionId`, `text`). A comment posted after that stays unaddressed until something marks it.

`POST /api/comments/:id/addressing` sets `addressingAt` when the comment is not already addressed or in progress. `POST /api/comments/:id/address` sets `addressedAt`, clears `addressingAt`, and stores `outcome`: `implemented` (the default), `errored`, or `issues`. Neither route inserts a `plan_events` row.

Entering review again clears the stored decision, as [ADR 0011](0011-live-session-mode.md) decided.

`--no-registry` is still one process. Approve and deny close it, and the page with it. Iterate leaves that process running so the page stays up.

## Consequences

The open tab shows an iterate decision without leaving review. The next `review` command enters review again and clears that decision. Agents mark a comment in progress, then address it with an outcome. Comments stay available during execution. Forms and the verdict stay locked with HTTP 409 while execution is active.
