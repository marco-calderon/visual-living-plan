# Project context

Read this before changing Visual Living Plan. It is the map for a new session. The current shape of the running system is [docs/architecture/README.md](architecture/README.md). Why it is shaped that way is [docs/architecture/decisions/README.md](architecture/decisions/README.md).

## What this is

An agent writes one `.plan.md` file. A person opens a local URL to see status and answer choices, forms, questions, approvals, and reviews. The agent hears those submissions on an event stream.

The package name is `visual-living-plan`. The commands `live-plan`, `living-plan`, and `visual-living-plan` are the same program. Agents in other repos invoke the published CLI with `npx --yes visual-living-plan`. Do not point them at this repo's `npm run` scripts. Those scripts are for developing this repository.

Authoring rules for agents who *use* the tool live in [docs/agent-guidelines.md](agent-guidelines.md) and [skills/live-plan/SKILL.md](../skills/live-plan/SKILL.md). Block schemas live in [skills/live-plan/primitives.md](../skills/live-plan/primitives.md). This file is for agents who *change* the tool.

## How a plan is hosted

One service per machine, default `127.0.0.1:9477`, hosts every plan. `serve` registers the file and subscribes to that plan's agent stream. On loopback it prints `http://living-plan.local/plans/<id>/` when that name resolves to loopback and port 80 can be opened; otherwise `http://living-plan.local:9477/plans/<id>/` or `http://127.0.0.1:9477/plans/<id>/`. It prints undelivered submissions and exits. The page and the service stay up after it exits. `--detach` registers and returns. `events` is the client to start again for the next submission. `wait` blocks on one id. A client of another plan does not see the event. The service is a detached process and keeps running when a CLI client disconnects. `--no-local-name` and `LIVE_PLAN_LOCAL_NAME=0` keep the IP URL. `--host` other than loopback is the address a cloud agent shares.

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
| `src/registryStore.ts` | SQLite through Drizzle. `plans`, `plan_sessions`, `plan_events`, and `plan_runs`. Finished runs are filtered by `started_at` and `ended_at` |
| `src/server.ts` | Private one-plan Elysia app |
| `src/httpServer.ts` | `Bun.serve` binding for an Elysia app |
| `src/agentEvents.ts` | Client-side SSE reader. Use `planApiUrl` so `/plans/<id>/` URLs resolve correctly |
| `src/parse.ts`, `src/render.ts` | Plan file in, HTML page out |
| `src/workflow.ts`, `src/execution.ts` | Expected workflow and the live execution overlay |
| `client/` | React Flow canvas. It reads `window.__LIVE_PLAN_BASE__` and calls `/api/...` under that prefix |
| `test/` | Node test runner via `npm test` |
| `examples/rate-limit.plan.md` | The fixture plan used by service tests |

Home directory for the service is `~/.visual-living-plan`, or `LIVE_PLAN_HOME` when set. The lock file is `registry.json`. The database is `registry.sqlite`.

## Invariants

- The plan file is the document. Responses, comments, execution, and review are session state in `plan_sessions`. Submissions are rows in `plan_events`.
- The same plan path always maps to the same plan id.
- Browser API calls from a hosted page are prefixed with `/plans/<id>`. Root `/api/...` on the service is the catalog, not a plan.
- `new URL('/api/plan', planUrl)` is wrong for a plan URL that has a path. Use `planApiUrl`.
- User submissions are pushed on the agent stream and stored in `plan_events`. `delivered_at` is set when the CLI acks. Do not poll `/api/plan` from the CLI.
- The agent stream on the service requires a bearer token. Browser submission routes stay open on loopback.
- A plan session is closed on `live-plan close`, and when it has no open browser or agent stream and `lastSeenAt` is 6 hours old. Approve and deny return that session to watch and leave it open. Iterate leaves it open in review.
- Restart the service when the package version in the lock file does not match the CLI.
- The service process stays running after `serve`, `events`, `wait`, and `review` exit.
- A `workflow` block is required in a plan. `check` fails without it.
- While execution is active, plan forms and review return HTTP 409.

## Working on a change

```bash
npm install
npm test
npx tsc --noEmit
```

`npm test` runs `tsx --test test/*.test.ts`. Service behavior is covered in `test/planService.test.ts`. The older registry catalog is covered in `test/registry.test.ts`.

When a change alters how plans are hosted, how agents are notified, or what survives a restart, add an architecture decision under [docs/architecture/decisions](architecture/decisions/README.md) and update [docs/architecture/README.md](architecture/README.md) if the current picture changed. Update [docs/agent-guidelines.md](agent-guidelines.md) and [skills/live-plan/SKILL.md](../skills/live-plan/SKILL.md) when the CLI contract changes. Leave [skills/live-plan/primitives.md](../skills/live-plan/primitives.md) alone unless the plan vocabulary changed.

Record a decision when it replaces an earlier one. Mark the old decision superseded and link the new one. Do not delete the old record.
