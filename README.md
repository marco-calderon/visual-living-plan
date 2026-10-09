# Visual Living Plan

Agent-authored visual plans for human interaction — closer to [Visual Plan](https://visualplan.dev/) than to a workflow builder.

The agent owns a `.plan.md` file. Humans open a browser URL to:

- see live status as phases update
- answer choices, forms, questions, and approval gates
- follow a **workflow diagram** (React Flow) that shows the expected execution plan before the run starts, then tracks the live run while plan forms are locked

Works for local agents (file + localhost URL) and is shaped so a cloud agent can host the same server and share the URL.

## Quick start

```bash
npm install
npx living-plan serve examples/rate-limit.plan.md --port 9410
```

`npm install` builds the `living-plan` and `visual-living-plan` commands. Open `http://127.0.0.1:9410`. Edit the example file, change a phase `status`, and the page reloads. Click a choice or submit a form to send structured feedback to the agent.

The same server is what the npm scripts call (`npm run serve`, `npm run review`, `npm run wait`, `npm run execution`, `npm run check`).

### Install the command

From a clone:

```bash
npm install -g .
living-plan --help
```

Without cloning, and without publishing to the npm registry, npm can build the command from GitHub.

One shot:

```bash
npx --package github:marco-calderon/visual-living-plan living-plan serve ./my.plan.md --port 9410
```

Install it on your PATH:

```bash
npm pack github:marco-calderon/visual-living-plan
npm install -g visual-living-plan-0.1.0.tgz
living-plan --help
living-plan check "$(npm root -g)/visual-living-plan/examples/rate-limit.plan.md"
```

`check` prints the expected workflow (the `workflow` block, or phases and gates when that block is omitted). `serve` and `review` draw that diagram on the Workflow tab before a run starts. Pass `--no-open` when a browser should not launch.

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

### Workflow canvas

The page has **Plan** and **Workflow** tabs. The Workflow tab is filled from the plan itself — a `workflow` block, or the phases and gates when that block is omitted — so the expected execution plan is visible before the agent starts the run. Select a step to jump to the matching section in the plan. A plan with neither a workflow nor phases shows the sample retry loop from `examples/execution-graph.json` until a graph arrives.

While execution is active, Plan forms/gates are disabled. The same Workflow tab then overlays the live [React Flow](https://reactflow.dev) graph the agent pushes. Node ids that match the plan keep their plan reference.

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

React Flow draws cycles between different nodes. A self-loop (`from` and `to` are the same id) uses a custom arc, because the built-in edge paths collapse onto the node. A separate card can close a loop instead: give the return edge `fromSide` and `toSide` (`top`, `right`, `bottom`, or `left`) so it does not sit on the forward path. Optional edge `label` is drawn on the arc or the return edge. `examples/execution-graph.json` closes one loop with a Retry step: `tests → retry → implement`.

## Why this exists

Visual builders optimize for humans drawing graphs. Living Plan optimizes for **agents communicating**:

| Need | Mechanism |
|------|-----------|
| Show current status | `phase` blocks + file watch reload |
| Ask for direction | `choice`, `form`, `questions`, `approve` |
| Converge on a plan | review bar + iteration diffs |
| Show the expected execution plan | `workflow` block, drawn on the Workflow tab before the run |
| Show live execution | Same Workflow tab, React Flow canvas via `/api/execution` |
| Local + cloud | same file + HTTP server URL |

## Plan vocabulary

See `examples/rate-limit.plan.md` and `skills/living-plan/SKILL.md`.

YAML fenced blocks:

- `phase` — status timeline
- `callout` — note / tip / risk / decision / warning
- `choice` / `form` / `questions` / `approve` — human interactions
- `checklist` — definition of done
- `workflow` — expected execution diagram (`nodes` with `id`, `label`, `ref`, optional `status` / `x` / `y`, and `edges` with `from` / `to`, optional `label`, `fromSide`, `toSide`). `ref` is the plan block id a click jumps to. Omit the block and the diagram follows phases and gates in document order.

## Execution canvas adapters

Execution rendering goes through a small port/adapter layer:

- `client/execution-canvas/port.ts` — adapter contract
- `client/execution-canvas/toCanvasModel.ts` — maps `ExecutionState` → portable model
- `client/execution-canvas/adapters/reactFlow/` — current React Flow adapter
- `client/execution-canvas/registry.ts` — set `ACTIVE_EXECUTION_CANVAS_ADAPTER_ID`

To swap libraries later, add another adapter and change the active id. Keep agent payloads on `graph` so the API stays stable.

## API

- `GET /` — interactive HTML page (Plan + Workflow tabs)
- `GET /api/plan` — plan metadata, responses, pending interaction ids, execution state, and `planned` workflow graph
- `GET /api/execution` — current execution canvas state, including `planned` (the expected workflow from the plan) even while execution is idle
- `PUT /api/execution` — set execution state (`active`, `step`, `detail`, `graph`, `scene`)
- `POST /api/execution/start` / `POST /api/execution/stop` — convenience toggles
- `GET /api/events` — SSE (`reload`, `interaction`, `review`, `execution`)
- `POST /api/interactions/:id` — submit an interaction response (409 while execution is live)
- `POST /api/review` — submit Approve / Deny / Iterate (review mode)

## Agent skill

Install or point your coding agent at `skills/living-plan/SKILL.md` so it authors and maintains living plans with the correct loop (`serve` / `wait` / `execution`). Put a `workflow` block in the plan when the human should see the expected execution path before the run starts.

## License

MIT
