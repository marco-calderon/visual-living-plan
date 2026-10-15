---
name: live-plan
description: >-
  Drive a living visual plan with the live-plan CLI so a human can watch phase
  status and answer choices, forms, questions, and approval gates in a browser.
  Use when work has multiple steps, needs a human decision before continuing,
  needs Approve/Deny/Iterate on a plan, should show highlighted source or a
  diff hunk in the plan, or should show the execution path before a run and
  stream it live. Invoke with `bunx visual-living-plan` unless the `live-plan`
  command is already installed. The CLI runs on Bun.
  Skip for a one-step change or when the user asked for prose only.
---

# Live Plan

Keep one `.plan.md` file as the channel between you and the human. You update the file. They watch a URL, answer interactions, and (in review) Approve, Deny, or Iterate.

## Invoke

Use bunx unless `live-plan` is already on `PATH`. Bun must be installed.

```bash
bunx visual-living-plan <command> [args]
live-plan <command> [args]
```

Do not call this repo's `npm run` scripts from a consuming project. Those are for developing Live Plan itself.

`serve` registers the plan on one machine service and stays attached. It prints each submission for that plan until you stop it. The page stays up after it exits. Pass `--detach` to register and return. `events` and `wait` are extra clients of that same plan. `wait` and `review` block until the human responds or `--timeout` fires.

## When to use

- Show current status as phases, not a chat wall.
- Block on one choice, form, question set, or approve/deny gate.
- Get an explicit Approve / Deny / Iterate on the plan.
- Show the expected workflow before a run, then stream the live diagram while you implement.
- Show source the human should read, or a hunk of what changed, inside the plan.

Skip when the change is a single obvious step, the user asked for plain prose, or no one can open the URL.

## Loop

1. Write the plan: title, short summary, phases, a `workflow` block, then only the interactions you need now. The workflow block is required. It is the execution path. Schemas are in [primitives.md](primitives.md).
2. Validate: `bunx visual-living-plan check path/to/work.plan.md`.
3. `serve` the file for live status, or `review` when you need a verdict on the whole plan. Read submissions from `serve`. Pass `--detach` when you need the URL back before the person answers.
4. After `--detach`, block with `wait <id> --url <printed-url>` when you cannot continue without that answer.
5. Apply the JSON response. Update phase `status` and checklist `done` in the same file.
6. During implementation, `execution start`, `execution push` as the graph changes, then `execution stop` before the next plan interaction. Forms and review return HTTP 409 while execution is active.
7. Review exits `0` approve (proceed), `1` deny (stop), `2` iterate (edit the same file, bump `--iteration`, run `review` again), `3` timeout.

```bash
bunx visual-living-plan serve path/to/work.plan.md
bunx visual-living-plan serve path/to/work.plan.md --detach
bunx visual-living-plan events --url <printed-plan-url>
bunx visual-living-plan wait fail-mode --url <printed-plan-url> --timeout 30m
bunx visual-living-plan review path/to/work.plan.md --iteration 1 --timeout 4h
bunx visual-living-plan execution start --url <printed-plan-url> \
  --step "Implement middleware" --graph path/to/graph.json
bunx visual-living-plan execution stop --url <printed-plan-url>
```

Replace the bunx prefix with `live-plan` when the command is installed.

## Commands

| Command | Use |
|---|---|
| `check <file>` | Parse check before showing the plan. Prints title, block types, interaction ids, and workflow nodes. Exits 1 when the workflow block is missing. |
| `dump <file>` | Full parsed plan as JSON. |
| `serve <file>` | Register the plan on the machine service, print its URL, and print that plan's submissions until stopped. `--detach` returns after the URL. The page reloads when the file changes. |
| `review <file>` | Same page plus Approve / Deny / Iterate. Blocks on the event stream until a decision. |
| `wait <id> --url <url>` | Block on the event stream until that interaction is answered. Prints the response JSON. |
| `events --url <url>` | Print each user interaction and plan comment until stopped. |
| `close --url <url>` | Drop the plan from the service. |
| `execution start\|push\|stop --url <url>` | Turn the live workflow overlay on, update it, or turn it off. |
| `processes` | List plans hosted by the service (directory, git status, site URL). |
| `dashboard` | Open the registry dashboard for running and executed plans. |
| `tui` | Same dashboard in the terminal (`--period day`, `week`, or `month`). Active plans are listed first. |
| `theme get\|set` | Read or change the accent color. Use `--url` while serving, or `--plan` / `--config` to edit `live-plan.config.json`. |

`--timeout` defaults to 4 hours. Always pass a unit (`30s`, `45m`, `4h`). A bare number is milliseconds. `--port 0` picks a free port. `--host` defaults to `127.0.0.1`. On loopback, the printed URL is `http://living-plan.local/plans/<id>/` when that name resolves to loopback and port 80 is open, or `http://living-plan.local:9477/plans/<id>/` when the name resolves but port 80 does not. `--no-local-name` keeps `127.0.0.1`. Set `--host` to a reachable address when the URL must be opened from another machine. `--no-open` is only for headless runs. `--detach` on `serve` registers and returns; omit it to print that plan's submissions in the same command. `--graph` is the portable execution payload; `--scene` is optional and adapter-specific. Accent color lives in `live-plan.config.json` beside the plan (`theme.accent`). Humans can also pick it on the Settings tab.

```bash
bunx visual-living-plan theme set --accent #0369a1 --url <printed-plan-url>
bunx visual-living-plan theme set --accent #0369a1 --plan path/to/work.plan.md
```

## Primitives

Each structured block is a fenced YAML block. The fence language is the type. Give every interactive block a stable `id` and do not rename it mid-run.

- `phase` — step in the timeline. `status`: `pending` \| `active` \| `blocked` \| `done` \| `failed`. One `active` phase at a time.
- `callout` — `kind`: `note` \| `tip` \| `risk` \| `decision` \| `warning`.
- `choice` — human picks one option. Response: `{ kind, id, optionId, label }`.
- `form` — fields of type `text` \| `number` \| `textarea` \| `select`. Response: `{ kind, id, values }`.
- `questions` — one free-text item per question. Response: `{ kind, id, answers }`.
- `approve` — yes/no plus optional note. Response: `{ kind, id, approved, note? }`.
- `checklist` — definition of done. You set `done`; the human does not submit it.
- `workflow` — required. This block is the execution path. The Workflow tab draws it before the run, and the live run follows it.

Use the same node id as the plan block id so a click jumps to that section. A self-loop (`from` and `to` are the same id) is drawn as an arc. To close a loop with another card, set `fromSide` and `toSide` (`top`, `right`, `bottom`, or `left`) on the return edge. Live graph nodes use `id`, `label`, optional `detail`, `status` (`pending` \| `active` \| `blocked` \| `done` \| `failed`), and optional `x` / `y`. Edges are `{ from, to }` plus optional `label`, `fromSide`, and `toSide`.

Copy-paste schemas and response examples: [primitives.md](primitives.md).

## Rules

- One plan file per task. Edit it in place.
- Add an interaction only if you will `wait` on it or the human must answer it inside `review`.
- `execution stop` before `wait` or before expecting a review decision.
- Open the browser for the human. Do not pass `--no-open` unless they cannot use a local browser.
- Phase and callout bodies support headings, lists, pipe tables, fenced code, bold, italic, and inline code. The row under a table header is `| --- |`. A blank line ends the table.
- A mermaid fence draws a figure in the plan text. Put it in the plan markdown, or indent it inside a phase, callout, or approve `body`.
- Include one `workflow` block. `check` fails when that block is missing.

## Showing code

Put the fence in the plan markdown, or indent it under a phase, callout, or approve `body: |`. The inner fence must be indented so it does not close the YAML block. `mermaid` and the YAML block types (`phase`, `callout`, `choice`, and the rest) are not code.

Use a **language fence** when the human should read the code as it stands. Name the syntax (`ts`, `python`, `bash`, `json`). The block is highlighted and numbered from 1. Add `start=40` after the language when the snippet is a slice of a larger file and a note should point at those real lines. `start=` applies only to source, not to a diff.

Use a **diff fence** when the human should see what changed or what you propose to change. Do not paste the whole file for that. Fence language is `diff` or `patch`.

```diff
--- a/gate.ts
+++ b/gate.ts
@@ -3,1 +3,3 @@
-  if (await limiter.over(req)) return reply.code(429).send()
+  if (await limiter.over(req)) {
+    return reply.code(429).send()
+  }
```

- `---` and `+++` name the file. The card header uses that name.
- `@@ -oldStart,oldCount +newStart,newCount @@` sets the line numbers.
- A line that starts with `-` counts only toward `oldCount`. A line that starts with `+` counts only toward `newCount`. A line that starts with a space is context and counts toward both.
- Those counts must match the lines you write.
- A hunk with no file headers still renders. Put the language first (`ts diff`) so that hunk is highlighted as that language.

Copy-paste shapes are in [primitives.md](primitives.md).
