# Agent guidelines for Live Plan

Use Live Plan when a human needs a live view of what you are doing, or must answer something before you continue. You own one `.plan.md` file. The human watches a browser URL.

Invoke the CLI with **npx** unless the `live-plan` command is already installed.

```bash
# Default. No global install.
npx --yes visual-living-plan <command> [args]

# After `npm install -g visual-living-plan` (or a local install that puts the bin on PATH).
live-plan <command> [args]
```

`npx --yes visual-living-plan` runs the published package. `live-plan` is the same program once installed. Do not use this repository's `npm run` scripts unless you are developing Live Plan itself.

Copy [`skills/live-plan/`](../skills/live-plan/SKILL.md) into your agent's skills directory (`.cursor/skills/live-plan/` or `.claude/skills/live-plan/`) so the loop and primitives load automatically. Schemas live in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md).

## When to use it

- The work has several steps and the human should see which step is active.
- You need a single choice, structured fields, open answers, or an approve/deny gate before continuing.
- You want an explicit Approve / Deny / Iterate on the plan as a whole.
- You are implementing and want a live execution diagram while plan forms stay locked.

Skip it for a one-step change, when the user asked for prose only, or when nobody can open the URL. A blocked `wait` or `review` with no human is a hang.

## How to run it

`serve` and `review` are long-running. Start them in the background, read the printed URL, and keep that URL for `wait` and `execution`.

```bash
npx --yes visual-living-plan check path/to/work.plan.md

npx --yes visual-living-plan serve path/to/work.plan.md --port 9410

npx --yes visual-living-plan wait fail-mode --url http://127.0.0.1:9410 --timeout 30m

npx --yes visual-living-plan review path/to/work.plan.md --iteration 1 --timeout 4h

npx --yes visual-living-plan execution start --url http://127.0.0.1:9410 \
  --step "Implement middleware" --detail "Editing gateway.ts" \
  --graph path/to/graph.json
npx --yes visual-living-plan execution push --url http://127.0.0.1:9410 \
  --step "Add coverage" --graph path/to/graph.json
npx --yes visual-living-plan execution stop --url http://127.0.0.1:9410
```

Swap the `npx --yes visual-living-plan` prefix for `live-plan` when that command is on `PATH`.

| Command | What it does | Exit |
|---|---|---|
| `check <file>` | Parse the plan and print title, block types, and interaction ids | `0` ok, `1` usage or parse error |
| `dump <file>` | Print the parsed plan as JSON | `0` ok, `1` usage or parse error |
| `serve <file>` | Watch the file and serve Plan + Execution. Hot-reloads on save. | Stays up until SIGINT/SIGTERM |
| `review <file>` | Same UI plus Approve / Deny / Iterate. Blocks until a decision. | `0` approve, `1` deny, `2` iterate, `3` timeout |
| `wait <id> --url <url>` | Block until that interaction id has a response. Prints the response JSON. | `0` answered, `1` missing `--url`, `3` timeout |
| `execution start\|push\|stop --url <url>` | Drive the execution canvas. `start` turns it on, `push` updates it, `stop` turns it off and unlocks plan forms. | `0` ok, `1` usage or HTTP error |

Flags:

- `--port` defaults to an ephemeral port (`0`). Pass a fixed port when you need a stable URL.
- `--host` defaults to `127.0.0.1`. Set a reachable host when a cloud agent must share the URL.
- `--timeout` defaults to 4 hours. Always include a unit: `30s`, `45m`, `4h`. A bare number is milliseconds.
- `--iteration N` labels a review round (default `1`). Bump it when you re-open review after Iterate.
- `--out <file>` writes the review JSON as well as printing it.
- `--no-open` skips launching a browser. Use it only for headless or CI runs. A person should get the page opened.
- `--graph <file.json>` is the portable execution graph. `--scene <file.json>` is optional adapter-specific extras. Prefer `graph`.
- `--step` and `--detail` are the current execution headline.

`check` before the first `serve` or `review`. Fix parse failures before asking a human to look.

## Agent loop

1. Write or update one `.plan.md`. Title, a short summary, phases, then only the interactions you need right now.
2. `check` the file.
3. `serve` for ongoing status, or `review` when you need Approve / Deny / Iterate on the whole plan.
4. If you need one answer first, `wait <id> --url <printed-url>`. You can also read `GET /api/plan` and look at `responses`.
5. Apply the response. Update phase `status` and checklist `done` in the same file. The page reloads on save.
6. While implementing, `execution start`, then `execution push` as the graph changes, then `execution stop` before the next plan interaction. Plan forms and review are rejected with HTTP 409 while execution is active.
7. On review **approve**, proceed. On **deny**, stop. On **iterate**, edit the same file, bump `--iteration`, and run `review` again.

Section diffs are computed from the previous in-memory snapshot of that server process. Editing the file while `serve` or `review` is running marks added, edited, and removed sections.

## Primitives

A plan is optional YAML frontmatter, then markdown, plus fenced YAML blocks. Every interactive block needs a stable `id`. Do not rename an id after a human may have answered it.

| Fence | Role | Human input |
|---|---|---|
| `phase` | Timeline step. `status`: `pending`, `active`, `blocked`, `done`, `failed` | No |
| `callout` | Highlight. `kind`: `note`, `tip`, `risk`, `decision`, `warning` | No |
| `choice` | Mutually exclusive options | One option |
| `form` | Named fields (`text`, `number`, `textarea`, `select`) | Field values |
| `questions` | Open questions, one string per item | One answer per item |
| `approve` | Yes/no gate with an optional note | `approved` plus optional note |
| `checklist` | Definition of done | No (you update `done`) |

Frontmatter fields the parser reads: `title`, `summary`, `agent`, `mode` (`watch` or `review`). A leading `#` heading is the title when frontmatter has none.

Full YAML and the JSON each interaction returns are in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md). A worked file is [`examples/rate-limit.plan.md`](../examples/rate-limit.plan.md). An execution graph is [`examples/execution-graph.json`](../examples/execution-graph.json).

Authoring rules:

- Keep one plan file for the task. Update it in place.
- Mark exactly one phase `active` while work is underway.
- Add an interaction only when you will block on the answer.
- Prose is connective. Status, risks, and decisions belong in `phase` and `callout` blocks.
- Phase and callout `body` is a small markdown subset: headings, lists, fenced code, `**bold**`, `*italic*`, and `` `code` ``.

## Execution graph

Send a portable graph. The page maps it onto the current canvas (React Flow today).

```json
{
  "nodes": [
    { "id": "implement", "label": "Implement middleware", "detail": "Editing gateway.ts", "status": "active", "x": 320, "y": 80 }
  ],
  "edges": [{ "from": "design", "to": "implement" }]
}
```

Node `status` is `pending`, `active`, `done`, or `failed`. `x` and `y` are optional layout hints.

## HTTP, when the CLI is not enough

The server URL from `serve` or `review` exposes:

- `GET /` — Plan and Execution tabs
- `GET /api/plan` — parsed plan, `responses`, `pendingInteractionIds`, execution state
- `GET /api/events` — server-sent events: `reload`, `interaction`, `review`, `execution`
- `POST /api/interactions/:id` — submit one response (409 while execution is active)
- `POST /api/review` — `{ "decision": "approve" \| "deny" \| "iterate", "note"?: "..." }` (review mode only; 409 while execution is active)
- `GET /api/execution` and `PUT /api/execution` — read or replace execution state
- `POST /api/execution/start` and `POST /api/execution/stop` — convenience toggles

Prefer the CLI. Use HTTP only to inspect state or when another process must submit on the human's behalf.
