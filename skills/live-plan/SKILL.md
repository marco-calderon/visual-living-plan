---
name: live-plan
description: >-
  Drive a living visual plan with the live-plan CLI so a human can watch phase
  status and answer choices, forms, questions, and approval gates in a browser.
  Use when work has multiple steps, needs a human decision before continuing,
  needs Approve/Deny/Iterate on a plan, should show highlighted source or a
  diff hunk, a markdown table or data table, a checklist, or the execution
  path before a run and then stream it live. Invoke with `bunx visual-living-plan`
  unless the `live-plan` command is already installed. The CLI runs on Bun.
  Skip for a one-step change or when the user asked for prose only.
---

# Live Plan

Keep one `.plan.md` file as the channel between you and the human. You update the file. They watch a URL, answer interactions, and (in review) Approve, Deny, or Iterate.

The page follows [DESIGN.md](../../DESIGN.md): a white document in light mode and a quiet dark document in dark mode. Author the MDX components that page renders (`<phase>`, `<choice>`, and the rest in [primitives.md](primitives.md)). A workflow graph is the pipe table inside `<workflow>`.

## Invoke

Use bunx unless `live-plan` is already on `PATH`. Bun must be installed.

```bash
bunx visual-living-plan <command> [args]
live-plan <command> [args]
```

Do not call this repo's `npm run` scripts from a consuming project. Those are for developing Live Plan itself.

`serve` registers the plan on one machine service. Without `--detach` it prints undelivered submissions and exits. The page and the service stay up after it exits. Pass `--detach` to register and return. `events` prints the next undelivered submissions and exits. Each time it exits because of a comment, a denial, an approval, or any other event, start it again so a submission that arrived while it was closed is not left pending. `watch` is the client you keep running after an approval, while the plan is executing. `wait` and `review` block until the human responds or `--timeout` fires.

## When to use

- Show current status as phases, not a chat wall.
- Block on one choice, form, question set, or approve/deny gate.
- Get an explicit Approve / Deny / Iterate on the plan.
- Show the expected workflow before a run, then stream the live diagram while you implement.
- Show source the human should read, or a hunk of what changed, inside the plan.

Skip when the change is a single obvious step, the user asked for plain prose, or no one can open the URL.

## Loop

1. Write the plan: title, short summary, phases, a `<workflow>` component, then only the interactions you need now. The workflow component is required. It is the execution path. The page follows [DESIGN.md](../../DESIGN.md). Schemas are in [primitives.md](primitives.md).
2. Validate: `bunx visual-living-plan check path/to/work.plan.md`.
3. `serve --detach` the file so you get the URL back, or `review` when you need a verdict on the whole plan.
4. Start `events --url <printed-url>` in the background. It prints one JSON object per line and exits. Each line is `{ "event", "id", "seq", "data" }`. `event` is `comment`, `interaction`, or `review`. An approve/deny gate is an `interaction` with `approved`. A review verdict is `approve`, `deny`, or `iterate`. If submissions are already waiting on the server, this command prints them and exits immediately.
5. When `events` exits because of a comment, a denial, an approval, or any other event, read the JSON and handle it. Then start `events` again before you do anything else. That reconnect is how you see a comment or other event that arrived while the previous process was closed. If the new process prints JSON and exits, more was pending: handle it and start `events` again. Repeat until `events` stays running, which means the server has nothing left to deliver. A comment has `id`, `partId`, `kind`, `excerpt`, and `text` on `data`. Answer every comment with the three commands below before you continue. The page does not show a reviewing state, an answered state, or your reply until you do. `reply` alone does not change the status.
6. On review **deny**, stop the work. Reconnect `events` once anyway so a comment that arrived with the denial is not left pending. On **iterate**, edit the same file, bump `--iteration`, run `review` again, and keep reconnecting `events` whenever it exits. Review exits `0` approve, `1` deny, `2` iterate, `3` timeout. Use `wait <id> --url <printed-url>` only when you cannot continue without that one answer.
7. On review **approve**, or an approve gate with `approved: true`, stop the waiting `events` process and open the execution client. Run `watch --url <printed-url>` in the background and leave it running. It switches the page to watch mode, which is the status view for execution. It stays up while you work. It prints a later comment or event without exiting.
8. While `watch` is running, update the plan in place as the work progresses. Mark phase `status` and checklist `done`. Run `execution start`, then `execution push` whenever the workflow graph changes, then `execution stop` when the run is finished. The open page follows the file and those workflow updates. Forms and review return HTTP 409 while execution is active. If `watch` prints a submission, handle it and leave `watch` running. A comment uses the same three commands as step 5.
9. After execution is finished and `execution stop` has run, stop the `watch` process. Closing it is safe then. Read any JSON it printed. If a person still needs to answer something, start `events` again and follow step 5.

```bash
bunx visual-living-plan serve path/to/work.plan.md
bunx visual-living-plan serve path/to/work.plan.md --detach
bunx visual-living-plan events --url <printed-plan-url>
bunx visual-living-plan watch --url <printed-plan-url>
bunx visual-living-plan wait fail-mode --url <printed-plan-url> --timeout 30m
bunx visual-living-plan review path/to/work.plan.md --iteration 1 --timeout 4h
bunx visual-living-plan execution start --url <printed-plan-url> \
  --step "Implement middleware" --graph path/to/graph.json
bunx visual-living-plan execution stop --url <printed-plan-url>
bunx visual-living-plan addressing <comment-id> --url <printed-plan-url>
bunx visual-living-plan reply <comment-id> --url <printed-plan-url> --text "..."
bunx visual-living-plan address <comment-id> --url <printed-plan-url>
```

Replace the bunx prefix with `live-plan` when the command is installed.

## Answering a comment

Run these three commands, in order, on the comment `id` from the event. Use the printed plan URL. They update the session. They do not print on `events` and they do not make `events` exit. A comment is allowed while execution is live.

1. `addressing <id> --url <printed-url>`. Sets `addressingAt`. The page shows the comment as reviewing. A part comment shows the Addressing spinner, and the corner icon switches to that spinner. A minibar message (`kind` `message`, or `partId` `review:message`) shows Working on that row and on the Messages button. Skip this when `addressingAt` is already set. Iterate does that for comments that were still open.
2. `reply <id> --url <printed-url> --text "..."`. Appends `replies[].text`. That text is the answer the person reads. A minibar message shows it on the tray, and the tray opens. Any other comment shows it in that part's comment thread, and the popover opens. Write the reply even when you also edit the plan.
3. `address <id> --url <printed-url>`. Sets `addressedAt`, clears `addressingAt`, and stores `outcome`. The default outcome is `implemented`. Pass `--outcome errored` or `--outcome issues` when that is the result. The page shows the comment as answered. A part comment says Addressed and the corner icon clears. A minibar message shows Implemented, Errored, or Had issues.

Do this as soon as you read the comment, before a long edit, so the page shows reviewing while you work. Then reply, then address when that comment is done.

## Commands

| Command | Use |
|---|---|
| `check <file>` | Parse check before showing the plan. Prints title, block types, interaction ids, and workflow nodes. Exits 1 when the workflow block is missing. |
| `dump <file>` | Full parsed plan as JSON. |
| `serve <file>` | Register the plan on the machine service and print its URL. Without `--detach`, print undelivered submissions as JSON and exit. `--detach` returns after the URL. The page reloads when the file changes and stays up after this command exits. |
| `review <file>` | Same page plus Approve / Deny / Iterate. Blocks until a decision, then leaves the plan open. Approve and deny return the session to watch. Iterate leaves it in review. |
| `wait <id> --url <url>` | Block on the event stream until that interaction is answered. Prints the response JSON. |
| `events --url <url>` | Print undelivered interactions, review verdicts, and comments as JSON, then exit. Pending rows already on the server are printed immediately. Start it again every time it exits. |
| `watch --url <url>` | After an approval, switch the page to watch mode and stay running for the whole execution. Prints later submissions without exiting. Stop it when execution is finished. |
| `mode <watch\|comment\|review> --url <url>` | Switch the open session and return. The tab follows: comment arms the part selector, review shows the verdict bar, watch is the status page. A comment stays in comment mode until the next `mode` command. `watch` above is the client that stays up. |
| `addressing <comment-id> --url <url>` | Mark that comment reviewing. Sets `addressingAt`. A part comment shows Addressing. A minibar message shows Working. |
| `reply <comment-id> --url <url> --text "..."` | Write the reply text. A minibar message shows it on the tray. A part comment shows it on that part. Does not change reviewing or answered. Saved with the session. |
| `address <comment-id> --url <url>` | Mark that comment answered. Sets `addressedAt` and clears `addressingAt`. `--outcome` is `implemented` (default), `errored`, or `issues`. A part comment says Addressed. A minibar message shows Implemented, Errored, or Had issues. |
| `close --url <url>` | Drop the plan from the service. |
| `execution start\|push\|stop --url <url>` | Turn the live workflow overlay on, update it, or turn it off. |
| `processes` | List plans hosted by the service (directory, git status, site URL). |
| `logs` | Print the development log saved under `~/.config/living-plan/logs`. The page does not show it. `--level error`, `warn`, or `log`. `--day YYYY-MM-DD` reads one registry day. `--url` reads that plan. |
| `dashboard` | Open the registry dashboard for running and executed plans. |
| `lan on\|off\|status` | Opt in to LAN publishing. Off until `lan on`. Prints a LAN URL for other devices on the network. Agents keep the loopback URL from `serve`. |
| `tui` | The registry in the terminal. Starts the plan service if it is down, and leaves it running on quit. `p` lists running plans. `d` is the dashboard (`--period day`, `week`, or `month`). Active plans are listed first. |
| `theme get\|set` | Read or change the accent color. Use `--url` while serving, or `--plan` / `--config` to edit that plan's `live-plan.config.json`. Without those flags, uses `~/.config/living-plan/live-plan.config.json`. |

`--timeout` defaults to 4 hours. Always pass a unit (`30s`, `45m`, `4h`). A bare number is milliseconds. `--port 0` picks a free port. `--host` defaults to `127.0.0.1`. On loopback, the printed URL is `http://127.0.0.1:9477/plans/<id>/`. Set `--host` to a reachable address when a cloud agent must share the URL. `lan on` publishes the service to other devices on the same network and prints a different LAN URL. Do not replace the `serve` URL with that LAN URL, and do not resolve `living-plan.local` from the agent. `--no-open` is only for headless runs. `--detach` on `serve` registers and returns. Omit it to print undelivered submissions and exit. Start `events` again each time that process exits. After an approval, `watch` is the process that stays up until execution is finished. `--graph` is the portable execution payload; `--scene` is optional and adapter-specific. Per-plan accent color lives in `live-plan.config.json` beside the plan (`theme.accent`). Machine-wide theme (no `--plan`) lives under `~/.config/living-plan/`. Humans can also pick the accent on the Settings tab.

```bash
bunx visual-living-plan theme set --accent #0369a1 --url <printed-plan-url>
bunx visual-living-plan theme set --accent #0369a1 --plan path/to/work.plan.md
```

## Primitives

Each structured block is an MDX component. The component name is the type. Give every interactive block a stable `id` and do not rename it mid-run. A component may contain another component. `{% tags %}` and a fence whose language is the type (`phase`, `choice`, and the rest) are rejected. Do not write those.

- `<phase>` — step in the timeline. `status`: `pending` \| `active` \| `blocked` \| `done` \| `failed`. One `active` phase at a time.
- `<callout>` — `kind`: `note` \| `tip` \| `risk` \| `decision` \| `warning`.
- `<choice>` with `<option>` children — human picks one option. The page shows each option as a radio choice card (label, description, and a radio). Choosing one posts the response, and a refresh restores that option. Multi-select stays a `checkbox` field. Response: `{ kind, id, optionId, label }`.
- `<form>` with `<field>` children — type `text` \| `number` \| `textarea` \| `select` \| `checkbox` \| `stepper`. A `checkbox` field with `options` saves an array of the checked option strings. One box with no `options` saves `"true"` or `"false"`. A `stepper` saves a number. A form whose fields are only checkboxes and steppers posts on each toggle or step and has no Submit button. A form with a text, number, textarea, or select field keeps Submit; after submit, Edit unlocks it and submitting again replaces the stored values. Response: `{ kind, id, values }`. The `<checklist>` block is not this field.
- `<questions>` with `<item>` children — one free-text item per question. Response: `{ kind, id, answers }`. Answer keys are item indexes `"0"`, `"1"`.
- `<approve>` — yes/no plus optional note. Response: `{ kind, id, approved, note? }`.
- `<checklist>` — definition of done. You set `done="true"` on an item when that line is finished. The page shows a filled check for a finished line and an empty ring for a line still to do. The line text stays. The human does not toggle it and does not submit it.
- `<workflow>` — required. This component is the execution path. Its body is a pipe table (`id | label | ref | detail`, then `--`, then `from -> to`). The Workflow tab draws it before the run, and the live run follows it.
- `<Box>`, `<HStack>`, `<VStack>`, `<Stack>`, `<Row>`, `<ResponsiveStack>` arrange children. They are not plan entries. In a plan that contains `<DataTable>`, `<Row>` is a table row. Use `<HStack>` for a horizontal arrangement in that plan.
- `<Chip>` and `<Pill tone="success|warning|danger|neutral">` are short labels. They are not plan entries. Use them in a phase, a callout, or a table cell. Omit `tone` for a neutral pill.
- `<Mermaid>`, `<BarChart>`, and `<LineChart>` draw figures. A `mermaid` fence, a language fence, and a `diff` fence still render in the markdown.
- `<DataTable>` is a sortable table. A free-text search filters the loaded rows. One column marked `filter` gets a state select. Pagination appears at 100 rows, ten per page, and stays off below that. A pipe table is still a plain markdown table.

```mdx
<DataTable label="Operations">
<Column id="route" header="Route" />
<Column id="state" header="State" filter />
<Column id="owner" header="Owner" />
<Column id="checks" header="Checks" />
<Row>
<Cell>GET /health</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease</li>
<li>retry</li>
</ul>
</Cell>
</Row>
</DataTable>
```

`value` is the sort key and the state-filter key. The visible text is searched too. A cell can hold a `<Chip>`, a `<Pill>`, a markdown list, `<Checkbox checked />`, a `<field type="checkbox">`, or any other plan component. `<Checkbox>` is the same control a form checkbox uses. In a cell it shows a state. It posts a response only when it sits inside `<form>`. `<Cell wrap>` breaks that cell onto more than one line. `<Cell wrap="40%">` wraps it inside 40% of the table. A cell without `wrap` stays on one line, and the table still scrolls sideways when those columns do not fit. `<Checkbox>`, `<Column>`, `<Row>`, and `<Cell>` load with `<DataTable>`. See [primitives.md](primitives.md).

A pipe table is a different table. It renders as a markdown table. Cells stay on one line, and the table scrolls sideways when it is wider than the column. It does not sort, search, or page. `:---`, `---:`, and `:---:` align a column left, right, and center. Inline code, emphasis, and links inside a cell still render.

Use the same node id as the plan block id so a click jumps to that section. A self-loop (`from` and `to` are the same id) is drawn as an arc. To close a loop with another card, set sides on the return edge (`from -> to @ bottom>bottom`). Live graph nodes use `id`, `label`, optional `detail`, `status` (`pending` \| `active` \| `blocked` \| `done` \| `failed`), and optional `x` / `y`. Edges are `{ from, to }` plus optional `label`, `fromSide`, and `toSide`.

Copy-paste schemas and response examples: [primitives.md](primitives.md).

## Page

You do not author these as components. The human changes page width and code wrapping on the Settings tab. Those choices are saved in `live-plan.config.json` beside the plan, under `theme`. `theme get` prints them. `theme set` changes the accent only.

### Page width

Settings offers Default, Wide, and Full. Plan, Workflow, and Settings share that column.

| `theme.pageWidth` | Column |
|---|---|
| `default` | 720px |
| `wide` | 1120px |
| `full` | the available width |

A saved `narrow` opens as default. A legacy `fullWidth: true` opens as wide. Cards, prose, and code stay inside the column. A markdown table or a data table scrolls sideways when its columns do not fit.

### Contents

The page lists the plan's sections and the Workflow page. On a wide enough window that list sits in the gutter to the left of the column and stays there while the page scrolls. It does not change the column width. On a smaller window it is hidden, and a floating Contents button opens it as a sidebar. Full width keeps that sidebar: the list does not dock beside a full column. Default docks once the window is at least 1224px wide. Wide docks at 1624px.

A section link scrolls to that part. A Workflow link opens the Workflow tab. A workflow step link opens that step.

A phase is listed from its title. A choice, form, questions block, or approve gate is listed from its prompt. A callout or a checklist is listed only when you set `id`. Markdown headings in the plan, and headings inside a phase, callout, or approve body, are listed too.

Each row carries a mark for the entry, drawn in a small rounded square. A phase mark follows `status`: an open circle for pending, a progress ring for active, a check for done, a pause for blocked, and an x for failed. A workflow step that points at a phase uses that phase's mark, and it updates when the phase or the live run changes. Choices, forms, questions, approvals, checklists, callouts, and Workflow have their own marks. A heading has no square, and its label lines up with the other rows.

### File version

Hover or click the logo to open the description card. Clicking it again closes it. The card shows the summary, the mode, the agent, and the current file version, such as `v1` (read as `Version · v1`). That number is the latest saved copy of this plan file. It goes up when the hosted file changes. The card does not list older copies and it does not restore one. Keep editing the same file.

### Code wrap

Settings has Wrap text in code. Off, which is the start, long lines in a source fence or a diff scroll sideways. On, those lines wrap, in light and dark. A mermaid figure is unchanged. The value is `theme.wrapCode`.

## Rules

- One plan file per task. Edit it in place.
- Add an interaction only if you will `wait` on it or the human must answer it inside `review`.
- When `events` exits on a comment, denial, approval, or other event, start `events` again and read any JSON it prints before you continue.
- On every comment, run `addressing`, then `reply`, then `address`. The page stays without a reviewing state, an answered state, and a reply until those commands run.
- After an approval, keep `watch` running while you update the plan and push workflow graphs. Stop `watch` only after execution is finished.
- `execution stop` before `wait` or before expecting a review decision.
- Open the browser for the human. Do not pass `--no-open` unless they cannot use a local browser.
- Phase and callout bodies support headings, lists, pipe tables, fenced code, bold, italic, and inline code. The row under a table header is `| --- |`. `:---`, `---:`, and `:---:` align that column. A blank line ends the table. Cell text stays on one line, and the table scrolls sideways when it is wider than the page column.
- A mermaid fence, or a `<Mermaid>` component, draws a figure in the plan text. Put it in the plan markdown, or inside a phase, callout, or approve component.
- Include one `<workflow>` component. `check` fails when that component is missing.

## Showing code

Put the fence in the plan markdown, or inside a phase, callout, or approve component. `mermaid` is a figure. Entry types (`phase`, `callout`, `choice`, and the rest) are MDX components, not code fences. A `workflow` fence is allowed only as the structured body inside `<workflow>`.

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
