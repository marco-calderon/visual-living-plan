# ADR 0014: An agent reply is stored on the comment

- Status: Accepted
- Date: 2026-10-19

## Context

A person can pin a comment on a plan part or send one from the messages minibar. [ADR 0009](0009-plan-part-comments.md) delivers that comment to the agent. [ADR 0013](0013-iterate-keeps-review.md) lets the agent mark it in progress and then addressed. Neither path carries an answer the person can read on the open page. Addressing updates the comment and does not insert a `plan_events` row, because it is not a new submission for the agent.

## Decision

`POST /api/comments/:id/reply` with `{ "text": "..." }` appends one reply to that comment. The id is `rpl_` plus a nanoid. The same `comment` event is broadcast to browsers and agents. The route does not insert a `plan_events` row, so `events` does not print the reply or exit.

The reply is part of the comment object in the session snapshot, so it is stored in `plan_sessions.comments_json` and comes back after a service restart. `live-plan reply <comment-id> --url <plan-url> --text "..."` calls that route.

A comment sent from the messages minibar (`kind` `message`, or `partId` `review:message`) shows the reply in that tray, and the tray opens. Any other comment shows the reply in that part's comment popover. The popover opens, and the plan block that owns the part plays the same wash used when a block changes.

## Consequences

The person sees an agent answer on the comment they wrote, without a plan-file edit. A late page load reads the reply from the session. The agent still hears the original comment as a submission. The reply itself is not a submission.
