---
name: live-plan
description: >-
  Drive a living visual plan with the live-plan CLI so a human can watch phase
  status and answer choices, forms, questions, and approval gates in a browser.
  Use when work has multiple steps, needs a human decision before continuing,
  needs Approve/Deny/Iterate on a plan, should show the expected workflow
  before a run, or should stream a live workflow diagram. Invoke with `npx --yes visual-living-plan` unless the `live-plan`
  command is already installed. Skip for a one-step change or when the user
  asked for prose only.
---

# Live Plan

Keep one `.plan.md` file as the channel between you and the human. You update the file. They watch a URL, answer interactions, and (in review) Approve, Deny, or Iterate.

## Invoke

Use npx unless `live-plan` is already on `PATH`.

```bash
npx --yes visual-living-plan <command> [args]
live-plan <command> [args]
```

Do not call this repo's `npm run` scripts from a consuming project. Those are for developing Live Plan itself.

`serve` and `review` stay running. Start them in the background and reuse the printed URL. `wait` and `review` block until the human responds or `--timeout` fires.

## When to use

- Show current status as phases, not a chat wall.
- Block on one choice, form, question set, or approve/deny gate.
- Get an explicit Approve / Deny / Iterate on the plan.
- Show the expected workflow before a run, then stream the live diagram while you implement.

Skip when the change is a single obvious step, the user asked for plain prose, or no one can open the URL.

## Loop

1. Write the plan: title, short summary, phases, a `workflow` block for the expected path, then only the interactions you need now. Schemas are in [primitives.md](primitives.md).
2. Validate: `npx --yes visual-living-plan check path/to/work.plan.md`.
3. `serve` the file for live status, or `review` when you need a verdict on the whole plan.
4. Block with `wait <id> --url <printed-url>` when you cannot continue without that answer.
5. Apply the JSON response. Update phase `status` and checklist `done` in the same file.
6. During implementation, `execution start`, `execution push` as the graph changes, then `execution stop` before the next plan interaction. Forms and review return HTTP 409 while execution is active.
7. Review exits `0` approve (proceed), `1` deny (stop), `2` iterate (edit the same file, bump `--iteration`, run `review` again), `3` timeout.

```bash
npx --yes visual-living-plan serve path/to/work.plan.md --port 9410
npx --yes visual-living-plan wait fail-mode --url http://127.0.0.1:9410 --timeout 30m
npx --yes visual-living-plan review path/to/work.plan.md --iteration 1 --timeout 4h
npx --yes visual-living-plan execution start --url http://127.0.0.1:9410 \
  --step "Implement middleware" --graph path/to/graph.json
npx --yes visual-living-plan execution stop --url http://127.0.0.1:9410
```

Replace the npx prefix with `live-plan` when the command is installed.

## Commands

| Command | Use |
|---|---|
| `check <file>` | Parse check before showing the plan. Prints title, block types, interaction ids, and expected workflow nodes. |
| `dump <file>` | Full parsed plan as JSON. |
| `serve <file>` | Watch mode. Plan + Workflow + Settings tabs. The Workflow tab draws the plan before the run, then the live graph. Reloads when the file changes. |
| `review <file>` | Watch mode plus Approve / Deny / Iterate. Blocks until a decision. |
| `wait <id> --url <url>` | Block until that interaction is answered. Prints the response JSON. |
| `execution start\|push\|stop --url <url>` | Turn the live workflow overlay on, update it, or turn it off. |
| `theme get\|set` | Read or change the accent color. Use `--url` while serving, or `--plan` / `--config` to edit `live-plan.config.json`. |

`--timeout` defaults to 4 hours. Always pass a unit (`30s`, `45m`, `4h`). A bare number is milliseconds. `--port 0` picks a free port. `--host` defaults to `127.0.0.1`. `--no-open` is only for headless runs. `--graph` is the portable execution payload; `--scene` is optional and adapter-specific. Accent color lives in `live-plan.config.json` beside the plan (`theme.accent`). Humans can also pick it on the Settings tab.

```bash
npx --yes visual-living-plan theme set --accent #0369a1 --url http://127.0.0.1:9410
npx --yes visual-living-plan theme set --accent #0369a1 --plan path/to/work.plan.md
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
- `workflow` — expected execution diagram drawn on the Workflow tab before the run. Omit it and the diagram follows phases and gates in document order.

Use the same node id as the plan block id so a click jumps to that section. A self-loop (`from` and `to` are the same id) is drawn as an arc. To close a loop with another card, set `fromSide` and `toSide` (`top`, `right`, `bottom`, or `left`) on the return edge. Live graph nodes use `id`, `label`, optional `detail`, `status` (`pending` \| `active` \| `blocked` \| `done` \| `failed`), and optional `x` / `y`. Edges are `{ from, to }` plus optional `label`, `fromSide`, and `toSide`.

Copy-paste schemas and response examples: [primitives.md](primitives.md).

## Rules

- One plan file per task. Edit it in place.
- Add an interaction only if you will `wait` on it or the human must answer it inside `review`.
- `execution stop` before `wait` or before expecting a review decision.
- Open the browser for the human. Do not pass `--no-open` unless they cannot use a local browser.
- Phase and callout bodies support headings, lists, fenced code, bold, italic, and inline code.
