# Project context

Read this before changing Visual Living Plan. It is the map for a new session. The current shape of the running system is [docs/architecture/README.md](architecture/README.md). Why it is shaped that way is [docs/architecture/decisions/README.md](architecture/decisions/README.md).

## What this is

An agent writes one `.plan.md` file. A person opens a local URL to see status and answer choices, forms, questions, approvals, and reviews. The agent hears those submissions on an event stream.

The package name is `visual-living-plan`. The commands `live-plan` and `visual-living-plan` are the same program. Agents in other repos invoke the published CLI with `npx --yes visual-living-plan`. Do not point them at this repo's `npm run` scripts. Those scripts are for developing this repository.

Authoring rules for agents who *use* the tool live in [docs/agent-guidelines.md](agent-guidelines.md) and [skills/live-plan/SKILL.md](../skills/live-plan/SKILL.md). Block schemas live in [skills/live-plan/primitives.md](../skills/live-plan/primitives.md). This file is for agents who *change* the tool.

## How a plan is hosted

One service per machine, default `127.0.0.1:9477`, hosts every plan. `serve` registers the file, prints its URL, and returns. On loopback it prints `http://127.0.0.1:9477/plans/<id>/`. The page and the service stay up. `events` is the one listener, started again for each batch of submissions; `serve --listen` does the same once. Every plan command names the plan by its file, or by `--url`. `wait` blocks on one id. A client of another plan does not see the event. The service is a detached process and keeps running when a CLI client disconnects. `--host` other than loopback is the address a cloud agent shares. `live-plan lan on` is a separate opt-in that publishes the same service on the local network ([ADR 0019](architecture/decisions/0019-lan-publishing.md)). Agents keep the loopback URL. The LAN URL is printed only by `lan on` and `lan status`.

`--no-registry` is the exception: one private server for one plan. Keep that path working.

The service and the private server are Elysia apps. Route handlers live in `src/registryService.ts`, `src/server.ts`, and `src/planRoutes.ts`, and `src/httpServer.ts` binds them with Bun. Put plan behavior on the session in `src/planSession.ts`. Put "all plans on this machine" behavior on `src/planHost.ts` and `src/registryService.ts`.

## Layout

| Path | What it is |
|---|---|
| `src/cli.ts` | Commands. Prefer the service. Fall back to the private server only for `--no-registry` or when the service cannot start. `tui` is the terminal dashboard |
| `src/planSession.ts` | State for one plan, including both event streams |
| `src/planRoutes.ts` | Elysia routes for that plan |
| `src/planHost.ts` | Session map, registration, idle close, git cache |
| `src/registryService.ts` | The long-lived Elysia app and its routes |
| `src/registryStore.ts` | Local SQLite store. The same tables as D1: `plans` with a `meta` JSON configuration, `plan_events`, `plan_runs`, and `plan_versions`. Finished runs are filtered by `started_at` and `ended_at`. Better Auth tables are created and left empty |
| `src/server.ts` | Private one-plan Elysia app |
| `src/configHome.ts` | XDG `~/.config/living-plan` home, env overrides, legacy migration |
| `src/serviceLog.ts`, `src/clientLog.ts` | Development log of errors, warnings, and logs. Files under `~/.config/living-plan/logs`. Read with `live-plan logs` |
| `src/httpServer.ts` | `Bun.serve` binding for an Elysia app |
| `src/agentEvents.ts` | Client-side SSE reader. Use `planApiUrl` so `/plans/<id>/` URLs resolve correctly |
| `src/parse.ts`, `src/planMdx/`, `client/planMdx.tsx`, `client/entries/`, `client/mdx/` | Plan file in. The page compiles it as MDX and renders the React plan |
| `client/mdx/docBlocks.tsx`, `client/planHeader.ts` | Document blocks (FileTree, Endpoint, DataModel, JsonView, AnnotatedCode, Tabs, Compare, Update, Properties, Path) and the plan header's eyebrow and facts ([ADR 0039](architecture/decisions/0039-document-first-page.md)). A new block also goes in `EMBED_NAMES` in `src/planMdx/outline.ts` and `ENTRY_SPECS` in `client/editor/entryEditors.tsx` |
| `src/planMdx/remarkBlockRanges.ts`, `src/planMdx/blockEdit.ts`, `client/editor/BlockEditor.tsx`, `client/planEditButton.ts` | Editing in place ([ADR 0040](architecture/decisions/0040-edit-in-place.md)): blocks carry `data-plan-block` source ranges, the Edit and + pill opens a block's editor where it sits, Done splices the edit into the file as an unapplied change, and Apply changes in `client/planMdx.tsx` publishes it. `src/planMdx/rebaseDraft.ts` merges unapplied changes onto an agent write. A component that draws a block passes `data-plan-block` to its root |
| `src/planSearch.ts`, `src/searchMatch.ts` | Search one plan block by block (`GET /api/search` on the local session and on the plan's Durable Object), or every plan a dashboard lists by title and text (`GET /api/dashboard/search` locally, `GET /api/account/search` on the host). Live by default; saved versions only when `version` asks. Exact unless `fuzzy=on`, which the dashboards send |
| `src/openUrl.ts` | Opens a page from the CLI or the terminal dashboard: in the Living Plan Mac app when it can show it, then in the installed Living Plan web app (Chrome, Edge, Brave, Chromium) when that origin has one, else a browser tab |
| `src/dashboardLoading.ts` | Skeletons, the spinner, and the dimmed state both dashboards show while plans or search results load |
| `src/workflow.ts`, `src/execution.ts` | Expected workflow and the live execution overlay |
| `client/` | React Flow canvas. It reads `window.__LIVE_PLAN_BASE__` and calls `/api/...` under that prefix |
| `src/host/` | Worker session for `--cloud`: Better Auth, D1 plan rows, Elysia routes, and one SQLite Durable Object per plan |
| `src/migrations/` | D1 migrations for accounts, settings, and published plan versions |
| `src/routes/`, `src/entry.ts`, `src/client.tsx` | The web application on that Worker. TanStack Start. `src/client.tsx` is the browser entry, registers the shell cache, and on a secure origin keeps a device copy of the open plan, the account, and the dashboard. The browser still compiles the plan MDX |
| `test/` | Bun test runner via `bun test ./test` |
| `examples/rate-limit.plan.md` | The fixture plan used by service tests |
| `src-tauri/`, `desktop/`, `scripts/build-desktop.ts`, `scripts/desktop-icon/` | The Mac app ([ADR 0036](architecture/decisions/0036-desktop-app.md)). A Tauri window whose own page (`desktop/`) shows setup on the first launch, then calls `connect`, which runs the bundled CLI's `dashboard --json --any-version` in local mode, or checks the hosted app answers in cloud mode, and loads the dashboard, or the plan a `living-plan://` link asked for. `desktop:stage` bundles `src/cli.ts` into `src-tauri/service/` with the files it reads beside itself, and copies Bun to `src-tauri/binaries/`. `desktop:icons` draws the icon |
| `src/desktopApp.ts` | Hands a plan or dashboard to the Mac app when it is installed: `living-plan://plans/<id>` and `living-plan://dashboard` on the local service, `living-plan://cloud/...` on the hosted app the desktop app knows. `openUrl` asks it first ([ADR 0037](architecture/decisions/0037-plans-open-in-the-desktop-app.md)) |
| `src/desktopConfig.ts`, `src/desktopCommand.ts`, `src/cliLauncher.ts`, `src/agentSkills.ts` | What the desktop app's setup screen runs ([ADR 0038](architecture/decisions/0038-desktop-setup-and-cloud.md)): `desktop.json` (local or cloud, cloud host, color mode, look), `live-plan desktop state|configure|install-cli`, and `live-plan skills list|install` |
| `desktop/bridge.js`, `src/desktopBridge.ts`, `src/DesktopModeSwitch.tsx` | The page side of the desktop app. The bridge marks the page (`data-desktop`) and makes the toolbar the title bar on macOS. The account menu carries the Local and Cloud switch, and a toolbar with no account menu shows it as two icons. Settings carries the setup buttons. All of them appear only under `html[data-desktop]` |

Home directory for the service is `~/.config/living-plan` (`$XDG_CONFIG_HOME/living-plan` when set), or `LIVE_PLAN_HOME` when set. The lock file is `registry.json`. The database is `registry.sqlite`. Development logs are under `logs/` in that home, or `LIVE_PLAN_LOG_HOME` when set. Older `~/.visual-living-plan` and `~/.living-plan` trees are migrated when idle ([ADR 0017](architecture/decisions/0017-xdg-config-home.md)).

## Invariants

- The plan file is the document. Responses, comments, execution, and review are keys in `plans.meta`. Submissions are rows in `plan_events`.
- The same plan path always maps to the same plan id.
- Browser API calls from a hosted page are prefixed with `/plans/<id>`. Root `/api/...` on the service is the catalog, the dashboard, and the service log, not a plan.
- `new URL('/api/plan', planUrl)` is wrong for a plan URL that has a path. Use `planApiUrl`.
- User submissions are pushed on the agent stream and stored in `plan_events`. `delivered_at` is set when the CLI acks. Do not poll `/api/plan` from the CLI.
- The agent stream on the service requires a bearer token. Browser submission routes stay open on loopback. Every request from a loopback peer must name this machine in `Host` (a loopback name, `living-plan.local`, or the `--host` value), so a DNS-rebound page is refused. A write that carries an `Origin` must come from the same host, so another website cannot submit through the browser. The CLI sends no `Origin`. Both checks are `src/requestGuard.ts` and return 403. With LAN publishing on, a non-loopback peer needs the LAN secret before a plan page or plan API succeeds.
- A plan session is closed on `live-plan close`, and when it has no open browser or agent stream and `lastSeenAt` is 6 hours old. Approve and deny return that session to watch and leave it open. Iterate leaves it open in review.
- Restart the service when the package version in the lock file does not match the CLI.
- Commands that wait on the agent stream reconnect after a drop or a service restart, and stop only on a refusal, their timeout, or a stream that never connected. Do not add a waiting command that reads `readAgentEvents` directly; go through `followAgentEvents` in `src/agentStream.ts`.
- Entering review clears the last verdict only after an agent has acked its `review` row.
- The agent-facing commands are `check`, `serve`, `events`, `mode`, `reply`, and `close` ([ADR 0035](architecture/decisions/0035-six-plan-commands.md)). Keep `review`, `watch`, `wait`, `addressing`, and `address` working as shortcuts. After an approval the run follows the plan file; an explicit `execution stop` turns that off until the next approval.
- The service process stays running after `serve`, `events`, `wait`, `review`, `dashboard`, and `tui` exit, and after the desktop app quits.
- The desktop app uses a running service of any version (`dashboard --any-version`) and never restarts one. It starts its own copy only when none is running.
- A `living-plan://` link names a page by plan id, never by URL, so a link from a website can only open a page on a host the app already knows: the local service, or the hosted app from setup or `account login`.
- A page in a desktop app window gets no Tauri API and none of the app's commands. It reaches the app only by following `living-plan://switch/<mode>` and `living-plan://setup` links, which count only from inside an app window. A remote origin's one capability is moving the window. Do not add a remote capability for an app command: plan pages run code an agent wrote.
- The desktop app keeps no settings logic in Rust. A new setting goes into `src/desktopConfig.ts` and `live-plan desktop`, and the app page calls it through a command that runs the bundled CLI.
- Every page toolbar is a `header` with the class `titlebar`. The desktop app pads and drags that element on macOS, so a new page keeps the class.
- A plan page's toolbar is fixed (`src/planPage.css`) and its column pads for it. The hosted plan page (`src/PlanShell.tsx`) takes only `hostToolbarControlsCss`; the dashboards' sticky bar (`hostToolbarBarCss`) would leave its height again as empty space above the plan.
- The bundled service in the desktop app reads its files at the same paths relative to `dist/cli.js` as the npm package does. A new file the service reads at runtime goes into `SERVICE_ASSETS` in `scripts/build-desktop.ts`. A dependency must still bundle with `bun build`.
- A `workflow` block is required in a plan. `check` fails without it.
- While execution is active, plan forms and review return HTTP 409.
- Diagnostic logs are not submissions and are not shown on the page. They are files under `~/.config/living-plan/logs` (one registry file per day, one file per plan). `live-plan logs` reads them without a running service, and a restart leaves them in place.

## Working on a change

This project runs on Bun, not Node. Use `bun` for installs, scripts, and tests. The built CLI (`dist/cli.js`) starts with `#!/usr/bin/env bun` and imports without file extensions, so `node dist/cli.js` fails. `bun.lock` is the lockfile.

```bash
bun install
bunx playwright install chromium   # once, for the tests that open a browser
bun test ./test
bun run typecheck
bun run test:e2e
```

The desktop app (`src-tauri/`) also needs Rust. It ships for macOS: `bun run desktop:build` on a Mac writes the `.app` and a `.dmg`. `bun run desktop` opens a development window on any platform with the Tauri prerequisites, but `living-plan://` links reach only a bundled app. Its Rust tests are `cargo test --manifest-path src-tauri/Cargo.toml`, after `bun run desktop:stage` has put the staged service and Bun in place.

`bun test ./test` is the same as `bun run test`. Service behavior is covered in `test/planService.test.ts`. The older registry catalog is covered in `test/registry.test.ts`. A few unit tests open headless Chromium through Playwright, so they fail until the browser is installed.

`bun run test:e2e` builds the page client, starts the e2e plan servers from `scripts/e2e-server.ts`, and runs the Playwright specs in `e2e/`. The plan's code blocks finish drawing after the plan renders and change its height, so a spec that reads a scroll position calls `waitForCodeBlocks` from `e2e/fixtures/codeBlocks.ts` first.

### Continuous integration

`.github/workflows/test.yml` runs two jobs on every pull request and every push to `main`:

| Check | Runs |
|---|---|
| `Unit tests` | `bun run typecheck`, then `bun run test` |
| `E2E tests` | `bun run test:e2e`. Traces of failed tests are uploaded as the `playwright-results` artifact |

`publish.yml` calls the same workflow, so a release is published to npm only when both checks pass. `desktop.yml` builds the Mac app for Apple silicon and Intel for pull requests that touch it, by hand, and for a published release, where it attaches the `.dmg` files to the release. To block a merge on a failure, a repository admin requires the `Unit tests` and `E2E tests` checks on `main` in Settings → Rules → Rulesets (or Settings → Branches).

When a change alters how plans are hosted, how agents are notified, or what survives a restart, add an architecture decision under [docs/architecture/decisions](architecture/decisions/README.md) and update [docs/architecture/README.md](architecture/README.md) if the current picture changed. Update [docs/agent-guidelines.md](agent-guidelines.md) and [skills/live-plan/SKILL.md](../skills/live-plan/SKILL.md) when the CLI contract changes. Leave [skills/live-plan/primitives.md](../skills/live-plan/primitives.md) alone unless the plan vocabulary changed.

Record a decision when it replaces an earlier one. Mark the old decision superseded and link the new one. Do not delete the old record.
