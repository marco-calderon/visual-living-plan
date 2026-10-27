# Agent guidelines for Live Plan

Use Live Plan when a human needs a live view of what you are doing, or must answer something before you continue. You own one `.plan.md` file. The human watches a browser URL.

The CLI runs on Bun. Invoke it with **bunx** unless the `live-plan` command is already installed.

```bash
# Default. No global install.
bunx visual-living-plan <command> [args]

# After `npm install -g visual-living-plan` (or a local install that puts the bin on PATH).
live-plan <command> [args]
```

`bunx visual-living-plan` runs the published package. `live-plan` is the same program once installed. Bun must be on `PATH`. Do not use this repository's `npm run` scripts unless you are developing Live Plan itself.

Copy [`skills/live-plan/`](../skills/live-plan/SKILL.md) into your agent's skills directory (`.cursor/skills/live-plan/` or `.claude/skills/live-plan/`) so the loop and primitives load automatically. Schemas live in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md).

Changing this repository: start with [`docs/context.md`](context.md) and [`docs/architecture`](architecture/README.md).

## When to use it

- The work has several steps and the human should see which step is active.
- You need a single choice, structured fields, open answers, or an approve/deny gate before continuing.
- You want an explicit Approve / Deny / Iterate on the plan as a whole.
- You want the expected workflow visible before the run, then a live diagram while plan forms stay locked.

Skip it for a one-step change, when the user asked for prose only, or when nobody can open the URL. A blocked `wait` or `review` with no human is a hang.

## How to run it

`serve` registers the plan on the one machine service. Without `--detach` it prints undelivered submissions for that plan and exits. The page stays up after it exits. Pass `--detach` to register and return, then use `events` or `wait` on the printed URL. `events` prints the next undelivered submissions and exits. Start it again every time it exits on a comment, denial, approval, or other event, so a pending submission is delivered. After an approval, run `watch` and leave that process up while you execute. `wait` and `review` block on that same stream and ack the row they return.

```bash
bunx visual-living-plan check path/to/work.plan.md

bunx visual-living-plan serve path/to/work.plan.md

bunx visual-living-plan serve path/to/work.plan.md --detach
bunx visual-living-plan events --url <printed-plan-url>

bunx visual-living-plan watch --url <printed-plan-url>

bunx visual-living-plan wait fail-mode --url <printed-plan-url> --timeout 30m

bunx visual-living-plan review path/to/work.plan.md --iteration 1 --timeout 4h

bunx visual-living-plan execution start --url <printed-plan-url> \
  --step "Implement middleware" --detail "Editing gateway.ts" \
  --graph path/to/graph.json
bunx visual-living-plan execution push --url <printed-plan-url> \
  --step "Add coverage" --graph path/to/graph.json
bunx visual-living-plan execution stop --url <printed-plan-url>
```

Swap the `bunx visual-living-plan` prefix for `live-plan` when that command is on `PATH`.

| Command | What it does | Exit |
|---|---|---|
| `check <file>` | Parse the plan and print title, block types, interaction ids, and workflow nodes. A missing workflow block is an error. | `0` ok, `1` usage, parse error, or missing workflow |
| `dump <file>` | Print the parsed plan as JSON | `0` ok, `1` usage or parse error |
| `serve <file>` | Register the plan on the machine service. Without `--detach`, print undelivered submissions as JSON and exit. `--detach` prints the URL and returns. The page and the service stay up either way. | `0` printed or detached, `1` the stream failed or the delivery ack failed |
| `review <file>` | Same page plus Approve / Deny / Iterate. Blocks on the agent event stream until a decision, then leaves the plan open. Approve and deny return the session to watch. Iterate leaves it in review. | `0` approve, `1` deny, `2` iterate, `3` timeout |
| `mode <watch\|comment\|review> --url <url>` | Switch that session. Comment arms the part selector. Review shows the verdict bar. Watch is the status page. The open tab follows. A comment does not leave comment mode. | `0` switched, `1` usage or HTTP error |
| `reply <comment-id> --url <url> --text "..."` | Answer one plan comment. A minibar message shows the reply on the tray. A part comment shows it on that part. The reply is saved with the session. | `0` sent, `1` usage or HTTP error |
| `wait <id> --url <url>` | Block on the agent event stream until that interaction id is answered. Prints the response JSON. | `0` answered, `1` missing `--url`, `3` timeout |
| `events --url <url>` | Print each undelivered `interaction`, `review`, and `comment` as one JSON object per line, then exit. If the server already has some, print those and exit instead of waiting. Start it again after every exit. | `0` printed or stopped, `1` the stream failed or the delivery ack failed |
| `watch --url <url>` | Switch the session to watch mode and stay running while the plan executes. Prints later submissions without exiting. Stop it when execution is finished. | `0` stopped, `1` the stream failed |
| `close --url <url>` | Drop that plan from the service. | `0` closed, `1` usage |
| `execution start\|push\|stop --url <url>` | Drive the live workflow overlay. `start` turns it on, `push` updates it, `stop` turns it off and unlocks plan forms. | `0` ok, `1` usage or HTTP error |
| `processes` | List plans hosted by the service, including directory and git status. `ps` is the same command. | `0` |
| `logs` | Print the development log saved under `~/.config/living-plan/logs`. The page does not show it. `--level error`, `warn`, or `log` filters. `--day YYYY-MM-DD` reads one registry day (today when omitted). `--url` reads one plan and ignores `--day`. | `0` printed, including when the file is missing, `1` bad arguments |
| `dashboard` | Open the registry dashboard of running and executed plans (day, week, and month). | `0` when the registry is up, `1` when it is not |
| `tui` | The registry in the terminal. Starts the plan service when it is not already running. `p` is the running-plan list. `d` is the dashboard (`--period` is `day` by default, or `week` or `month`). Active plans are listed first. Quitting leaves the service up. | `0` when you quit, `1` when the terminal is not interactive, the arguments are wrong, or the registry cannot start |
| `theme get\|set` | Read or write the accent color. Prefer `--url` while `serve`/`review` is up; otherwise `--config` / `--plan` writes `live-plan.config.json`. | `0` ok, `1` usage or HTTP error |

Flags:

- `--port` is the private server port with `--no-registry`. Otherwise it is used only when the service is not already running.
- `--host` defaults to `127.0.0.1`. The printed URL uses that address, for example `http://127.0.0.1:9477/plans/<id>/`. Set `--host` to a reachable address when a cloud agent must share the URL.
- `--timeout` defaults to 4 hours. Always include a unit: `30s`, `45m`, `4h`. A bare number is milliseconds.
- `--iteration N` labels a review round (default `1`). Bump it when you re-open review after Iterate.
- `--out <file>` writes the review JSON as well as printing it.
- `--no-open` skips launching a browser. Use it only for headless or CI runs. A person should get the page opened.
- `--detach` on `serve` registers the plan and returns. Omit it to print undelivered submissions and exit. Start `events` again each time that process exits. After an approval, `watch` stays up until execution is finished.
- `--no-registry` serves this plan in its own process. By default `serve` and `review` use the machine service, so every planner page can list running plans.
- `--registry-port` sets the service port (default `9477`, loopback only).
- `--token` authorizes `events`, `wait`, and `close`. When omitted, the CLI reads the local service token.
- `--graph <file.json>` is the portable execution graph. `--scene <file.json>` is optional adapter-specific extras. Prefer `graph`.
- `--step` and `--detail` are the current execution headline.
- `--config <file>` points at the theme config (default `live-plan.config.json` beside the plan). `--accent #hex` sets the accent for `theme set`.
- `--plan <file.plan.md>` with `theme` resolves the config path beside that plan.

`check` before the first `serve` or `review`. Fix parse failures before asking a human to look.

## Agent loop

1. Write or update one `.plan.md`. Title, a short summary, phases, a required `workflow` block (the execution path), then only the interactions you need right now.
2. `check` the file.
3. `serve` for ongoing status, or `review` when you need Approve / Deny / Iterate on the whole plan. Pass `--detach` when this process has to return before the person answers. Without `--detach`, `serve` exits when submissions are ready.
4. Run `events --url <printed-url>` and let it stay in the background until it exits. Read the JSON lines it prints. Each line is `{ "event", "id", "seq", "data" }` for a comment, an interaction (including an approve/deny gate), or a review verdict. If people submitted while `events` was not running, the new process prints those pending rows and exits immediately.
5. Whenever `events` exits because of a comment, a denial, an approval, or any other event, handle the JSON, then start `events` again. That reconnect delivers anything still pending, including another comment that arrived after the process closed. If it prints and exits again, handle that batch and reconnect. Leave `events` running only when it is waiting because the server has nothing pending. A comment on a plan part has `partId`, `kind`, `excerpt`, and `text` on `data`. It is allowed while execution is live. `POST /api/comments/:id/address` marks it addressed and clears the corner icon. `live-plan reply <comment-id> --url <printed-url> --text "..."` answers that comment. The open page shows the reply on the messages minibar when the comment came from there, and on the part's comment thread otherwise. The reply is stored with the session in the registry. Use `wait <id> --url <printed-url>` only when you must block on one interaction id.
6. On review **deny**, stop the work, and still reconnect `events` once so a pending comment is not stranded. On **iterate**, edit the same file, bump `--iteration`, and run `review` again. The plan stays open. Approve and deny put it back in watch. Iterate leaves the session in review and marks unaddressed comments in progress. `close` is what drops it.
7. On review **approve**, or an approve gate with `approved: true`, stop the waiting `events` process. Start `watch --url <printed-url>` and keep it running for the whole execution. It puts the page in watch mode, the status view. While it is up, update phase `status` and checklist `done` in the plan file, `execution start`, then `execution push` as the workflow graph changes, then `execution stop` when the run is done. The page reloads on save and follows those workflow updates. Plan forms and review are rejected with HTTP 409 while execution is active. If `watch` prints a submission, handle it and leave `watch` running.
8. After execution has finished, stop the `watch` process. It is safe to close it then. Read any JSON it printed. Start `events` again if a person still has to answer something.

Section diffs are computed from the previous snapshot of that plan session. Editing the file while the plan is hosted marks added, edited, and removed sections.

## Primitives

A plan is optional YAML frontmatter, then markdown, plus Markdoc tags. Every interactive block needs a stable `id`. Do not rename an id after a human may have answered it. A YAML fence whose language is the tag name still renders. Write new entries as tags. A tag may contain another tag.

| Tag | Role | Human input |
|---|---|---|
| `phase` | Timeline step. `status`: `pending`, `active`, `blocked`, `done`, `failed` | No |
| `callout` | Highlight. `kind`: `note`, `tip`, `risk`, `decision`, `warning` | No |
| `choice` | Mutually exclusive options. Each option is an `{% option %}` tag | One option |
| `form` | Named fields (`text`, `number`, `textarea`, `select`) in a `yaml` fence inside the tag | Field values |
| `questions` | Open questions, one `{% item %}` per question | One answer per item |
| `approve` | Yes/no gate with an optional note | `approved` plus optional note |
| `checklist` | Definition of done. Each `{% item done=false %}` is a row | No (you update `done`) |
| `workflow` | Required. The execution path. The Workflow tab draws it before the run, and the live run follows it. Node `ref` is the plan block a click opens. Nodes and edges live in a `yaml` fence inside the tag | No |

Frontmatter fields the parser reads: `title`, `summary`, `agent`, `mode` (`watch` or `review`). A leading `#` heading is the title when frontmatter has none.

Full tag shapes and the JSON each interaction returns are in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md). A fence-authored file that still renders is [`examples/rate-limit.plan.md`](../examples/rate-limit.plan.md). An execution graph is [`examples/execution-graph.json`](../examples/execution-graph.json).

Authoring rules:

- Keep one plan file for the task. Update it in place.
- Mark exactly one phase `active` while work is underway.
- Add an interaction only when you will block on the answer.
- Prose is connective. Status, risks, and decisions belong in `phase` and `callout` blocks.
- Phase and callout bodies are markdown: headings, lists, pipe tables, fenced code, `**bold**`, `*italic*`, and `` `code` ``. `{% status status="active" /%}` is an inline status chip in that prose.
- A pipe table renders as a table. The row under the header is a separator such as `| --- |`. `:---`, `---:`, and `:---:` align that column left, right, and center. A blank line ends the table.
- Show source the human should read with a language fence (`ts`, `python`, `bash`). It is highlighted and numbered from 1. Add `start=40` after the language when the snippet is a slice of a larger file. Put that fence in the plan markdown or inside a `phase`, `callout`, or `approve` tag.
- Show a change with a `diff` or `patch` fence, not the whole file. Write `---` / `+++` file headers and a `@@ -oldStart,oldCount +newStart,newCount @@` hunk. A `-` line counts only as old, a `+` line only as new, and a leading space counts as both. Those counts must match. A hunk without file headers still renders; `ts diff` highlights that hunk as TypeScript. `start=` does not apply to a diff.
- A mermaid fence draws a figure in the plan text. Put that fence in the plan markdown or inside a `phase`, `callout`, or `approve` tag.
- Include one `workflow` block. `check` fails when it is missing.

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

Node `status` is `pending`, `active`, `blocked`, `done`, or `failed`. The workflow diagram lays nodes out automatically. `x` and `y` are accepted and are not required. Edges may set `label`, `fromSide`, and `toSide` (`top`, `right`, `bottom`, `left`). A self-loop (`from` and `to` are the same id) is drawn as an arc.

## Theme / accent color

Humans can change the accent on the Settings tab. The choice is saved to `live-plan.config.json` beside the plan (override with `--config` on `serve` / `review`). Agents should use the CLI, not hand-edit CSS:

```bash
bunx visual-living-plan theme get --url <printed-plan-url>
bunx visual-living-plan theme set --accent #0369a1 --url <printed-plan-url>

# Offline / before serve: write the config file next to the plan
bunx visual-living-plan theme set --accent #0369a1 --plan path/to/work.plan.md

# Without --plan / --config / --url: machine-wide ~/.config/living-plan/live-plan.config.json
bunx visual-living-plan theme set --accent #0369a1
```

Config shape:

```json
{
  "theme": {
    "accent": "#0f766e"
  }
}
```

While the server is running, prefer `--url` so the page updates live. Editing the config file on disk is also watched.

## HTTP, when the CLI is not enough

The server URL from `serve` or `review` exposes:

- `GET /` — Plan, Workflow, and Settings tabs
- `GET /api/plan` — parsed plan, `responses`, `pendingInteractionIds`, execution state, planned workflow graph, and `theme`
- `GET /api/events` — browser server-sent events: `hello`, `reload`, `interaction`, `review`, `comment`, `mode`, `execution`, `theme`, `error`
- `GET /api/agent-events` — the stream `events` and `wait` use. Requires a bearer token on the shared service. `hello` includes current responses, review, and `pending` (submissions whose `delivered_at` is empty). `notice` follows as the user submits.
- `POST /api/agent-events/ack` — `{ "ids": ["evt_..."] }` sets `delivered_at` on those rows. The CLI calls this after it prints them.
- `POST /api/interactions/:id` — submit one response (409 while execution is active)
- `POST /api/review` — `{ "decision": "approve" \| "deny" \| "iterate", "note"?: "..." }` (review mode only; 409 while execution is active)
- `GET /api/execution` and `PUT /api/execution` — read or replace execution state. `GET` includes `planned` (the expected workflow) even while execution is idle
- `POST /api/execution/start` and `POST /api/execution/stop` — convenience toggles
- `GET /api/processes` — other plans started through the CLI, with directory and git status. Each `url` opens that plan's site.
- Registry `GET /dashboard` — running and executed plans, with day, week, and month summaries. `live-plan dashboard` opens it. Plan files are copied into the registry home under `plans/`.
- `GET /api/theme` and `PUT /api/theme` — read or set `{ "accent": "#hex" }` (persists to the theme config file)
- `GET /api/logs` and `POST /api/logs` — errors, warnings, and logs that are not submissions. `GET` accepts `level` (`error`, `warn`, or `log`) and `limit` (1 to 500). On the service, root `GET /api/logs` is today's registry file under `~/.config/living-plan/logs`. `live-plan logs` reads those files directly. A restart leaves them in place.

Prefer the CLI. Use HTTP only to inspect state or when another process must submit on the human's behalf.
