# ADR 0011: Session mode is live on the open tab

- Status: Accepted. The bullet that returns every review decision to watch is superseded for iterate by [ADR 0013](0013-iterate-keeps-review.md). Approve and deny still return the session to watch.
- Date: 2026-10-15

## Context

Watch, comment, and review were not one session an open tab could follow. Comment mode lived in the browser's `localStorage`. Watch and review were printed into the page when it was rendered. `setMode` stored the new mode and did not tell the tab. `review` then closed the hosted plan when the decision arrived, so the tab died and the waiting CLI exited with the session.

[ADR 0007](0007-serve-stays-a-client.md) already keeps `serve` attached as a client. [ADR 0009](0009-plan-part-comments.md) already sends comments on that same stream. Neither one moved the open page between modes.

## Decision

The session mode is `watch`, `comment`, or `review`. Changing it broadcasts a `mode` event to browsers and agents. The open page updates the mode chip, the part selector, and the review bar from that event. It does not reload.

- `watch` is the status page. The selector is off and the review bar is hidden.
- `comment` arms the selector. Sending a comment does not leave this mode.
- `review` shows the verdict bar and arms the selector. A decision stores the verdict and sets the session back to `watch`. [ADR 0013](0013-iterate-keeps-review.md) keeps Iterate in review.

`serve` on an existing session does not overwrite comment or review. `live-plan mode` and `review` are what change it. `review` still exits 0, 1, or 2, and it does not close the hosted plan. `close` still drops the plan. `--no-registry` is still one process. Approve and deny exit with the page. Iterate leaves that process running ([ADR 0013](0013-iterate-keeps-review.md)).

Comments stay available during execution. The verdict bar stays locked while execution is live.

## Consequences

An open tab survives a comment and a review. [ADR 0012](0012-submission-delivery.md) is what the attached CLI does after it prints. Agents switch modes with `live-plan mode <watch|comment|review> --url`. A later `review` clears the previous decision when the session enters review again. The plan file vocabulary is unchanged. `--no-registry` review no longer always exits with the page: Iterate leaves that process running ([ADR 0013](0013-iterate-keeps-review.md)).
