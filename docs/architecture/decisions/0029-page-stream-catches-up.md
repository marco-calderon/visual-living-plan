# ADR 0029: A plan page catches up from hello, and the host merges run changes

- Status: Accepted
- Date: 2026-11-05

## Context

A person keeps one plan tab open while an agent works. That tab often showed the wrong run state.

- The page heard a start or a stop only as an event. A page whose stream dropped (sleep, a network change, a service restart for a new CLI version, a tab restored from the back-forward cache) missed it and never caught up. A stream the browser closed for good was never opened again, and the listeners on it were lost.
- The local page reloaded itself on every start and stop.
- `execution push` and `execution stop` read the run first with a plain `GET`. On a hosted plan that read is refused without the account, so both commands failed and a hosted page stayed on Running.
- The hosted page opened with the run left out and its forms unlocked, and an agent edit during a run sent `locked: false`.

## Decision

- Every page stream opens with `hello`: the mode, the review, and the run as they are now. The local service already sent one. The Durable Object now sends one on each page socket, read without awaiting, so a write after it reaches that socket as its own event. The page applies `hello` the same way as the events it replaces.
- The page has one connection (`client/planEvents.ts`) under one event hub. Listeners, including the inline script on the local page, attach to the hub, so they survive a reconnect. The connection opens again after a refused stream, on `online`, on `pageshow`, and when a visible tab has a closed or quiet stream. It backs off from one to 15 seconds.
- The host pings every open page: an SSE `ping` every 20 seconds locally, and a `pong` the Durable Object returns for the page's `ping` without waking. A stream quiet for 50 seconds is opened again. While the stream is down for more than three seconds the status reads Reconnecting.
- A plan on loopback does not wait for `navigator.onLine`. It works without a network.
- `POST /api/execution/start`, `/push`, and `/stop` exist on both hosts and merge the fields they are sent into the stored run (`applyExecutionChange` in `src/execution.ts`). The CLI calls those, so it never reads the run first. It falls back to read and replace on a host without them. The plan bearer may also read `GET /api/execution`.
- A start or stop changes the page in place: the status, the lock banner, the locked panel, and the forms. The hosted page is served with the run, so it opens on Running with its forms locked.

## Consequences

A page shows the run the host has, within one reconnect, without a reload. The agent's only duty is to run `execution stop` when the work ends.

The Durable Object `hello` leaves out the plan's expected workflow, because building it awaits the parser. The Workflow tab reads `GET /api/execution` after each `hello` for that.
