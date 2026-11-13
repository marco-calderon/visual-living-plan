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

From this repo, `npm run skills:install` copies [`skills/live-plan/`](../skills/live-plan/SKILL.md) and the other project skills into `~/.agents/skills` (your home directory). Run it again to refresh those copies. Schemas live in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md). That skill also describes the page the human sees: Default, Wide, and Full widths, the contents list, the file version on the description card, and the code-wrap setting.

Changing this repository: start with [`docs/context.md`](context.md), [`docs/architecture`](architecture/README.md), and the document design in [`DESIGN.md`](../DESIGN.md). Light and dark use that palette. An accent color does not repaint the page, cards, or body text.

## When to use it

- The work has several steps and the human should see which step is active.
- You need a single choice, structured fields, open answers, or an approve/deny gate before continuing.
- You want an explicit Approve / Deny / Iterate on the plan as a whole.
- You want the expected workflow visible before the run, then a live diagram while plan forms stay locked.

Skip it for a one-step change, when the user asked for prose only, or when nobody can open the URL. A blocked `wait` or `review` with no human is a hang.

## How to run it

Six commands drive a plan, and each names the plan by its file path: `check`, `serve`, `events`, `mode`, `reply`, and `close`. `serve` registers the plan on the one machine service (or the signed-in host with `--cloud`), prints its URL, and returns. `events` is the one listener: every verdict, answer, comment, and page edit arrives there as a JSON line. It exits after printing; start it again each time, or keep one `events --follow` running if your agent reads output live. `mode` switches the session between watch, comment, and review. `reply` answers a comment and marks it answered. After an approval the run follows the plan file, so `execution` is optional. Every command that waits on the stream reconnects by itself after a drop, a service restart, or a network change (see Connection drops below). `review`, `watch`, `wait`, `addressing`, and `address` remain as shortcuts.

```bash
bunx visual-living-plan check path/to/work.plan.md
bunx visual-living-plan serve path/to/work.plan.md            # add --cloud for the hosted service
bunx visual-living-plan events path/to/work.plan.md           # start again after it exits
bunx visual-living-plan events path/to/work.plan.md --follow  # or keep one running
bunx visual-living-plan reply <comment-id> path/to/work.plan.md --text "..."
bunx visual-living-plan mode review path/to/work.plan.md --iteration 1
bunx visual-living-plan close path/to/work.plan.md

# Optional: a custom live diagram, or a run without an approval
bunx visual-living-plan execution push path/to/work.plan.md --step "Add coverage" --graph path/to/graph.json
```

Swap the `bunx visual-living-plan` prefix for `live-plan` when that command is on `PATH`.

| Command | What it does | Exit |
|---|---|---|
| `check <file>` | Parse the plan and print title, block types, interaction ids, and workflow nodes. A missing workflow block is an error. | `0` ok, `1` usage, parse error, or missing workflow |
| `dump <file>` | Print the parsed plan as JSON | `0` ok, `1` usage or parse error |
| `serve <file>` | Register the plan on the machine service (or the signed-in host with `--cloud`), print its URL, and return. The page and the service stay up. `--listen` also prints the next undelivered submissions and exits, as `events` does. `--detach` is accepted and does nothing. | `0` registered, `1` registration failed; with `--listen`, as `events` |
| `review <file>` | Shortcut: `serve`, `mode review`, and a blocking wait for the verdict. Leaves the plan open. Approve and deny return the session to watch. Iterate leaves it in review. A verdict the person sent while no agent received it is kept, and this prints it at once. | `0` approve, `1` deny, `2` iterate, `3` timeout, `4` the stream was refused or never connected |
| `mode <watch\|comment\|review> <file>` | Switch that session. Comment arms the part selector. Review shows the verdict bar. Watch is the status page. The open tab follows. A comment does not leave comment mode. `--iteration N` sets the review round. `mode review` is refused (HTTP 409) while the person's last verdict has not reached any agent. | `0` switched, `1` usage, HTTP error, or an unread verdict |
| `reply <comment-id> <file> --text "..."` | Write the reply and mark the comment answered: sets `addressedAt` and `outcome` (`--outcome implemented` by default, `errored`, or `issues`). A minibar message shows the reply on the tray and the outcome. A part comment shows it in its thread and says Addressed. `--keep-open` writes the reply and leaves the comment open. | `0` sent, `1` usage or HTTP error |
| `addressing <comment-id> <file>` | Shortcut: mark that comment in progress by hand. A listener already does this when it prints the comment. Sets `addressingAt`. | `0` set, `1` usage or HTTP error |
| `address <comment-id> <file>` | Shortcut: mark that comment answered without a reply. Sets `addressedAt` and clears `addressingAt`. `--outcome` is `implemented` (default), `errored`, or `issues`. A part comment says Addressed. A minibar message shows Implemented, Errored, or Had issues. | `0` set, `1` usage or HTTP error |
| `wait <id> <file>` | Shortcut: block on the agent event stream until that interaction id is answered. Prints the response JSON. | `0` answered, `1` missing `--url`, `3` timeout, `4` the stream was refused or never connected |
| `events <file>` | The one listener. Print each undelivered `interaction`, `review`, `comment`, and `edit` as one JSON object per line, ack it, then exit. A printed comment shows in progress on the page. If the server already has some, print those and exit instead of waiting. Start it again after every exit. `--follow` stays connected and prints each submission as it arrives, plus a `mode` line on each mode change, without changing the page mode; use it when your agent can react to each line while the process runs. | `0` printed, stopped, or the plan was closed, `1` the stream was refused, never connected, or the delivery ack failed |
| `watch <file>` | Shortcut for `mode watch` then `events --follow`: switch the session to watch mode and stay running while the plan executes. Prints later submissions and mode changes without exiting. Stop it when execution is finished. | `0` stopped or the plan was closed, `1` the stream was refused or never connected |
| `close <file>` | Drop that plan from the service. | `0` closed, `1` usage |
| `search --query TERMS` | Find terms across every plan on this machine's service (the dashboard's search), or every plan on the signed-in account with `--cloud`. Each plan is printed with its link, then its hits. Terms in a plan's title count toward each of its blocks, and a title that holds every term lists the plan on its own. Live text only unless `--version all`. A version number needs `--url`. `--any`, `--fuzzy`, and `--json` as below. | `0` hits, `2` no hits, `1` usage, sign-in, or HTTP error |
| `search <file> --query TERMS` | Find terms in one plan, block by block. Each hit names the block id, type, file line, and a snippet. Repeat `--query` for more terms. Spaces split terms and `"double quotes"` keep a phrase. Every term must be in one block unless `--any`. Saved versions are searched only when asked: `--version N` reads one, `--version all` reads the live plan and every saved version. `--fuzzy` also matches word starts, one or two typos, and words run together; matching is exact without it. `--json` prints the response. Use it when you resume a plan, or to check an earlier decision before you change it. | `0` hits, `2` no hits, `1` usage or HTTP error |
| `execution start\|push\|stop <file>` | Optional after an approval, when the run follows the plan file. `start` turns the overlay on, `push` updates it and leaves it on or off, `stop` turns it off and unlocks plan forms, and the plan file then leaves it off until the next approval. A flag you leave out keeps its current value, so `stop` keeps the last step and graph on the Workflow tab. Works the same on a local and a `--cloud` URL. | `0` ok, `1` usage or HTTP error |
| `processes` | List plans hosted by the service, including directory and git status. `ps` is the same command. | `0` |
| `logs` | Print the development log saved under `~/.config/living-plan/logs`. The page does not show it. `--level error`, `warn`, or `log` filters. `--day YYYY-MM-DD` reads one registry day (today when omitted). `--url` reads one plan and ignores `--day`. | `0` printed, including when the file is missing, `1` bad arguments |
| `dashboard` | Open the registry dashboard of running and executed plans (day, week, and month). Its search field searches plan titles and text across every listed plan as you type, with fuzzy matching. | `0` when the registry is up, `1` when it is not |
| `lan on\|off\|status` | Opt in to publishing the plan service on the local network. Off by default. `on` prints the LAN URL. Agents keep using the loopback URL from `serve`. | `0` including when there is no LAN address or the firewall command fails, `1` when the service cannot rebind |
| `tui` | The registry in the terminal. Starts the plan service when it is not already running. `p` is the running-plan list. `d` is the dashboard (`--period` is `day` by default, or `week` or `month`). Active plans are listed first. Quitting leaves the service up. | `0` when you quit, `1` when the terminal is not interactive, the arguments are wrong, or the registry cannot start |
| `account login --url <https://host>` | Sign in to the hosted service and store the account session in `~/.config/living-plan/cloud.json`. `LIVE_PLAN_CLOUD_URL` supplies the host when `--url` is omitted. On a machine with no browser, `--headless` prints `<host>/cli-token` and exits. That page shows a token. `--token <token>` (or `--token -` to read stdin) checks it with the host and saves it. | `0` signed in or link printed, `1` missing host, callback failed, or token rejected |
| `theme get\|set` | Read or write the accent color. Prefer `--url` while `serve`/`review` is up; otherwise `--config` / `--plan` writes `live-plan.config.json`. | `0` ok, `1` usage or HTTP error |

Flags:

- `--port` is the private server port with `--no-registry`. Otherwise it is used only when the service is not already running.
- `--host` defaults to `127.0.0.1`. The printed URL uses that address, for example `http://127.0.0.1:9477/plans/<id>/`. Set `--host` to a reachable address when a cloud agent must share the URL. `lan on` is how a person on that machine publishes the service to other devices. It does not change the URL `serve` prints, and the CLI does not resolve `*.local`.
- `--timeout` defaults to 4 hours. Always include a unit: `30s`, `45m`, `4h`. A bare number is milliseconds.
- A plan command takes the plan file (positional, or `--plan <file>`) or `--url <plan-url>`. The file maps to its hosted URL when this machine served it with `--cloud` (the `cloudId` in the file and the record in `cloud.json`), and otherwise to its id on this machine's service. Use `--url` for a plan another machine served.
- `--iteration N` labels a review round (default `1`) on `mode review` and `review`. Bump it when you re-open review after Iterate.
- `--out <file>` writes the review JSON as well as printing it.
- `serve` and `review` open a plan page only the first time this machine sees that plan URL (recorded in `~/.config/living-plan/opened-pages.json`). Resuming the same plan does not open another tab.
- `--no-open` skips launching a browser. Pass it when you resume a plan the person already has open, and for headless or CI runs.
- `--open` opens the page again even when it was opened before. Use it only when the person asks.
- `serve` registers the plan and returns. `--listen` keeps the older behavior of printing the next undelivered submissions before it exits. `--detach` is accepted and does nothing.
- `--no-registry` serves this plan in its own process. By default `serve` and `review` use the machine service, so every planner page can list running plans.
- `--cloud` on `serve` and `review` hosts that plan on the signed-in service. Run `account login` first. It does not start the local registry, and it does not fall back to loopback. It cannot be combined with `--no-registry`. The same plan commands work on that plan, named by its file or by the printed https URL. `dashboard`, `tui`, `logs`, and `lan` stay on this machine.
- `--registry-port` sets the service port (default `9477`, loopback only).
- `--token` authorizes the agent stream (`events`, `wait`) and `close`. When omitted, the CLI reads the plan token from `cloud.json` for a hosted plan, or the local service token.
- `--graph <file.json>` is the portable execution graph. `--scene <file.json>` is optional adapter-specific extras. Prefer `graph`.
- `--step` and `--detail` are the current execution headline.
- `--config <file>` points at the theme config (default `live-plan.config.json` beside the plan). `--accent #hex` sets the accent for `theme set`.
- `--plan <file.plan.md>` with `theme` resolves the config path beside that plan.

`check` before the first `serve`. Fix parse failures before asking a human to look.

## Agent loop

1. Write or update one `.plan.md`. Title, a short summary, phases, a required `workflow` block (the execution path), then only the interactions you need right now.
2. `check` the file.
3. `serve` the file. It prints the URL and returns. Give the person the URL.
4. Run `events <file>` in the background and let it run until it exits. Each line is `{ "event", "id", "seq", "data" }` for a comment, an interaction (including an approve/deny gate), a review verdict, or an `edit`. An `edit` means a person changed the plan on the page and published it. On a hosted plan, `events` has already written their version into your plan file. Read the plan file again before you write it next. A hosted upload that missed a page edit is refused until `events` has pulled it. If people submitted while `events` was not running, the new process prints those pending rows and exits immediately. Handle the batch, then start `events` again. Leave it running only when it is waiting because the server has nothing pending.
5. A comment has `id`, `partId`, `kind`, `excerpt`, and `text` on `data`. Once `events` printed it, the page shows it in progress (Addressing on a part comment, Working on a minibar message). Do the work, then `reply <id> <file> --text "..."`, which writes the reply and marks it answered. Pass `--outcome errored` or `--outcome issues` when that is the result, and `--keep-open` to reply without closing it. `reply` works while a run is on; the page refuses new comments until it ends.
6. To get a verdict on the whole plan, `mode review <file> --iteration N` and keep listening. The verdict arrives as a `review` line. On **deny**, stop the work, and still listen once more so a pending comment is not stranded. On **iterate**, edit the same file, reply to the comments, and `mode review` again with the next iteration. Iterate leaves the session in review and marks unaddressed comments in progress. On **approve**, the session returns to watch. `mode review` exits `1` while the last verdict has not reached an agent; run `events` first.
7. After an approve verdict, or an approve gate answered yes, the run follows the plan file. Mark the phase you start `status="active"`: that edit makes the page show Executing and lock forms, page comments, and review (HTTP 409). The approval alone starts nothing, so the person can keep answering until your first edit after it. Mark each phase `done` or `failed` as it finishes. Every workflow step done ends the run and shows Completed. A failed step ends it and shows Stopped. A phase set back to `active` starts it again. Keep listening for comments meanwhile. `execution push --graph` draws a custom live diagram. `execution start` runs a plan that had no approval, and `execution stop` ends a run by hand; after a manual stop the file does not start the run again until the next approval. The open page catches up on its own after a dropped connection or a service restart.
8. When the work is finished, stop the listener, and `close <file>` when the plan should leave the service.

### One listener

When your agent sees a running process's output line by line, start `events <file> --follow` once and keep it for the whole plan. It prints the same lines as `events` and does not exit on its own. It also prints `{ "event": "mode", "data": { "mode", "iteration" } }` each time the session moves to another mode. That line has no `id` and needs no ack or answer. Switch modes with short commands while it runs: `mode review <file> --iteration N` asks for a verdict, which then arrives as a `review` line. Approve and deny are followed by a `mode` line for `watch`. `mode comment` opens comments without a review. Agents that only see output after a command exits keep the `events` loop above. Both read the same queue on the server.

### Connection drops

`events`, `events --follow`, `serve --listen`, and the shortcuts `watch`, `wait`, and `review` reconnect by themselves when the stream drops, the service restarts, or the network changes. Each prints `Lost the plan stream (...)` on stderr, retries with a growing wait of up to 30 seconds, and prints `Reconnected to the plan stream.` when it is back. Submissions sent meanwhile stay pending on the server and print after the reconnect, so do not restart the command. A 401 after a service restart re-reads the service token from the lock. A local service that died without shutting down (its lock left behind with a dead process) is started again by the waiting command. A service stopped on purpose is left stopped. A command stops only on a refusal a retry cannot fix (wrong token, missing plan, full account), on its own `--timeout`, or when it never connected after a few tries, so a wrong file or URL still fails within about ten seconds.

Section diffs are computed from the previous snapshot of that plan session. Editing the file while the plan is hosted marks added, edited, and removed sections.

## Primitives

A plan is optional YAML frontmatter, then markdown, plus MDX components. Every interactive block needs a stable `id`. Do not rename an id after a human may have answered it. A component may contain another component. `{% tags %}` and a fence whose language is an entry type are not plan entries.

| Component | Role | Human input |
|---|---|---|
| `phase` | Timeline step. `status`: `pending`, `active`, `blocked`, `done`, `failed` | No |
| `callout` | Highlight. `kind`: `note`, `tip`, `risk`, `decision`, `warning` | No |
| `choice` | Mutually exclusive options. Each option is an `<option>` | One option |
| `form` | Named `<field>` elements (`text`, `number`, `textarea`, `select`, `checkbox`, `stepper`) | Field values. A `checkbox` with `options` saves the checked strings as an array. A `stepper` saves a number. Checkbox and stepper forms post on each change. Text forms use Submit, then Edit to replace the saved values |
| `questions` | Open questions, one `<item>` per question | One answer per item |
| `approve` | Yes/no gate with an optional note | `approved` plus optional note |
| `checklist` | Definition of done. `<item done="true">` shows a filled check. A line still to do shows an empty ring. This is separate from a checkbox field | No (you update `done`) |
| `workflow` | Required. The execution path. The Workflow tab draws it before the run, and the live run follows it. Node `ref` is the plan block a click jumps to. Nodes and edges are a pipe table inside the component, optionally in a `workflow` fence | No |

Document blocks show data in the prose with their own look: `<FileTree>` and `<File>` for the files a change touches, `<Endpoint>` for an API contract, `<DataModel>` for a schema, `<JsonView>` for a payload, `<AnnotatedCode>` with `<Note>` for a code walkthrough, `<Tabs>`, `<Compare>`, `<Update>` for a status note with a health level, `<Properties>`, and `<Path>` inline. They are not plan entries. Any block can carry `locked`, which keeps the human from editing it; forms and questions are locked unless `locked="false"`.

`Box`, `HStack`, `VStack`, `Stack`, `Row`, and `ResponsiveStack` arrange children. `<Chip>` and `<Pill>` are short labels (`tone` is `success`, `warning`, `danger`, or `neutral`). `<Mermaid>`, `<BarChart>`, and `<LineChart>` draw figures. A mermaid fence does the same as `<Mermaid>`. `<DataTable>` pages at 100 rows. `search` and `sort` on a column are off until set. One `filter` column gets a state select. Cells can hold chips, pills, lists, checkboxes, and other plan components.

Frontmatter fields the parser reads: `title`, `summary`, `agent`, `mode` (`watch` or `review`). A leading `#` heading is the title when frontmatter has none.

Full component shapes and the JSON each interaction returns are in [`skills/live-plan/primitives.md`](../skills/live-plan/primitives.md). An authored file is [`examples/rate-limit.plan.md`](../examples/rate-limit.plan.md). An execution graph is [`examples/execution-graph.json`](../examples/execution-graph.json).

Authoring rules:

- Keep one plan file for the task. Update it in place.
- Mark exactly one phase `active` while work is underway.
- Add an interaction only when you will block on the answer.
- On every comment, run `addressing`, then `reply`, then `address`. The page shows neither the reviewing state, the answered state, nor the reply text until those commands run.
- Prose is connective. Status, risks, and decisions belong in `phase` and `callout` components.
- Phase and callout bodies are markdown: headings, lists, pipe tables, fenced code, `**bold**`, `*italic*`, and `` `code` ``.
- A pipe table renders as a markdown table. The row under the header is a separator such as `| --- |`. `:---`, `---:`, and `:---:` align that column left, right, and center. A blank line ends the table. Cell text wraps between words to fit the column. Inline code stays on one line, and a word is never split, so a table with long code or many columns still scrolls sideways.
- `<Chip>` and `<Pill tone="success">` are labels. `tone` is `success`, `warning`, `danger`, or `neutral`. They work in a phase, a callout, or a table cell.
- A data table is `<DataTable>` with `<Column>`, `<Row>`, and `<Cell>`. `search` and `sort` are off until a column sets them. A column with `search` is included in the search field, and the field stays hidden when no column sets it. A column with `sort` gets a header button. One column with `filter` gets a state select. Pagination shows at 100 rows and stays hidden below that. `value` on a cell is the sort and filter key. `<Cell wrap>` breaks that cell onto more than one line. `<Cell wrap="40%">` wraps it inside 40% of the table. `<Column wrap>` does that for every cell in the column, and `<DataTable wrap>` for every cell in the table. Under those two, a cell with less than 20 characters of text stays on one line, and `wrap={false}` on a column or a cell keeps it on one line. A cell without `wrap` stays on one line, and the table still scrolls sideways when those columns do not fit. Cells can contain `<Chip>`, `<Pill>`, a list, `<Checkbox>`, a checkbox `<field>`, and other plan components.
- Show source the human should read with a language fence (`ts`, `python`, `bash`). It is highlighted and numbered from 1. Add `start=40` after the language when the snippet is a slice of a larger file. Put that fence in the plan markdown or inside a `phase`, `callout`, or `approve` component.
- Show a change with a `diff` or `patch` fence, not the whole file. Write `---` / `+++` file headers and a `@@ -oldStart,oldCount +newStart,newCount @@` hunk. A `-` line counts only as old, a `+` line only as new, and a leading space counts as both. Those counts must match. A hunk without file headers still renders; `ts diff` highlights that hunk as TypeScript. `start=` does not apply to a diff.
- A mermaid fence, or a `<Mermaid>` component, draws a figure in the plan text.
- Include one `workflow` component. `check` fails when it is missing.

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
- `GET /api/events` — browser server-sent events: `hello`, `reload`, `interaction`, `review`, `comment`, `mode`, `execution`, `theme`, `error`, and `ping` every 20 seconds. `hello` comes first on every connection with the mode, review, and run, so a page that reconnects catches up
- `GET /api/agent-events` — the stream `events` and `wait` use. Requires a bearer token on the shared service. `hello` includes the mode, the review `iteration`, current responses, review, and `pending` (submissions whose `delivered_at` is empty). `notice` follows as the user submits, `mode` when the session changes mode, and `ping` every 20 seconds.
- `POST /api/mode` — `{ "mode": "watch" | "comment" | "review", "iteration"?: N }`, what `mode` calls. Entering review clears the last verdict. While that verdict has not been acked by any agent, entering review returns 409
- `POST /api/agent-events/ack` — `{ "ids": ["evt_..."] }` sets `delivered_at` on those rows. The CLI calls this after it prints them. A delivered `comment` row also sets that comment's `addressingAt`, so the page shows it in progress.
- `POST /api/review` with `approve`, and an approve gate answered yes, set the run's `follow` to `armed`. From then on the next edit of the plan file with a step past pending starts the run, and every step done or one failed ends it. `POST /api/execution/stop` sets it to `off`.
- `POST /api/comments/:id/addressing`, `POST /api/comments/:id/reply`, and `POST /api/comments/:id/address` — the routes behind `addressing`, `reply`, and `address`. Prefer those commands.
- `GET /api/search?q=...&version=live|N|all&match=all|any&fuzzy=on|off` — what `search` calls. `fuzzy` defaults to `off`; `on` adds a `score` and highlight `ranges` to each hit. `version` defaults to `live`, so saved versions are read only when asked. A missing version is 404, an empty query 400. On the host the plan bearer and the owner search every version, and a viewer searches the live plan only. The host keeps the latest 10 versions
- Service `GET /api/dashboard/search?q=...&version=live|all&match=all|any&fuzzy=on|off` — the local dashboard's search across every listed plan, by title and text. Live text only unless `version=all`, which adds up to 10 saved versions per plan. A version number is 400. Each plan carries `titleMatched`, `openUrl`, and with `fuzzy=on` `titleRanges`. The dashboards send `fuzzy=on`. The hosted dashboard's twin is `GET /api/account/search` for the signed-in account
- `POST /api/interactions/:id` — submit one response (409 while execution is active)
- `POST /api/review` — `{ "decision": "approve" \| "deny" \| "iterate", "note"?: "..." }` (review mode only; 409 while execution is active)
- `GET /api/execution` and `PUT /api/execution` — read or replace execution state. `GET` includes `planned` (the expected workflow) even while execution is idle
- `POST /api/execution/start`, `POST /api/execution/push`, and `POST /api/execution/stop` — what `execution start`, `push`, and `stop` call. The body is any of `step`, `detail`, `graph`, and `scene`. The host keeps the fields you leave out. `start` turns the run on, `push` leaves it as it is, `stop` turns it off
- `GET /api/processes` — other plans started through the CLI, with directory and git status. Each `url` opens that plan's site.
- Registry `GET /dashboard` — running and executed plans, with day, week, and month summaries. `live-plan dashboard` opens it. Plan files are copied into the registry home under `plans/`.
- `GET /api/theme` and `PUT /api/theme` — read or set `{ "accent": "#hex" }` (persists to the theme config file)
- `GET /api/logs` and `POST /api/logs` — errors, warnings, and logs that are not submissions. `GET` accepts `level` (`error`, `warn`, or `log`) and `limit` (1 to 500). On the service, root `GET /api/logs` is today's registry file under `~/.config/living-plan/logs`. `live-plan logs` reads those files directly. A restart leaves them in place.

Prefer the CLI. Use HTTP only to inspect state or when another process must submit on the human's behalf.
