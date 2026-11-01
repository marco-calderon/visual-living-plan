# Architecture

Visual Living Plan is two hosts and one plan page. An agent writes one `.plan.md` file. A person opens a URL to watch status and submit choices, forms, questions, approvals, and reviews. The agent hears those submissions on an event stream.

The default host is a Bun process on this machine. `--cloud` is a separate host: a TanStack Start application and a Cloudflare Worker. Both hosts leave MDX compilation in the browser.

Read [the decisions](decisions/README.md) for why it is shaped this way. Read [the project context](../context.md) before changing the code. Worker setup is [docs/cloud-host.md](../cloud-host.md).

## How the app is put together

```mermaid
flowchart TB
  subgraph machine ["This machine — the default"]
    CLI["live-plan CLI"]
    Bun["Bun service<br/>127.0.0.1:9477"]
    Sqlite[("registry.sqlite")]
    CLI -->|"serve, events, review"| Bun
    Bun --> Sqlite
  end

  subgraph hosted ["Opt-in — serve --cloud"]
    Start["TanStack Start<br/>pages at the repo root"]
    Worker["Elysia in src/host<br/>auth, APIs, sockets"]
    D1[("D1 living-plan")]
    DO["PlanObject<br/>one SQLite Durable Object"]
    Start -->|"server functions"| Worker
    Worker --> D1
    Worker --> DO
  end

  Person["Browser"] --> Bun
  Person --> Start
  CLI -.->|"account login, then --cloud"| Worker
```

| Host | Process | What it keeps | When it runs |
|---|---|---|---|
| Local loopback | Bun, Elysia, `127.0.0.1:9477` | Every plan on this machine, in `~/.config/living-plan/registry.sqlite` | `serve` and `review` start it. `npm run dev` is this CLI |
| Web application | TanStack Start, Vite, `src/entry.ts` | HTML for `/dashboard`, `/login`, `/plans/:id`, and the other pages | `npm run host` on local workerd, port 3000. Production is the same Worker |
| Worker session | `src/host/app.ts` | Better Auth, the plan catalog, plan APIs, WebSockets | Every request the Start router does not claim, including upgrades |
| Private server | One Elysia process, its own port | One plan, no registry row | `--no-registry` only |

`dashboard`, `tui`, `logs`, and `lan` stay on the local service even when a plan is hosted in the cloud.

## The web application

TanStack Start lives at the repository root. There is no `app/` directory. `vite.config.ts` loads the Cloudflare Vite plugin, the Start plugin, and React. `wrangler.jsonc` sets `main` to `src/entry.ts`. That file exports the `PlanObject` Durable Object and is the Worker entry.

`src/entry.ts` decides who answers:

```mermaid
flowchart TD
  Req["Request"] --> Upgrade{"WebSocket upgrade?"}
  Upgrade -->|yes| Worker["src/host/app.ts"]
  Upgrade -->|no| Favicon{"/favicon.png"}
  Favicon -->|yes| Icon["Asset, or the built-in mark"]
  Favicon -->|no| Page{"GET or HEAD of a page route?"}
  Page -->|yes| Start["TanStack Start handler"]
  Page -->|no| Worker
  Start -->|"loadPlan, loadAccount, loadHistory"| Worker
```

Page routes, from `src/pageRoutes.ts` and `src/routes/`:

| Route | File | What it does |
|---|---|---|
| `/`, `/review` | `index.tsx`, `review.tsx` | Redirect to `/dashboard` |
| `/login` | `login.tsx` | Email and password, and Google or GitHub when those secrets exist. A `cli` search param finishes `account login` |
| `/dashboard` | `dashboard.tsx` | This account's hosted plans |
| `/account` | `account.tsx` | Name, email, tier |
| `/settings` | `settings.tsx` | Appearance stored in D1 |
| `/plans/:id` | `plans.$planId.tsx` | The plan page. `PlanShell` |
| `/plans/:id/history` | `plans_.$planId.history.tsx` | Published versions of that plan |
| `/local` | `local.tsx` | The sample plan in `PlanShell`, with no account and no Durable Object |
| `/sample` | `sample.tsx` | Signs in, opens the sample on the account, redirects to `/plans/:id` |

`/plans/:id/` is rewritten to `/plans/:id` before Start sees it. Other page paths lose a trailing slash the same way. `/client/...` on this Worker is 404. The Start bundle imports the plan client itself. The Worker does not return a second HTML copy of these pages. `src/host` keeps the session, the plan APIs, the Durable Object, and auth.

Server functions in `src/planFns.ts` call back into `src/host/app.ts` with the incoming cookie. The route never talks to D1 or the Durable Object on its own.

`npm run dev` is still the local Bun CLI. `npm run host` is this application on local workerd, including D1 and the Durable Object. Apply the local migrations with `npm run host:migrate`. The library bundle the Bun service serves from `/client/` is built by `vite.client.config.ts` (`npm run build:client`).

## The Worker, D1, and Better Auth

`src/host/app.ts` is the Elysia app for everything that is not a page: `/api/auth/*`, `/api/account`, `/api/plans`, `/api/health`, plan writes, the viewer link, document downloads, and WebSocket upgrades. It refuses to start when `BETTER_AUTH_SECRET` is missing. The value in `wrangler.jsonc` is for local workerd. Production sets the secret with Wrangler. An upgrade is forwarded to the Durable Object before Elysia copies the response, so the Workers socket stays on that response.

Better Auth (`src/host/auth.ts`) uses the D1 binding `DB`. Email and password are always on. Google and GitHub are added when both id and secret are set. The `bearer` and `organization` plugins are on. D1 rejects `Date` and boolean bindings, so `bindableD1` turns a `Date` into an ISO string and a boolean into `0` or `1` before `bind`.

The CLI stores the raw session token from sign-in. Better Auth's bearer plugin does not turn that token back into a session, so `getSession` only sees a browser cookie. `sessionFromToken` reads `session` joined to `user` in D1.

D1 is the account database and the published plan documents, not the live plan. Migrations live in `src/migrations`.

| Table | Role |
|---|---|
| `user`, `session`, `account`, `verification` | Better Auth identity. `user.tier` is `free`, `pro`, or `business` |
| `organization`, `member`, `invitation` | Better Auth organizations |
| `plans` | Catalog row: id, owning user, plan bearer, title, mode, tier, `closed_at` |
| `user_settings` | Accent, page width, diff theme, code wrap |
| `plan_versions` | Published markdown. The latest 10 per plan. The 11th drops the oldest |

Three credentials, and they are not interchangeable ([ADR 0022](decisions/0022-opt-in-cloud-host.md)):

```mermaid
flowchart LR
  Account["Account session<br/>cookie or bearer"] -->|"register, dashboard, settings"| D1["D1"]
  PlanBearer["Plan bearer<br/>cloud.json only"] -->|"upload source, agent socket"| DO["PlanObject"]
  Viewer["Viewer cookie<br/>GET /plans/:id/view/:sig"] -->|"read and submit"| DO
```

The account bearer is not written into the plan file. The plan bearer is not written there either. The CLI writes `cloudId` into the frontmatter and keeps the plan bearer in `~/.config/living-plan/cloud.json`. `GET /plans/:id/view/:sig` checks an HMAC of the plan id and sets the viewer cookie, then redirects to the plan page.

Open plans, sockets, and idle time follow `user.tier`. Free is 1 plan, 2 sockets, and 1 hour. Pro is 10, 4, and 6 hours. Business is 50, 50, and 6 hours. Reattaching a plan does not take another slot. There is no billing screen.

## Durable Objects

Each cloud plan is one SQLite Durable Object, class `PlanObject`, binding `PLANS`. Wrangler migration `v1` creates that class. The id is `cloudId`, not a hash of the file path.

`src/host/planObject.ts` accepts the WebSocket, enforces the socket cap, and runs an alarm for idle close. Its other routes are Elysia. The SQL is `src/host/planRoom.ts`, on `this.ctx.storage.sql`.

| Stored in the object | What it is |
|---|---|
| `meta` | Token, title, mode, tier, source, revision, responses, comments, review, execution, closed flag, last seen |
| `events` | Submissions. `delivered_at` is set when the agent acks |

The page and the agent share that object's hibernating WebSockets. A local plan still uses server-sent events on the Bun process. The Durable Object holds the live session. D1 holds the account and the published document versions. Uploading source writes the Durable Object first, then `plan_versions` in D1. A stale revision is HTTP 409.

`close` sets the object closed and sets `plans.closed_at` in D1. An idle alarm closes the object when no socket is open and last seen is older than the tier's idle time.

## A plan page

The plan file is MDX. Neither host compiles it into the HTML it sends. A Worker request cannot eval generated code, and the Bun page is the same client on purpose ([ADR 0020](decisions/0020-mdx-plan-page.md), [ADR 0023](decisions/0023-tanstack-start-page.md)). That client is `client/planMdx.tsx`.

```mermaid
sequenceDiagram
  participant Browser
  participant Start as TanStack /plans/:id
  participant Worker
  participant D1
  participant DO as PlanObject
  Browser->>Start: GET /plans/:id
  Start->>Worker: hostedPlanPage
  Worker->>D1: session and plans.user_id
  Worker->>DO: GET /view
  DO-->>Worker: source, mode, responses, comments, review
  Worker-->>Start: page JSON
  Start-->>Browser: PlanShell and JSON script living-plan-mdx
  Note over Browser: compile MDX, mount #plan-mdx-root
  Browser->>DO: WebSocket /plans/:id/api/events
```

On the cloud host, `src/routes/plans.$planId.tsx` loads that JSON through `loadPlan`, then renders `PlanShell` (`src/PlanShell.tsx`). The shell is the title bar, the plan and workflow tabs, the contents list, and an empty `#plan-mdx-root`. It sets `window.__LIVE_PLAN_BASE__` to `/plans/<id>`, `window.__LIVE_PLAN_HOST__` to `cloud`, and `window.__LIVE_PLAN_TRANSPORT__` to `websocket`. After layout it imports `client/planMdx.tsx`, `client/main.tsx` (the workflow canvas), and `client/chrome/mountChrome.tsx`. A cloud host also imports the plan selector. A plan that contains a code fence imports the highlighter.

The route puts three JSON scripts on the page: `#living-plan-mdx` (source, title, responses), `#living-plan-comments`, and `#living-plan-review`. The workflow panel gets `#living-plan-bootstrap` when the loader built an execution snapshot.

`client/planMdx.tsx` reads `#living-plan-mdx`. `planSourceToMdx` strips frontmatter and rejects `{% tags %}` and YAML entry fences. `compilePlanMdx` runs `@mdx-js/mdx` `compile` in the page (`outputFormat: function-body`), with remark plugins for mermaid and pipe tables and a recma plugin that maps plan tags onto React components. `run` evaluates that function body with `react/jsx-runtime`. The module renders into `#plan-mdx-root`. Choice, form, questions, and approve post to `/api/interactions/:id` under `__LIVE_PLAN_BASE__`. A later `plan` or `reload` event compiles again.

The local Bun page does not use `PlanShell`. `src/render.ts` writes the same mount points and the same `#living-plan-mdx` script into an HTML string, then loads the prebuilt module from `/client/`. The browser compile is the same function. Events on that host are SSE, because the page does not set `__LIVE_PLAN_TRANSPORT__`.

```mermaid
sequenceDiagram
  participant Browser
  participant Bun as Bun service
  participant Session as planSession
  Browser->>Bun: GET /plans/:id/
  Bun->>Session: source and session
  Bun-->>Browser: HTML from renderPlanPage
  Note over Browser: the /client bundle compiles MDX into #plan-mdx-root
  Browser->>Bun: SSE /plans/:id/api/events
```

`/local` is the third surface: `PlanShell` around the rate-limit sample, `host="local"`, no base path, no account, and no Durable Object. It still compiles in the browser.

## How the pieces talk

A single Bun process listens on `127.0.0.1:9477`. `serve` and `review` start it when it is not already running, then register a plan. That process is detached into its own session. It keeps running after `serve`, `review`, `events`, `watch`, `wait`, `dashboard`, and `tui` exit, and after the terminal that started them closes. `serve` is a client of that plan. It prints undelivered submissions and exits. The page stays up. `review` waits for the decision and leaves the plan open. Approve and deny set that session back to watch. Iterate leaves it in review, hides the verdict bar, and marks comments that are not yet addressed as in progress ([ADR 0013](decisions/0013-iterate-keeps-review.md)). `live-plan mode` moves the same session between watch, comment, and review, and the open tab follows.

The printed URL is the bind address ([ADR 0016](decisions/0016-loopback-address.md)). On the default host that is `http://127.0.0.1:9477/plans/<id>/`. The CLI dials `127.0.0.1` and does not resolve `*.local`. `--host` other than loopback is unchanged, so a cloud agent can still share a reachable address.

LAN publishing is off until `live-plan lan on` ([ADR 0019](decisions/0019-lan-publishing.md)). That command stores the choice under `~/.config/living-plan`, listens on all interfaces when no non-loopback `--host` was set, and advertises `living-plan.local` at a private LAN address. The registry lock still tells the CLI to dial `127.0.0.1`, so `serve` and `review` keep printing the loopback plan URL. The LAN URL, printed only by `lan on` and `lan status`, carries a secret. Visiting it sets a cookie. A non-loopback request without that cookie or secret gets 401 on plan pages and plan APIs. Loopback stays open. The agent stream still requires its bearer token. `lan off` withdraws the announcement, removes a firewall rule this tool added, and binds `127.0.0.1` again.

`--cloud` is a separate host ([ADR 0022](decisions/0022-opt-in-cloud-host.md)). `account login` stores an account bearer in `~/.config/living-plan/cloud.json`. `serve --cloud` and `review --cloud` register the plan on that Worker, write `cloudId` into the plan frontmatter, and keep the plan bearer in `cloud.json`. They do not start the local registry. The page and the agent share a WebSocket on one SQLite Durable Object. `dashboard`, `tui`, `logs`, and `lan` stay local. The web application is TanStack Start at the repository root ([ADR 0023](decisions/0023-tanstack-start-page.md)). The browser still compiles the plan MDX and mounts the same React entries. The Worker keeps the account, the Durable Object, and every plan API. `npm run host` runs that application on local workerd. Setup for the Worker bindings is [docs/cloud-host.md](../cloud-host.md).

```mermaid
flowchart LR
  Agent["Agent CLI"]
  Browser["Browser"]
  Service["Plan service 127.0.0.1:9477"]
  File["plan.md"]
  DB[("registry.sqlite")]
  Archive["plans/id.plan.md"]

  Agent -->|"serve, review, events, wait, close"| Service
  Browser -->|"page and form posts"| Service
  Service -->|"watch"| File
  Service -->|"sessions and finished runs"| DB
  Service -->|"copy the plan file"| Archive
  Service -->|"notice"| Agent
```

Each plan is a session under `/plans/<id>/`. The id is a stable hash of the plan path, so registering the same file again returns the same URL.

`--no-registry` does not use this service. It starts one private server for that plan, at the root of its own port. Tests and one-shot runs use that path. That process is the server. The page stops when `serve` exits, and when `review` finishes on approve or deny. Iterate leaves the private process running. The server does not register itself in the plan list. It proxies `GET /api/processes` to the service when a registry URL was passed in, so the Plans panel still works. The agent stream on that server does not require a token.

## Where a request goes

`src/registryService.ts` is an Elysia app, bound with Bun. Each path is a route handler. Paths under `/plans/<id>/` resolve that session in `src/planHost.ts` and run the handlers in `src/planRoutes.ts`. `src/planSession.ts` holds the plan state and both event streams. Everything else is the catalog, the dashboard, or shared assets.

```mermaid
flowchart TD
  Req["Request on the plan service"] --> Match{"Path"}
  Match -->|"/plans/id/..."| Session["planSession for that id"]
  Match -->|"POST /api/plans"| Register["Register or reattach the session"]
  Match -->|"DELETE /api/plans/id"| Close["Close that session"]
  Match -->|"/ and /api/processes"| List["Hosted plans and private processes"]
  Match -->|"/dashboard and /api/dashboard"| Dash["Day, week, or month summary"]
  Match -->|"/api/plans"| History["Live plans plus finished runs"]
  Match -->|"/archive/id"| Copy["Archived plan markdown"]
  Match -->|"/client/..."| Assets["Client assets, served once"]
```

| Surface | Path |
|---|---|
| Plan page | `/plans/<id>/` (`/plans/<id>` redirects here) |
| Plan API | `/plans/<id>/api/plan`, `/api/interactions/:id`, `/api/comments`, `/api/comments/:id/address`, `/api/comments/:id/addressing`, `/api/comments/:id/reply`, `/api/review`, `/api/mode`, `/api/execution` (GET, PUT, `/start`, `/stop`), `/api/theme` (GET, PUT) |
| Browser events | `/plans/<id>/api/events` |
| Agent events | `/plans/<id>/api/agent-events` (bearer token) and `POST /api/agent-events/ack` |
| Plan list | `/api/processes` and `GET /` |
| Private registration | `POST /api/processes`, `POST /api/processes/:id/heartbeat`, `DELETE /api/processes/:id` |
| Dashboard | `/dashboard` and `/api/dashboard?period=day\|week\|month` |
| Logs | `GET /api/logs` for the service, and `GET` and `POST /plans/<id>/api/logs` for one plan |
| Finished runs | `GET /api/plans` |
| Archived plan file | `/archive/<id>` |
| Health | `GET /api/health` |
| Client assets | `/client/...` once, for every plan |

Browser API calls from a hosted page are prefixed with `/plans/<id>`. Root `/api/...` on the service is the catalog, the dashboard, and the service log, not a plan. `new URL('/api/plan', planUrl)` is wrong when the plan URL has a path. The CLI uses `planApiUrl` in `src/agentEvents.ts`.

## Logs

Errors, warnings, and logs for development are files under `~/.config/living-plan/logs` ([ADR 0015](decisions/0015-service-logs.md)). winston writes one registry file per local day and one file per plan. The page posts browser console output and script errors to `POST /plans/<id>/api/logs` and does not render them. `live-plan logs` prints the files and does not need a running service. `GET /api/logs` reads today's registry file. Nothing in the log is a submission, so `events` does not print it. A restart leaves the files in place.

## Session lifecycle

An open session is **running**. It is restored from SQLite when the service starts, as long as the plan file is still on disk.

```mermaid
stateDiagram-v2
  [*] --> Running: serve or review registers the plan
  Running --> Running: service restart restores the session
  Running --> Executed: close
  Running --> Interrupted: no open stream and lastSeenAt is 6 hours old
  Running --> Interrupted: a registered private process is stale or its pid is dead
  Executed --> [*]
  Interrupted --> [*]
```

`live-plan close --url <plan-url>` and `DELETE /api/plans/<id>` close one hosted plan immediately and record it as executed. `review` records the decision and leaves the plan open. Approve and deny set the mode to watch. Iterate leaves the mode on review. A session with no open browser stream and no open agent stream is closed as interrupted once `lastSeenAt` is 6 hours old. Requests and new streams refresh that time. An open stream keeps the session up even when the timestamp is older. A private server registered with `POST /api/processes` is removed from the live list and recorded as interrupted when its heartbeat is older than 20 seconds, or when its pid is gone. `--no-registry` does not write that row.

Registering a path that is still open reattaches to that session. `serve` does not change a session that is already in comment or review. After the session is closed, registering the same path opens a new running session with the same id. The earlier run stays in `plan_runs`.

## How a person and an agent meet

The browser posts a submission to `/api/interactions/:id`, `/api/comments`, or `/api/review`. The session stores it and tells open browsers with an event named `interaction`, `comment`, or `review`. It writes a `notice` to every agent subscribed to `/api/agent-events`. The same named events are also copied onto the agent stream. The CLI reads `hello` and `notice`. A `notice` carries `event` of `interaction`, `review`, or `comment`.

```mermaid
sequenceDiagram
  participant Browser
  participant Session as planSession
  participant Store as SQLite
  participant Agent as Agent CLI
  Browser->>Session: POST /plans/id/api/interactions/id
  Session->>Store: save the response and a plan_events row
  Session-->>Browser: SSE event interaction
  Session-->>Agent: SSE event notice
  Agent->>Session: POST /api/agent-events/ack
  Note over Agent: hello is first. hello.pending lists rows with delivered_at null
```

`hello` on the agent stream carries the mode, pending interaction ids, responses, review, comments, execution, and `pending`. `pending` is the `plan_events` rows for that plan whose `delivered_at` is null, in `seq` order. `serve` and `events` print each of those as one JSON line, ack them, and exit. When none are pending they wait for the next `notice`, print it, ack it, and exit. `watch` sets watch mode and stays connected for the execution that follows an approval. It prints later submissions and does not exit. A client subscribed to a different plan does not see them. `wait` returns when the matching interaction id arrives. `review` returns when the review `notice` arrives and leaves the plan open. Both ack the row they return. `mode` switches that session among watch, comment, and review. The browser stream carries the same `mode` event, so an open tab updates in place. `--detach` registers without subscribing.

The agent stream on the shared service requires the plan token or the service token. The CLI reads the service token from `~/.config/living-plan/registry.json` when `--token` is omitted. Browser submission routes stay open without that token on loopback. With LAN publishing on, a non-loopback peer also needs the LAN secret before a plan page or plan API succeeds. The agent stream still checks the bearer token on every peer.

While execution is active, plan forms and review return HTTP 409. Comments stay open. Addressing a comment (`POST /api/comments/:id/addressing` or `POST /api/comments/:id/address`) updates that comment and does not insert a new `plan_events` row. Address stores an outcome of `implemented` (the default), `errored`, or `issues`. `POST /api/comments/:id/reply` appends an agent reply to that same comment and also does not insert a `plan_events` row ([ADR 0014](decisions/0014-comment-replies.md)). `live-plan addressing` sets `addressingAt` (the page shows Addressing or Working). `live-plan reply` appends the reply text. `live-plan address` sets `addressedAt` and the outcome (the page shows Addressed, or Implemented, Errored, or Had issues on a minibar message). The reply is saved with the session and shown on the messages minibar or that part's comment thread.

## Dashboard

`/dashboard` summarizes running, executed, and interrupted plans for the local day, week, or month. The page is `src/dashboardPage.ts`. The grouping is `src/dashboard.ts`. `live-plan tui` is that registry in the terminal: the running-plan list from `GET /api/processes`, and the same `GET /api/dashboard` payload with running plans listed first. Starting it starts the service when none is running. Quitting the terminal leaves the service up.

```mermaid
flowchart LR
  Sessions["Open hosted sessions"] --> Running["status running"]
  Private["Live private processes"] --> Running
  Runs["plan_runs rows"] --> Finished["executed or interrupted"]
  Running --> Summary["buildDashboard"]
  Finished --> Summary
  Summary --> Page["/dashboard"]
```

A row overlaps the selected window when it started before the end of the window and is still running, or its end falls inside the window. Finished runs are stored in `plan_runs` with typed `started_at` and `ended_at` columns. `GET /api/dashboard` selects that window in SQLite: `started_at` is at or before the window end, and `COALESCE(ended_at, heartbeat_at, started_at)` is at or after the window start. Open sessions and live private processes stay in memory. A running row overlaps when it started before the window end. A finished in-memory row uses `ended_at`, then `heartbeat_at`. Completion counts phases marked done plus interactions that already have an answer (`src/planProgress.ts`). Files modified is the git change count captured with the run. The plan markdown copied into the registry home is linked from the table at `/archive/<id>`.

## What lives where

| Module | Role |
|---|---|
| `src/planSession.ts` | One plan: plan-file and theme-config watch, parsed document, responses, comments, execution, review, submission log, browser events, agent events |
| `src/configHome.ts` | XDG `~/.config/living-plan` resolution, env overrides, and legacy home migration |
| `src/serviceLog.ts`, `src/clientLog.ts` | Development log files under `~/.config/living-plan/logs`, and the page script that posts console output into them |
| `src/planRoutes.ts` | Elysia routes for one plan, at the origin or under `/plans/<id>/` |
| `src/planHost.ts` | All sessions on the service: register, reattach, close, idle timeout, git snapshot cache, dashboard rows for open sessions |
| `src/registryService.ts` | The Elysia app: health, plan list, registration, dashboard, archive, and the hosted plan routes |
| `src/registryStore.ts`, `src/store/` | The local SQLite store: `plans` for private servers, `plan_sessions` for live hosted plans, `plan_events` for submissions, `plan_runs` for finished runs. `migrate.ts` creates the tables, including the copy from the older `processes` table |
| `src/server.ts` | The private one-plan Elysia app used by `--no-registry` |
| `src/httpServer.ts` | Binds an Elysia app with `Bun.serve` so event streams stay open |
| `src/localName.ts` | Loopback checks and HTTP origin formatting |
| `src/lanConfig.ts`, `src/lanAddress.ts`, `src/lanAccess.ts`, `src/lanFirewall.ts`, `src/lanCommand.ts` | Opt-in LAN preference, address choice, cookie gate, firewall rule, and `lan` commands |
| `src/mdnsPacket.ts`, `src/mdnsPublish.ts` | DNS-SD announcement for `living-plan.local` while LAN mode is on |
| `src/cli.ts` | Client of the service. `serve` registers and prints that plan's undelivered submissions. `events`, `wait`, `watch`, and `review` read the same stream. `logs` prints the diagnostic files under `~/.config/living-plan/logs`. `dashboard` opens `/dashboard`. `tui` reads `/api/processes` and `/api/dashboard`, and leaves the service running when it exits. `--cloud` uses the signed-in host instead |
| `src/cloudStore.ts`, `src/cloudClient.ts`, `src/cloudCommand.ts`, `src/cloudWatch.ts`, `src/cloudFrontmatter.ts` | Account session and plan bearers in `cloud.json`, frontmatter `cloudId`, upload, and the file watcher for `--cloud` |
| `src/agentEvents.ts` | SSE reader for a local plan, WebSocket reader for a cloud plan, ack helper, and `planApiUrl` used by the CLI |
| `src/entry.ts`, `src/pageRoutes.ts` | Worker entry. Pages go to TanStack Start. Auth, plan APIs, and WebSockets go to `src/host` |
| `src/routes/`, `src/PlanShell.tsx`, `src/planFns.ts` | The web application. Start routes, the plan shell, and the server functions that call the Worker |
| `src/host/`, `src/migrations/` | Better Auth on D1, the plan catalog, published versions, Elysia routes, and one SQLite Durable Object per plan |
| `vite.config.ts`, `wrangler.jsonc` | The Start app and its Worker bindings. `vite.client.config.ts` is the `/client/` bundle the Bun service serves |
| `src/dashboard.ts`, `src/dashboardPage.ts`, `src/tui/` | Period summary, the dashboard page, and the terminal view of the same read |
| `src/planArchive.ts` | Copy a plan file into the registry home and serve that copy |
| `src/parse.ts`, `src/planMdx/outline.ts` | Parse MDX plan components for the session model (interactions, workflow, progress). `{% tags %}` and YAML entry fences are rejected ([ADR 0021](decisions/0021-mdx-plan-entries.md)) |
| `src/planMdx/`, `src/planSnapshots.ts`, `client/planMdx.tsx`, `client/entries/`, `client/mdx/` | The plan column. The page compiles MDX and renders the React entries, Pele diagrams, ELK workflow, and TanStack charts. Source history is plan snapshots. The page shows the current file version on the description card and does not list or restore snapshots |
| `src/render.ts` | HTML shell for a plan on the Bun service: the same mount points `PlanShell` renders for a cloud plan |
| `client/planMdx.tsx`, `client/mdx/` | Browser MDX compile and the React plan. Used by `PlanShell` and by the `/client/` bundle |

## What survives a restart

The service writes each open session to `~/.config/living-plan/registry.sqlite` (`plan_sessions`): plan path, mode, iteration, responses, comments, execution, review, token, cwd, theme config path, and last-seen time. Submissions are rows in `plan_events`. On startup it opens those files again and reattaches the watchers. A missing plan file drops that session. Diagnostic logs are not in the database. They are files under `~/.config/living-plan/logs` and stay on disk across a restart.

`live-plan close`, the idle timeout, and `DELETE /api/plans/<id>` delete that session's `plan_sessions` row and its `plan_events` rows. Stopping the service process does not. The next start restores the sessions whose plan files are still on disk. Finished runs stay in `plan_runs` and are not reopened. Live private servers are rows in `plans`. A database that still has the older `processes` table is copied into `plans` on open. The copied markdown stays at `~/.config/living-plan/plans/<id>.plan.md`.

When the installed package version differs from the version in the lock file, the CLI stops the running service and starts the current one.
