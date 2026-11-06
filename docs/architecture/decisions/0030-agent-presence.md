# ADR 0030: A plan is active only while an agent holds its stream open

- Status: Accepted
- Date: 2026-11-06

## Context

The dashboard showed every hosted plan as Running. A plan session stays open for hours after its agent stops, because the page and the service outlive the CLI. So Running meant "the session is open", and a person could not tell which plans had an agent waiting on them. The plan page had no sign of the agent at all.

The long-running CLI commands (`serve`, `events`, `wait`, `watch`, and `review`) all wait on the plan's agent stream: SSE at `/plans/<id>/api/agent-events` locally, and the agent WebSocket on a hosted plan. Short commands (`execution start`, `push`, `stop`, `reply`, `mode`) do not.

## Decision

- An agent is connected while at least one agent stream is open. The host counts them. Nothing else, such as an execution flag or a recent request, marks a plan active.
- The local session counts its agent streams and records when one last opened or closed. Each change goes to open pages as an `agent` event with `{ connected, clients, seenAt }`. The page `hello` carries the same object, and the served page has it on `body[data-agent]`.
- The agent stream gets a `ping` every 20 seconds, like the page stream, so a peer that went away without closing is noticed and removed. The CLI ignores it.
- The Durable Object tags agent sockets, tells page sockets on open and close, and saves `agentConnected`, `agentSeenAt`, and `agentCheckedAt` in `plans.meta`. While an agent is connected its alarm renews `agentCheckedAt` every minute. The hosted dashboard counts a plan connected only while that lease is under three minutes old, so an object that restarted without seeing its sockets close does not leave a plan active.
- `ProcessRecord` gains `agentConnected` and `agentSeenAt`. The dashboard shows an open plan as Active with an agent connected, and Idle without one. Executed and Interrupted are unchanged. The summary adds `active` and `idle` and keeps `running` as their sum. The filters are All, Active, Idle, Executed, and Interrupted.
- The page shows a small agent icon on the status chip, lit while connected, and an "Agent connected" or "No agent connected · last seen …" fact in the plan card. It waits four seconds before showing a drop, so `events` exiting and starting again does not flicker.

## Consequences

Active means an agent is waiting on the plan right now. An agent that ran `events`, got a submission, and is working on it before it starts `events` again shows as Idle for that time. That is accurate: nothing is listening.

The plan status (Review, Executing, Paused, Stopped, Completed) is unchanged and still comes from the review, the run, and the workflow.
