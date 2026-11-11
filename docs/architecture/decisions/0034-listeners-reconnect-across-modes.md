# ADR 0034: Listeners reconnect, and one listener follows every mode

- Status: Accepted. Updates the review bullet of [ADR 0011](0011-live-session-mode.md) and [ADR 0013](0013-iterate-keeps-review.md): entering review keeps a verdict no agent has received.
- Date: 2026-11-11

## Context

`serve`, `events`, `watch`, `wait`, and `review` all wait on the plan's agent stream. They reconnected only when the stream closed cleanly. Any error ended them:

- `watch` and `events --follow` exited `1` when the service was down for more than a second, or crashed. A comment sent after the service came back was never printed. The service restarts whenever a CLI of another version connects, so this happened during execution.
- `wait` and `review` printed "Timed out" and exited `3` the moment the service restarted, with most of their `--timeout` left.
- A restarted local service has a new service token. A listener that used it was refused after the restart.
- A failed ack was not retried while the process ran.

Changing mode also took a separate process for each step: `events` until a verdict was wanted, `review` for the verdict, then `watch` for execution. The session already broadcast every mode change on the agent stream ([ADR 0011](0011-live-session-mode.md)), and every verdict is already a `review` row ([ADR 0012](0012-submission-delivery.md)). The CLI ignored the mode events.

Two review bugs sat on that path:

- Locally, `review` started again after the person approved with nobody listening cleared the approval from the page and waited until its timeout. The `review` row was still pending on the server.
- On the host, `review --cloud` for the next round left the previous verdict in place, so it returned the old `iterate` at once. The host also stored no round number.

## Decision

- **One reconnect loop.** `followAgentEvents` (`src/agentStream.ts`) is used by every waiting command. A closed stream is tried again after a second. A failed try waits 1, 2, 4 seconds and so on, up to 30, with some spread. The `hello` on each connect carries what was submitted meanwhile.
- **Only a refusal stops it.** A 400, 401, 402, 403, 404, or 410 on the local stream is final. On a hosted socket only the Worker's 402 is known, so other socket errors are retried. A 401 first re-reads the token (`resolveAgentToken`), which picks up a restarted service's new token. A stream that never connected in this process fails after four tries, so a wrong URL still fails within about ten seconds.
- **Dead lines are noticed.** A line that has shown it pings and is then silent for 70 seconds is reconnected. The local stream already pings every 20 seconds. The CLI sends `ping` on the hosted socket every 25 seconds, and the Durable Object's automatic `pong` answers it without waking the object.
- **A crashed local service is started again.** After two failed tries the loop calls `reviveRegistry`. It starts the service only when the lock is still there and its process is gone, which is what a crash leaves. A service stopped on purpose removes its lock, and one that is starting holds the starting lock. Both are left alone. It never stops a running service of any version, so two CLI versions do not take turns restarting it.
- **Acks are retried.** An ack is retried three times. A row that was printed but stayed pending is acked again on the next `hello` without being printed twice.
- **Notes go to stderr.** `Lost the plan stream (...)` and `Reconnected to the plan stream.` are printed there, so stdout stays JSON lines.
- **Exit codes.** `wait` and `review` exit `3` only when their timeout runs out, and `4` when the stream was refused or never connected. `events --follow` and `watch` exit `0` when the local plan was closed.
- **One listener for every mode.** `events --follow` and `watch` print `{ "event": "mode", "data": { "mode", "iteration" } }` when the session moves to another mode or review round, including a move missed while reconnecting. The line has no `id` and is not acked. The agent stream's `hello` carries `iteration` locally and on the host. `mode --iteration N` sets the round, so `mode review --iteration N` plus one listener replaces the blocking `review` for agents that read output live. The verdict arrives as a `review` line. The host now also sends a `mode` event after a verdict, as the local session does.
- **An unread verdict is kept.** Entering review clears the last verdict only after an agent has acked its `review` row. Until then, `review` started again prints that verdict at once and leaves the mode where the verdict put it. `POST /api/mode` with `review` returns 409 and tells the agent to run `events`. Comment and watch are not affected. The page only toggles between those two.
- **The host follows review rounds.** `review --cloud` for an existing plan starts a new round like the local session does, clearing a delivered verdict. It stores `iteration` in `meta`, and the init call publishes a `mode` event to an open tab. A hosted verdict carries the stored round instead of `1`.

## Consequences

An agent's listener survives a service restart, a version restart, a crash of the local service, and a network change, and nothing sent meanwhile is lost. Agents should not restart a listener that says it lost the stream.

The exit-per-batch `events` loop stays the default for agents that only see a command's output when it exits. An agent that reads output live can keep one `events --follow` for the whole plan, ask for a verdict with `mode review`, and keep the same process through execution.

`wait` and `review` have a new exit code, `4`. A hosted listener whose token is revoked after it connected keeps retrying, because the socket does not say why it was refused. The hosted plan does not refuse an agent socket for a closed plan, so a hosted listener is still stopped by hand after `close`.
