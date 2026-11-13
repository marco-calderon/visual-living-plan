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
  Prefer the cloud host (`serve --cloud` after `live-plan account login`) and
  walk the user through sign-in or sign-up when they have no account. The
  local session on this machine stays available. Skip for a one-step change or
  when the user asked for prose only.
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

Six commands drive a plan: `check`, `serve`, `events`, `mode`, `reply`, and `close`. Each one names the plan by its file path, for example `events path/to/work.plan.md`. `serve` registers the plan, prints its URL, and returns. Pass `--cloud` to host it on the signed-in cloud service (preferred, see Host). `events` is the one listener: it prints what the person did on the page, and every verdict, answer, and comment arrives there. `mode` switches the page between watch, comment, and review. `reply` answers a comment. After an approval the run follows the plan file, so `execution` is optional. Every waiting command reconnects by itself when the connection drops or the service restarts (see Connection drops). `review`, `watch`, `wait`, `addressing`, and `address` still work as shortcuts.

## Host

Prefer the cloud host. Use the local session when the user asks for it, has no network, or does not want an account.

| Host | Use it when | Command | Printed URL |
|---|---|---|---|
| Cloud (preferred) | By default. The https URL opens on any device, and a cloud agent can share it. | `serve --cloud` | `https://plan.logspace.qzz.io/plans/<id>/` |
| Local | The user asks for it, is offline, or declines an account. | `serve` (no flag) | `http://127.0.0.1:9477/plans/<id>/` |

The CLI itself still defaults to local, so pass `--cloud` on every `serve` you want hosted.

```bash
live-plan serve path/to/work.plan.md --cloud
```

### Signed in?

Run `serve --cloud` and read the result. Do not print `cloud.json`, because it holds bearer tokens.

| Output | Meaning | Next |
|---|---|---|
| An https plan URL | Signed in | Continue with the Loop |
| `No hosted account. Run live-plan account login ...` | Never signed in on this machine | Sign-in journey below |
| `Sign in required` | The saved session expired or was revoked | Sign-in journey below |
| `This free account can have 1 plan with an agent listening at once. ...` | Every slot has an agent listening (`events`, or a shortcut such as `review`) | Stop the listener on another plan, or `close <that-plan-file>`, or ask whether to use the local session |
| `This free account can store 50 MB of plan versions and has ...` | Storage limit reached | Ask the user to delete plans they no longer need from the hosted dashboard, then run `serve --cloud` again |

### Sign-in journey

Sign-in and sign-up use the same command. The person creates the account in their browser. You never see or type their password.

1. Tell the user the plan will be hosted at `https://plan.logspace.qzz.io` and needs a free account. Ask whether they already have one. If they would rather not sign up, use the local session.
2. Run the login command. It prints the sign-in link, opens it in the default browser, and waits up to 5 minutes. Show that link to the user in case the browser did not open.

   ```bash
   live-plan account login --url https://plan.logspace.qzz.io
   ```

3. **Has an account:** sign in with email and password, GitHub, or Google.
4. **New user:** click **Sign up instead** at the bottom of the sign-in page. The sign-up page keeps the link back to this terminal. Create the account with email and a password of at least 8 characters (name is optional), or with GitHub or Google. There is no email confirmation step: the account is created and signed in at once.
5. The browser shows "You can close this window and return to the terminal." The command prints `Signed in to https://plan.logspace.qzz.io`, exits `0`, and saves the session in `~/.config/living-plan/cloud.json`.
6. Run `serve --cloud` again.

When it does not finish:

- `Timed out waiting for sign-in.` The browser step took more than 5 minutes. Run `account login` again.
- No browser window opened. Give the user the printed link. The sign-in returns to a `127.0.0.1` address, so the link only works in a browser on the same machine as the CLI. In a remote or headless session (a VM, a container, a cloud agent), use the headless sign-in below.

### Headless sign-in

Use this when the CLI runs where no browser can reach `127.0.0.1`, such as a VM, a container, or a cloud agent session. The person opens a page on any device, and the page shows a command with a token for this machine.

1. Run `live-plan account login --url https://plan.logspace.qzz.io --headless`. It prints `https://plan.logspace.qzz.io/cli-token` and exits at once. Show that link to the user.
2. The user opens it on their phone or laptop. They sign in, or choose **Sign up instead**. The page then shows a command such as `live-plan account login --url https://plan.logspace.qzz.io --token <token>` with a Copy button.
3. The user pastes that command back to you. Run it. It checks the token with the host, prints `Signed in to https://plan.logspace.qzz.io as <email>`, exits `0`, and saves the session in `~/.config/living-plan/cloud.json`. A bad or expired token exits `1` and saves nothing.
4. Run `serve --cloud` again.

The token is a session of its own. It lasts 30 days and stays valid when the user signs out in the browser. Each visit to the page makes a new token. `--token -` reads the token from stdin, which keeps it out of shell history.
- Saved plan versions are limited per account: Free 50 MB, Pro 500 MB, Business 5 GB. Deleting a plan from the hosted dashboard frees its storage.
- The tier limits plans with an agent listening at once, not open plans. Free allows 1 and closes an idle plan after 1 hour. Pro allows 10, with a 6-hour idle limit. A plan whose agent stopped frees its slot at once, or within 3 minutes if the agent vanished.

### Cloud details

`bunx visual-living-plan` is the same program when `live-plan` is not installed. `LIVE_PLAN_CLOUD_URL` supplies the host when `--url` is omitted. `serve --cloud` prints an https URL, writes `cloudId` into the plan frontmatter, keeps the plan bearer in `cloud.json`, and keeps uploading the file while you edit it. It does not start the local registry, and it does not fall back to local. Do not combine `--cloud` with `--no-registry`. Later commands find the hosted plan from the file: `events path/to/work.plan.md` reads the `cloudId` and the record in `cloud.json`. `--url <https-url>` works too, and is needed only for a plan served from another machine. `dashboard`, `tui`, `logs`, and `lan` stay on this machine. Each upload from `serve --cloud` or its file watcher publishes that plan document on the host. The host keeps the latest 10 versions and drops the oldest when an 11th is published.

### Local session

Omit `--cloud`. `serve` registers the plan on this machine's service. `--host` defaults to `127.0.0.1`, and the printed URL is `http://127.0.0.1:9477/plans/<id>/`. Nothing leaves the machine, and no account is needed.

## When to use

- Show current status as phases, not a chat wall.
- Block on one choice, form, question set, or approve/deny gate.
- Get an explicit Approve / Deny / Iterate on the plan.
- Show the expected workflow before a run, then stream the live diagram while you implement.
- Show source the human should read, or a hunk of what changed, inside the plan.

Skip when the change is a single obvious step, the user asked for plain prose, or no one can open the URL.

## Resuming without reopening the page

The person opens the plan page once. After that, the tab they have follows the file, the mode, and the workflow on its own. Stopping and resuming an agent must not open a second tab.

- `serve` and `review` open a plan page only the first time this machine sees that plan URL. They record it in `~/.config/living-plan/opened-pages.json`. A later `serve` or `review` of the same plan prints `Page already opened before. Not opening it again` and leaves the browser alone.
- On a Mac with the Living Plan app installed, a local plan opens in that app instead of the browser. Tell the person to look there.
- When you resume work on a plan you served earlier, in this session or a previous one, pass `--no-open` to `serve` and `review`. Give the person the printed URL in case their tab was closed.
- Do not reopen the page to show a change. Edit the file, run `mode`, or push the workflow. The open tab follows.
- Pass `--open` only when the person asks you to open the page again.

## Loop

1. Write the plan: title, short summary, phases, a `<workflow>` component, then only the interactions you need now. The workflow component is required. It is the execution path. The page follows [DESIGN.md](../../DESIGN.md). Schemas are in [primitives.md](primitives.md).
2. Validate: `check path/to/work.plan.md`.
3. Show it: `serve path/to/work.plan.md --cloud`. It prints the URL and returns. Give the person the URL. If the user is not signed in, follow the sign-in journey under Host first. Drop `--cloud` for the local session. The page opens in the browser only the first time this machine serves that plan. See Resuming above.
4. Listen: start `events path/to/work.plan.md` in the background. It prints one JSON object per line, acks it, and exits. Start it again each time it exits, before you do anything else: that is how you see what arrived while it was closed. If it prints and exits again, more was pending. Handle it and start it again. Repeat until it stays running, which means nothing is left to deliver. If your agent reads a running process's output line by line, start `events path/to/work.plan.md --follow` once instead and keep it (see One listener for the whole plan).
5. Handle each line. A line is `{ "event", "id", "seq", "data" }`:
   - `comment`: `data` has `id`, `partId`, `kind`, `excerpt`, and `text`. The page already shows it in progress. Do the work, then `reply <comment-id> path/to/work.plan.md --text "..."`. That writes your answer and marks the comment answered (see Answering a comment).
   - `interaction`: the answer to a choice, form, questions block, or approve gate. An approve gate has `approved` on `data`.
   - `review`: the verdict on the whole plan, with `decision` `approve`, `deny`, or `iterate`. See step 6.
   - `edit`: a person changed the plan in the page editor and published it. Read the plan file again before your next write. On a hosted plan, `events` writes their version into your file first, and an upload that missed it is refused until then.
   - `mode` (only with `--follow`): the session moved to another mode. It has no `id` and needs no answer.
6. Ask for a verdict with `mode review path/to/work.plan.md --iteration 1`, then keep listening. The page shows Approve, Deny, and Iterate, and the answer arrives as a `review` line.
   - **approve**: go to step 7. The page is back in watch mode.
   - **iterate**: edit the same file, reply to the comments that came with it, then `mode review path/to/work.plan.md --iteration 2`, and so on.
   - **deny**: stop the work. Keep listening once more so a comment that came with the denial is not left pending.
   - `mode review` exits `1` while the person's last verdict has not reached any agent yet. Run `events` to read it, handle it, then switch again.
7. Do the work. After an approve verdict, or an approve gate answered yes, the run follows the plan file. Mark the phase you start `status="active"`: your edit makes the page show Executing. The approval alone starts nothing, so the person can still answer and comment until your first edit after it. Mark each phase `done` or `failed` as it finishes. When every workflow step is done the run ends and the page shows Completed. A failed step ends it and shows Stopped. Setting a phase back to `active` starts it again. Keep listening the whole time. While the run is on, the page refuses new answers, comments, and verdicts (HTTP 409); `reply` still works. An edit that leaves the file empty or not compiling (an unclosed tag, for example) is not sent to the page: the page keeps the last good version, and `serve --cloud` prints `Plan not uploaded yet: <reason>`. Run `check <file>` to see the reason, then fix the file.
8. When the work is finished, stop the listener. Run `close path/to/work.plan.md` when the plan should leave the service.

`execution start`, `push`, and `stop` are still there for what the file cannot say: `push --graph` draws a custom live diagram, `start` runs a plan that had no approval, and `stop` ends a run by hand. After a manual `stop`, the file does not start the run again until the next approval.

```bash
bunx visual-living-plan account login --url https://plan.logspace.qzz.io
bunx visual-living-plan check path/to/work.plan.md
bunx visual-living-plan serve path/to/work.plan.md --cloud
bunx visual-living-plan serve path/to/work.plan.md            # local session
bunx visual-living-plan events path/to/work.plan.md           # start again after it exits
bunx visual-living-plan events path/to/work.plan.md --follow  # or keep one running
bunx visual-living-plan reply <comment-id> path/to/work.plan.md --text "..."
bunx visual-living-plan mode review path/to/work.plan.md --iteration 1
bunx visual-living-plan close path/to/work.plan.md
bunx visual-living-plan search path/to/work.plan.md --query redis --query '"fail open"'
bunx visual-living-plan search --query "rate limit" --cloud   # every plan on the account
```

Replace the bunx prefix with `live-plan` when the command is installed.

## One listener for the whole plan

Use this when your agent sees a running process's output line by line, for example a background task whose new lines it reads while it works. If your agent only sees a command's output after it exits, keep the `events` loop above. Both read the same queue on the server, so you can switch between them at any point.

```bash
bunx visual-living-plan serve path/to/work.plan.md --cloud
bunx visual-living-plan events path/to/work.plan.md --follow   # start once, keep it running
```

- It prints the same JSON lines as `events`, acks each one as it prints it, and does not exit on its own.
- It also prints a line each time the session moves to another mode, for example `{"event":"mode","data":{"mode":"review","iteration":2}}`.
- Change the mode with short commands while it runs. Nothing restarts:

| To | Run | The listener prints |
|---|---|---|
| Ask for a verdict | `mode review <file> --iteration N` | a `mode` line, then a `review` line with `decision` when the person answers |
| Handle approve or deny | nothing | the `review` line, then a `mode` line for `watch` |
| Handle iterate | edit the file, reply to the comments, then `mode review <file> --iteration N+1` | the `review` line with `decision` `iterate`, later the new round's `mode` line |
| Open comments without a review | `mode comment <file>` | a `mode` line |
| Do the work | mark phases `active`, `done`, or `failed` in the file | comments and other submissions as they arrive |

- Stop the listener when the plan is finished.

## Connection drops

Every command that waits on the plan (`events`, `events --follow`, `serve --listen`, and the shortcuts `watch`, `wait`, and `review`) reconnects by itself when the connection drops, the plan service restarts, or the network changes. It prints `Lost the plan stream (...)` on stderr, retries with a growing wait of up to 30 seconds, and prints `Reconnected to the plan stream.` when it is back. Submissions sent meanwhile wait on the server and print after the reconnect. Do not restart the command for this. On this machine, a plan service that crashed is started again by the command that was waiting on it.

A command stops only when a retry cannot help:

| Command | Exit | Meaning |
|---|---|---|
| `events`, `events --follow` | `1` | Refused: a wrong token, or a plan the service does not have. The message says which. |
| `events --follow` | `0` | The plan was closed on this machine's service while it ran. |
| `mode review` | `1` | A verdict from the person has not reached any agent yet. Read it with `events` first. |
| `wait`, `review` | `3` | Its `--timeout` ran out. |
| `wait`, `review` | `4` | Refused, or never connected. The message says why. |

A command that never connects gives up after about ten seconds, so a wrong path or URL still fails fast. stdout stays JSON lines; the reconnect notes are on stderr.

## Answering a comment

`events` prints the comment, and the page shows it in progress right away: a part comment shows the Addressing spinner, and a minibar message (`kind` `message`, or `partId` `review:message`) shows Working. Answer it with one command:

```bash
bunx visual-living-plan reply <comment-id> path/to/work.plan.md --text "Renamed the step to Compile."
```

That writes your reply and marks the comment answered. A minibar message shows the reply on the tray and Implemented. A part comment shows it in its thread and says Addressed. Write the reply even when you also edit the plan. `reply` works while a run is on.

- `--outcome errored` or `--outcome issues` records that the change failed or had problems. The default is `implemented`.
- `--keep-open` writes the reply and leaves the comment open, for a question back to the person or an update on a long change. Reply again without it when you are done.
- `addressing <comment-id> <file>` and `address <comment-id> <file>` still mark a comment in progress or answered on their own.

## Commands

| Command | Use |
|---|---|
| `check <file>` | Parse check before showing the plan. Prints title, block types, interaction ids, and workflow nodes. Exits 1 when the workflow block is missing. |
| `serve <file>` | Register the plan, print its URL, and return. Pass `--cloud` (preferred) to host it on the signed-in service and keep uploading the file. Without it the plan goes to the local service (see Host). The page reloads when the file changes and stays up. `--listen` also waits for the next submissions, as `events` does. |
| `events <file>` | Print undelivered interactions, review verdicts, comments, and page edits as JSON lines, ack them, then exit. Pending rows are printed immediately. Start it again every time it exits. `--follow` stays running instead and also prints a `mode` line on every mode change. |
| `mode <watch\|comment\|review> <file>` | Switch the open session and return. The tab follows: comment arms the part selector, review shows the verdict bar, watch is the status page. `--iteration N` sets the review round. `mode review` exits `1` while the last verdict has not reached an agent. |
| `reply <comment-id> <file> --text "..."` | Answer a comment and mark it answered. `--outcome implemented` (default), `errored`, or `issues`. `--keep-open` leaves it open. |
| `close <file>` | Drop the plan from the service. |
| `execution start\|push\|stop <file>` | Optional after an approval, when the run follows the file. `push --graph` draws a custom live diagram. `start` runs a plan without an approval. `stop` ends a run by hand. A flag you leave out keeps its current value. |
| `search --query TERMS` | Find terms across every plan on this machine's service, the same search as the dashboard. `--cloud` searches every plan on the signed-in account instead. Prints each plan with its link, then its hits. Terms in a plan's title count toward each of its blocks, and a title that holds every term lists the plan on its own. `--version all` adds saved versions; `--any`, `--fuzzy`, and `--json` work as below. Exits `0` with hits, `2` with none. |
| `search <file> --query TERMS` | Find terms in one plan, block by block. Prints the block id, type, file line, and a snippet for each hit. Repeat `--query` for more terms; `"quotes"` keep a phrase. Every term must be in one block unless `--any`. `--version N` searches one saved version and `--version all` the live plan plus every saved one. `--fuzzy` also matches word starts, one or two typos, and words run together. Matching is exact without it. `--json` prints the response. Exits `0` with hits, `2` with none. Use it when you resume a plan, or to check an earlier decision before you change it. |
| `dump <file>` | Full parsed plan as JSON. |
| `processes` | List plans hosted by the service (directory, git status, site URL). |
| `logs` | Print the development log saved under `~/.config/living-plan/logs`. The page does not show it. `--level error`, `warn`, or `log`. `--day YYYY-MM-DD` reads one registry day. `--url` reads that plan. |
| `dashboard` | Open the registry dashboard for running and executed plans. Its search field searches plan titles and text across every listed plan as you type, with fuzzy matching, live text by default. |
| `lan on\|off\|status` | Opt in to LAN publishing. Off until `lan on`. Prints a LAN URL for other devices on the network. Agents keep the loopback URL from `serve`. |
| `tui` | The registry in the terminal. Starts the plan service if it is down, and leaves it running on quit. `p` lists running plans. `d` is the dashboard (`--period day`, `week`, or `month`). Active plans are listed first. |
| `account login --url https://plan.logspace.qzz.io` | Sign in or sign up before `serve --cloud`. Opens the browser sign-in page, which links to sign-up. Stores the session in `~/.config/living-plan/cloud.json`. `LIVE_PLAN_CLOUD_URL` supplies the host when `--url` is omitted. `--headless` prints the `/cli-token` page link and exits. `--token <token>` (or `--token -` for stdin) saves the token that page shows. |
| `theme get\|set` | Read or change the accent color. Use `--url` while serving, or `--plan` / `--config` to edit that plan's `live-plan.config.json`. Without those flags, uses `~/.config/living-plan/live-plan.config.json`. |

Shortcuts, for agents and scripts that already use them:

| Shortcut | Same as |
|---|---|
| `review <file>` | `serve`, `mode review`, and a blocking wait for the verdict. Exits `0` approve, `1` deny, `2` iterate, `3` timeout, `4` refused or never connected. `--iteration N`, `--timeout`, `--out file`. |
| `watch <file>` | `mode watch`, then `events --follow`. |
| `wait <id> <file>` | Block until that one interaction is answered and print it. Exits `3` on timeout, `4` when refused or never connected. |
| `addressing <comment-id> <file>` | Mark a comment in progress by hand. |
| `address <comment-id> <file>` | Mark a comment answered without a reply. `--outcome` as on `reply`. |

Every plan command also takes `--url <plan-url>` in place of the file. Use it for a plan this machine did not serve.

`--timeout` defaults to 4 hours. Always pass a unit (`30s`, `45m`, `4h`). A bare number is milliseconds. `--port 0` picks a free port. `--host` defaults to `127.0.0.1`. On loopback, the printed URL is `http://127.0.0.1:9477/plans/<id>/`. When a cloud agent must share the URL, use `--cloud`. For the local session, set `--host` to a reachable address instead. `lan on` publishes the service to other devices on the same network and prints a different LAN URL. Do not replace the `serve` URL with that LAN URL, and do not resolve `living-plan.local` from the agent. `--no-open` never opens a browser. Use it on a resume, or for a headless run. `--open` reopens a page that was already opened once. `serve` returns after registering; `--detach` is still accepted and does nothing. `--graph` is the portable execution payload; `--scene` is optional and adapter-specific. Per-plan accent color lives in `live-plan.config.json` beside the plan (`theme.accent`). Machine-wide theme (no `--plan`) lives under `~/.config/living-plan/`. Humans can also pick the accent on the Settings tab.

Pass `--cloud` for the preferred cloud host described under Host. Without that flag, `serve` stays on this machine.

```bash
bunx visual-living-plan theme set --accent #0369a1 --url <printed-plan-url>
bunx visual-living-plan theme set --accent #0369a1 --plan path/to/work.plan.md
```

## Primitives

Each structured block is an MDX component. The component name is the type. Give every interactive block a stable `id` and do not rename it mid-run. A component may contain another component. `{% tags %}` and a fence whose language is the type (`phase`, `choice`, and the rest) are rejected. Do not write those.

- `<phase>` — step in the timeline. `status`: `pending` \| `active` \| `blocked` \| `done` \| `failed`. One `active` phase at a time.
- `<callout>` — `kind`: `note` \| `tip` \| `risk` \| `decision` \| `warning`.
- `<choice>` with `<option>` children — human picks one option. The page shows each option as a radio choice card (label, description, and a radio). Choosing one posts the response, and a refresh restores that option. Picking another option replaces the answer and sends a new event. Multi-select stays a `checkbox` field. Response: `{ kind, id, optionId, label }`.
- `<form>` with `<field>` children — type `text` \| `number` \| `textarea` \| `select` \| `checkbox` \| `stepper`. A `checkbox` field with `options` saves an array of the checked option strings. One box with no `options` saves `"true"` or `"false"`. A `stepper` saves a number. A form whose fields are only checkboxes and steppers posts on each toggle or step and has no Submit button. A form with a text, number, textarea, or select field keeps Submit; after submit, Edit unlocks it and submitting again replaces the stored values. Response: `{ kind, id, values }`. The `<checklist>` block is not this field.
- `<questions>` with `<item>` children — one free-text item per question. Response: `{ kind, id, answers }`. Answer keys are item indexes `"0"`, `"1"`.
- `<approve>` — yes/no plus optional note. Response: `{ kind, id, approved, note? }`.
- `<checklist>` — definition of done. You set `done="true"` on an item when that line is finished, or `status="active"` (`pending`, `active`, `blocked`, `done`, `failed`) while you work on it. The page shows a filled check for a finished line, a progress ring for the active line, and an empty ring for a line still to do, with a `done/total` count. The line text stays. The human does not toggle it and does not submit it.
- Document blocks show data inside the prose, each with its own look: `<FileTree>` with `<File path change>` for the files a change touches, `<Endpoint>` with `<Param>`, `<Request>`, and `<Response>` for an API contract, `<DataModel>` with `<Entity>`, `<Attr>`, and `<Relation>` for a schema, `<JsonView>` around a `json` fence, `<AnnotatedCode>` with `<Note lines>` for a code walkthrough, `<Tabs>`/`<Tab>`, `<Compare>`/`<Pane>`, `<Update health by date>` for a status note, `<Properties>`/`<Prop>`, and `<Path>` inline. They are not plan entries: no `id`, no events. Prefer them to a paragraph that lists files, routes, or fields. See [primitives.md](primitives.md#document-blocks).
- The human can edit any block on the page. Put `locked` on a block the human should not change. Forms and questions are locked unless `locked="false"`. `<option recommended>` marks the option you suggest.
- `<workflow>` — required. This component is the execution path. Its body is one line per step with the columns `id | label | ref | detail`, then `--`, then one `from -> to` line per edge. Do not write a header row. The Workflow tab draws it before the run, and the live run follows it.
- `<Box>`, `<HStack>`, `<VStack>`, `<Stack>`, `<Row>`, `<ResponsiveStack>` arrange children. They are not plan entries. In a plan that contains `<DataTable>`, `<Row>` is a table row. Use `<HStack>` for a horizontal arrangement in that plan.
- `<Chip>` and `<Pill tone="success|warning|danger|neutral">` are short labels. They are not plan entries. Use them in a phase, a callout, or a table cell. Omit `tone` for a neutral pill.
- `<Mermaid>`, `<BarChart>`, and `<LineChart>` draw figures. A `mermaid` fence, a language fence, and a `diff` fence still render in the markdown.
- `<DataTable>` pages at 100 rows, ten per page, and stays off below that. `search` and `sort` on a `<Column>` are off until you set them. One column marked `filter` gets a state select. A pipe table is still a plain markdown table.

```mdx
<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort />
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

`search` on a column includes that column in the search field. The field is hidden when no column sets `search`. `sort` on a column adds a header button for that column. `value` is the sort key and the state-filter key. The visible text is searched too, and only in columns marked `search`. A cell can hold a `<Chip>`, a `<Pill>`, a markdown list, `<Checkbox checked />`, a `<field type="checkbox">`, or any other plan component. `<Checkbox>` is the same control a form checkbox uses. In a cell it shows a state. It posts a response only when it sits inside `<form>`. `<Cell wrap>` breaks that cell onto more than one line. `<Cell wrap="40%">` wraps it inside 40% of the table. `<Column wrap>` does that for every cell in the column, and `<DataTable wrap>` for every cell in the table. Under those two, a cell with less than 20 characters of text stays on one line, and `wrap={false}` on a column or a cell keeps it on one line. A cell without `wrap` stays on one line, and the table still scrolls sideways when those columns do not fit. Put `wrap` on a column that holds sentences, or on the table, so the reader does not scroll sideways. `<Checkbox>`, `<Column>`, `<Row>`, and `<Cell>` load with `<DataTable>`. See [primitives.md](primitives.md).

A pipe table is a different table. It renders as a markdown table. Cell text wraps between words to fit the column. Inline code stays on one line, and a word is never split, so a table with long code or many columns still scrolls sideways. It does not sort, search, or page. `:---`, `---:`, and `:---:` align a column left, right, and center. Inline code, emphasis, and links inside a cell still render.

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
- Name the plan by its file in every command. Use `--url` only for a plan this machine did not serve.
- Add an interaction only if you need the answer before you continue, or the human must answer it inside a review.
- When `events` exits, read the JSON it printed, handle it, and start `events` again before you continue. With one `events --follow` listener, keep that one running instead.
- Do not restart a listener that printed `Lost the plan stream`. It reconnects by itself, and nothing sent meanwhile is lost.
- Answer every comment with `reply`. The page shows your answer and marks it answered only after that command.
- After an approval, mark phases `active`, `done`, or `failed` in the file as the work moves. The run starts and ends from those statuses.
- Ask for a verdict only while no run is on. Finish or `execution stop` the run first.
- Prefer `--cloud`. If the user has no account, walk them through the sign-in journey under Host before you fall back to the local session.
- Let the CLI open the page the first time only. Do not pass `--open` on a resume, and pass `--no-open` when the person already has the page or cannot use a local browser.
- Phase and callout bodies support headings, lists, pipe tables, fenced code, bold, italic, and inline code. The row under a table header is `| --- |`. `:---`, `---:`, and `:---:` align that column. A blank line ends the table. Cell text wraps between words to fit the column. Inline code stays on one line, and a word is never split, so a table with long code or many columns still scrolls sideways.
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
