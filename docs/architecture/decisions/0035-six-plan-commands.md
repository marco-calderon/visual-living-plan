# ADR 0035: Six commands drive a plan

- Status: Accepted. Updates [ADR 0012](0012-submission-delivery.md) (`serve` returns by default) and [ADR 0013](0013-iterate-keeps-review.md) (a delivered comment is in progress without `addressing`).
- Date: 2026-11-11

## Context

An agent used about fourteen commands to drive one plan:

- `serve --detach` to show it, then `events` to listen.
- `review` to block on a verdict, `wait` to block on one answer, and `watch` after an approval.
- `addressing`, `reply`, and `address` for every comment.
- `execution start`, `push`, and `stop` around the work.
- `close` at the end.

Each step also needed the plan URL copied from `serve`. Most of these overlap:

- `review`, `watch`, and `wait` all read the agent stream that `events` reads. The verdict, the answer, and the mode change already arrive there as lines ([ADR 0034](0034-listeners-reconnect-across-modes.md)).
- The page already works out its status from the workflow step statuses in the file. Only the run flag needed `start` and `stop`, and a forgotten `stop` left the page on Executing.
- The same plan path always maps to the same plan id, and a hosted plan carries its `cloudId` in the file.

## Decision

- **Six commands.** The core vocabulary is `check`, `serve`, `events`, `mode`, `reply`, and `close`. `review`, `watch`, `wait`, `addressing`, and `address` keep working as shortcuts and move to their own section of the help and the skill. `execution` stays for what the file cannot say.
- **The plan file names the plan.** Every plan command takes the file as a positional `.md` argument or as `--plan <file>`. `--url` still works and wins (`src/planTarget.ts`). A file maps to:
  - its hosted URL, when `cloud.json` has a record for its `cloudId` or its path;
  - otherwise its URL on this machine's service. The service is asked first, and `planIdForPath` covers the case where the service is down.
- **`serve` returns.** It registers the plan, prints the URL, and returns, as `--detach` did. `--listen` keeps the older print-and-exit behavior. `--detach` is accepted and does nothing. `serve --cloud` starts the file uploader it started for `--detach`. `--no-registry` is unchanged, because that process is the server.
- **A delivered comment is in progress.** When a listener acks a `comment` row, the session sets that comment's `addressingAt` if it is neither in progress nor answered, and tells open pages. The page shows Addressing on a part comment and Working on a minibar message, as `addressing` did. The local session and the Durable Object do the same.
- **`reply` answers and closes.** It posts the reply and then `address`. `--outcome` sets the outcome, and `--keep-open` posts only the reply.
- **The run follows the file after approval** (`src/runFollow.ts`):
  - An approve verdict, or an approve gate answered yes, sets the run's `follow` to `armed`.
  - While armed and stopped, an edit of the plan file that leaves a workflow step past pending starts the run: an agent upload or file reload, or a page edit. The approval itself, an answer, and `execution push` start nothing, so a person who just approved a gate can keep answering and commenting until the agent acts on it.
  - Every step done, or one failed, ends the run, whatever started it. It stays armed, so a step set back to active starts it again.
  - An explicit `execution stop` sets `follow` to `off` until the next approval.
  - `follow` is stored with the run, so it survives a restart. Locally the session settles the run after a file reload, an answer, a verdict, and every execution change. On the host the Durable Object does the same after an upload, a page edit, an answer, a verdict, and every execution route.

## Consequences

An agent's loop is `serve`, then `events` again and again, `reply` on comments, `mode review` when it needs a verdict, and phase statuses in the file while it works. No URL is copied, there is one comment command instead of three, and none is needed to start or stop a run.

- A comment shows in progress as soon as the agent received it, even if the agent handles it later.
- After an approval, forms, page comments, and review lock at the agent's first edit that leaves a phase past pending. That is the same lock `execution start` set.
- A plan whose workflow has a step the agent never marks done does not end by itself. Its agent still runs `execution stop`.
- An agent that called `serve` without `--detach` to wait for the first submission now gets the URL back at once. It reads that submission with `events`, which delivers it from the queue, or passes `--listen`.
- Agents that keep the older commands, including `review`'s exit codes, are unaffected.
