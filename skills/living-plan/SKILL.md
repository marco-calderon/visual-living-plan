---
name: living-plan
description: Author and maintain a Living Plan markdown file so humans can see agent status and answer interactions in a browser.
---

# Living Plan

Use a single `.plan.md` file as the visual channel between you and the human.

## When to use

- You need to show current status as structured phases, not chat walls.
- You need a human choice, approval, form values, or answers before continuing.
- Local or cloud: keep the file updated; the human watches a URL from `living-plan serve` or `living-plan review`.

## Commands

```bash
# Live status URL (hot-reloads when you edit the file)
npm run serve -- path/to/plan.plan.md --port 9410

# Blocking review gate (Approve / Deny / Iterate)
npm run review -- path/to/plan.plan.md --iteration 1

# Wait for one interaction on a running server
npm run wait -- fail-mode --url http://127.0.0.1:9410

# Live execution canvas (locks Plan tab forms while active)
npm run execution -- start --url http://127.0.0.1:9410 \
  --step "Implement middleware" --detail "Editing gateway.ts" \
  --graph examples/execution-graph.json
npm run execution -- push --url http://127.0.0.1:9410 \
  --step "Add tests" --graph path/to/updated-graph.json
npm run execution -- stop --url http://127.0.0.1:9410
```

Exit codes for `review`: `0` approve, `1` deny, `2` iterate, `3` timeout.

The UI has two tabs:
- **Plan** — authored `.plan.md` status and interactions. Forms/gates disable while execution is live.
- **Execution** — readonly React Flow canvas updated live via `/api/execution` (prefer portable `graph` JSON; optional adapter-specific `scene`). The canvas library is swappable via `client/execution-canvas/registry.ts`.

## File format

Optional YAML frontmatter, then markdown plus fenced blocks:

- `phase` — status timeline (`pending` | `active` | `blocked` | `done` | `failed`)
- `callout` — `note` | `tip` | `risk` | `decision` | `warning`
- `choice` — mutually exclusive options (human picks one)
- `form` — structured fields (`text` | `number` | `textarea` | `select`)
- `questions` — open answers
- `approve` — approve/deny gate with optional note
- `checklist` — definition of done

Every interactive block needs a stable `id`. Do not rename ids mid-run or the human response may not match.

## Agent loop

1. Create or update the `.plan.md` file with current phases and any needed interactions.
2. Start or reuse `serve` for continuous status, or `review` when you need an overall verdict.
3. If you need a specific answer before continuing, `wait <id> --url ...` (or poll `GET /api/plan`).
4. Apply the human response, update phase statuses / checklist items in the same file, and keep going.
5. On review `iterate`, revise the plan in place, bump `--iteration`, and open review again.

## Authoring rules

- One composition: title, short summary, phases, then only the interactions that matter now.
- Prefer updating the existing file over creating many plan files.
- Mark exactly one phase `active` when work is underway.
- Add interaction blocks only when you truly need human direction.
- After answers arrive, remove or leave them answered; add new blocks for new decisions.
