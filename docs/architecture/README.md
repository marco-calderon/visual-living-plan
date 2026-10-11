# Architecture

Visual Living Plan is a local HTTP service plus a browser page. An agent writes one `.plan.md` file. A person opens a URL on that service to watch status and submit choices, forms, questions, approvals, and reviews. The agent hears those submissions on an event stream.

Read [the decisions](decisions/README.md) for why it is shaped this way. Read [the project context](../context.md) before changing the code.

## One service, many plans

A single process listens on `127.0.0.1:9477`. `serve` and `review` start it when it is not already running, then register a plan and return. The page stays up after the CLI exits.

```text
Agent CLI  --register / wait / events-->  Plan service  --watches-->  plan.md
Browser    --page and form posts------->  Plan service
Plan service --interaction / review---->  Agent event stream
```

Each plan is a session under `/plans/<id>/`. The id is a stable hash of the plan path, so registering the same file again returns the same URL.

| Surface | Path |
|---|---|
| Plan page | `/plans/<id>/` |
| Plan API | `/plans/<id>/api/plan`, `/api/interactions/:id`, `/api/review`, `/api/execution`, `/api/theme` |
| Browser events | `/plans/<id>/api/events` |
| Agent events | `/plans/<id>/api/agent-events` (bearer token) |
| Plan list | `/api/processes` and `GET /` |
| Client assets | `/client/...` once, for every plan |

`--no-registry` does not use this service. It starts one private server for that plan, at the root of its own port. Tests and one-shot runs use that path.

## What lives where

| Module | Role |
|---|---|
| `src/planSession.ts` | One plan: file watch, parsed document, responses, execution, review, browser events, agent events |
| `src/planHost.ts` | All sessions on the service: register, close, idle timeout, git snapshot cache |
| `src/registryService.ts` | The HTTP process: health, plan list, registration, and the hosted plan routes |
| `src/registryStore.ts` | SQLite for the plan list and for session snapshots |
| `src/server.ts` | The private one-plan server used by `--no-registry` |
| `src/cli.ts` | Client of the service. `serve` registers and exits. `events`, `wait`, and `review` read the stream |
| `src/agentEvents.ts` | SSE reader and URL helper used by the CLI |
| `src/render.ts`, `client/` | The page. API calls are prefixed with the plan's base path |

## Agent notification

The browser posts a submission to `/api/interactions/:id` or `/api/review`. The session stores it, tells open browsers, and writes the same event to every agent subscribed to `/api/agent-events`.

`events` prints each event until stopped. `wait` returns when the matching interaction id arrives. `review` returns when the review event arrives, then closes that plan. The first event on a new subscription is `hello`, which includes responses and review state already stored.

The agent stream requires the plan token or the service token. The CLI reads the service token from `~/.visual-living-plan/registry.json` when `--token` is omitted. Browser routes on loopback stay open so the page can submit without that token.

## What survives a restart

The service writes each session to `~/.visual-living-plan/registry.sqlite`: plan path, mode, responses, execution, review, and token. On startup it opens those files again and reattaches the watchers.

A session with no browser and no agent stream for 6 hours is closed. `live-plan close --url <plan-url>` closes one immediately. `review` closes its plan after the decision.

When the installed package version differs from the version in the lock file, the CLI stops the running service and starts the current one.
