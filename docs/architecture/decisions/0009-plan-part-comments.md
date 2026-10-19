# ADR 0009: Comments on plan parts use the same agent event stream

- Status: Accepted. Printing those comments is [ADR 0012](0012-submission-delivery.md). In-progress comments and address outcomes are [ADR 0013](0013-iterate-keeps-review.md). Agent replies on a comment are [ADR 0014](0014-comment-replies.md).
- Date: 2026-10-13

## Context

A person looking at a plan needs to point at one rendered part — a paragraph, a title, a mermaid node, a code line — and send a message to the agent. That message is not an answer to a `choice`, `form`, `questions`, or `approve` block, and it has to survive a service restart. The agent already listens on `GET /api/agent-events`.

## Decision

`POST /api/comments` stores one comment on the plan session and broadcasts a `comment` event to browsers and agents. The id is `cmt_` plus a nanoid. `POST /api/comments/:id/address` sets `addressedAt`. The comment is included in `hello`. `serve` and `events` print it from `plan_events`, not from `planClientNotices`.

Comments stay available while execution is live. Choice, form, question, approve, and review stay locked.

The page keeps its server-rendered HTML. A client island draws the hover box, the corner icon for unaddressed comments, and the comment popover. Grabbing starts off. A Comment button fixed to the viewport turns it on.

## Consequences

A late agent hears comments that were sent before it connected. The corner icon comes back after a restart. The plan file itself does not change.
