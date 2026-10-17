# ADR 0012: The CLI exits after it prints undelivered submissions

- Status: Accepted
- Date: 2026-10-17

## Context

`serve` and `events` held the agent event stream open and printed every `interaction`, `review`, and `comment` until the process was stopped. An agent running that process in the background does not get a finished result until the process exits, so it cannot read the submission and act on it.

A submission can also arrive while that process is stopped. The next client has to learn about it from the server. Replaying every stored response, review, and comment would hand the agent work it has already taken.

## Decision

Each user submission is a row in `plan_events`:

- `interaction` for a choice, form, questions block, or approve/deny gate
- `review` for Approve, Deny, or Iterate
- `comment` for a new plan comment

`delivered_at` stays null until the CLI prints that row and `POST /api/agent-events/ack` names its id. The server then sets `delivered_at`. Addressing a comment, or marking it in progress, updates the comment and does not insert a new row.

`hello.pending` on the agent stream is the rows for that plan whose `delivered_at` is null, in `seq` order. `events`, and `serve` without `--detach`, print those JSON objects and exit. They do not wait for a later submission when any are already pending. When none are pending, they wait for the next `notice`, print it, ack it, and exit. The agent reads that JSON, then starts `events` again.

`wait` and `review` ack the row they return so a later `events` does not print it again. The service keeps the page up after the client exits. `--no-registry` still leaves with the private process, because that process is the server.

`live-plan watch --url` is the execution client. It sets the session to watch mode and stays connected. It prints later submissions and acks them, and it does not exit. The agent stops it after execution finishes.

## Consequences

The agent gets one finished command per batch of submissions. A gap while the CLI is down shows up as pending rows and the next command prints them immediately. A row stays pending if the process prints it and dies before the ack, so the next start delivers it again. Two clients connected at the same moment can both observe one live `notice` before either acks.
