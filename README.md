# Visual Living Plan

Agent-authored visual plans for human interaction — closer to [Visual Plan](https://visualplan.dev/) than to a workflow builder.

The agent owns a `.plan.md` file. Humans open a browser URL to:

- see live status as phases update
- answer choices, forms, questions, and approval gates
- follow a live **execution diagram** (React Flow) while plan forms are locked

Works for local agents (file + localhost URL) and is shaped so a cloud agent can host the same server and share the URL.

## Quick start

```bash
npm install
npm run serve -- examples/rate-limit.plan.md --port 9410
```

Open `http://127.0.0.1:9410`. Edit the example file, change a phase `status`, and the page reloads. Click a choice or submit a form to send structured feedback to the agent.

### Review mode

```bash
npm run review -- examples/rate-limit.plan.md --iteration 1
```

Blocks until Approve (`0`), Deny (`1`), or Iterate (`2`).

### Wait for one interaction

With `serve` already running:

```bash
npm run wait -- fail-mode --url http://127.0.0.1:9410
```

### Live execution canvas

The page has **Plan** and **Execution** tabs. While execution is active, Plan forms/gates are disabled. The Execution tab hosts a readonly [React Flow](https://reactflow.dev) graph the agent updates live.

```bash
npm run execution -- start --url http://127.0.0.1:9410 \
  --step "Implement middleware" \
  --detail "Editing gateway.ts" \
  --graph examples/execution-graph.json

npm run execution -- push --url http://127.0.0.1:9410 \
  --step "Add coverage" \
  --graph examples/execution-graph.json

npm run execution -- stop --url http://127.0.0.1:9410
```

Agent payloads:

- `graph` — portable `{ nodes, edges }` (preferred; adapter-agnostic)
- `scene` — optional adapter-specific extras

React Flow already draws cycles between different nodes. A self-loop (`from` and `to` are the same id) uses a custom arc, because the built-in edge paths collapse onto the node. An optional edge `label` is drawn on that arc. `examples/execution-graph.json` includes one: `implement → implement`, labeled `retry`.

## Why this exists

Visual builders optimize for humans drawing graphs. Living Plan optimizes for **agents communicating**:

| Need | Mechanism |
|------|-----------|
| Show current status | `phase` blocks + file watch reload |
| Ask for direction | `choice`, `form`, `questions`, `approve` |
| Converge on a plan | review bar + iteration diffs |
| Show live execution | React Flow canvas via `/api/execution` |
| Local + cloud | same file + HTTP server URL |

## Plan vocabulary

See `examples/rate-limit.plan.md` and `skills/living-plan/SKILL.md`.

YAML fenced blocks:

- `phase` — status timeline
- `callout` — note / tip / risk / decision / warning
- `choice` / `form` / `questions` / `approve` — human interactions
- `checklist` — definition of done

## Execution canvas adapters

Execution rendering goes through a small port/adapter layer:

- `client/execution-canvas/port.ts` — adapter contract
- `client/execution-canvas/toCanvasModel.ts` — maps `ExecutionState` → portable model
- `client/execution-canvas/adapters/reactFlow/` — current React Flow adapter
- `client/execution-canvas/registry.ts` — set `ACTIVE_EXECUTION_CANVAS_ADAPTER_ID`

To swap libraries later, add another adapter and change the active id. Keep agent payloads on `graph` so the API stays stable.

## API

- `GET /` — interactive HTML page (Plan + Execution tabs)
- `GET /api/plan` — plan metadata, responses, pending interaction ids, execution state
- `GET /api/execution` — current execution canvas state
- `PUT /api/execution` — set execution state (`active`, `step`, `detail`, `graph`, `scene`)
- `POST /api/execution/start` / `POST /api/execution/stop` — convenience toggles
- `GET /api/events` — SSE (`reload`, `interaction`, `review`, `execution`)
- `POST /api/interactions/:id` — submit an interaction response (409 while execution is live)
- `POST /api/review` — submit Approve / Deny / Iterate (review mode)

## Agent skill

Install or point your coding agent at `skills/living-plan/SKILL.md` so it authors and maintains living plans with the correct loop (`serve` / `wait` / `execution`).

## License

MIT
