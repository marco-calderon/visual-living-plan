# Changelog — 2026-10-28

## 0.6.0

**PR:** [#56](https://github.com/marco-calderon/visual-living-plan/pull/56)

**Bump:** minor

### Summary

An agent can mark a plan comment as reviewing, write the reply, and mark it answered. The open page already shows those states when the session fields are set.

### Improvements

- The live-plan skill tells an agent to run `addressing`, then `reply`, then `address` on every comment. `reply` alone does not change the status the page shows.

### New features

- `live-plan addressing <comment-id> --url <plan-url>` sets `addressingAt`. A part comment shows Addressing. A minibar message shows Working.
- `live-plan address <comment-id> --url <plan-url> [--outcome implemented|errored|issues]` sets `addressedAt`. A part comment says Addressed. A minibar message shows Implemented, Errored, or Had issues.

### Notes

No registry restart needed. The comment fields and the page were already in place.

## 0.7.0

**PR:** [#57](https://github.com/marco-calderon/visual-living-plan/pull/57)

**Bump:** minor

### Summary

`live-plan lan on` publishes the plan service on the local network. A fresh install stays on `127.0.0.1` until someone on that machine turns it on.

### New features

- `lan on` remembers the choice, listens on all interfaces, advertises `living-plan.local` at a private LAN address, and prints a LAN URL. `lan off` withdraws the advertisement, removes a firewall rule this tool added, and binds `127.0.0.1` again. `lan status` prints the bind, advertised name, LAN URL, and firewall result.
- Other devices open the printed LAN URL. That sets a cookie. Plan pages and plan APIs reject other non-loopback requests. Loopback stays open. The agent stream still requires its bearer token.
- The firewall change is best effort. A missing tool or a failed command prints the manual command, and the loopback service stays up.

### Notes

Installing this version does not turn LAN publishing on. `lan on` restarts the local service so the new bind takes effect. ADR 0016 stays accepted: `serve` and `review` still print `http://127.0.0.1:9477/plans/<id>/`, and the CLI does not resolve `*.local`.

## 0.7.1

**PR:** [#58](https://github.com/marco-calderon/visual-living-plan/pull/58)

**Bump:** patch

### Summary

A sample under `spikes/mdx-react` renders one MDX plan with React entries, a Pele diagram, a TanStack chart, and an ELK workflow. The live plan page and the CLI are unchanged.

### Bugs fixed

- Side-by-side columns in the sample plan keep a readable width. A narrow window wraps them instead of painting the panels on top of each other.

### New features

- The sample host stores the plan in SQLite and streams edits over one shared event connection. Restoring a snapshot updates the open plan without a reload.

### Notes

No registry restart needed. The sample is not part of the published package.

## 0.8.0

**PR:** [#60](https://github.com/marco-calderon/visual-living-plan/pull/60)

**Bump:** minor

### Summary

The plan you open is the MDX React page. Markdoc no longer draws it. The title bar, dashboard, comments, and approve / decline / message stay on that page.

### Improvements

- Plan entries render as React: phases, choices, forms, questions, approvals, checklists, callouts, Pele diagrams, TanStack charts, and an ELK workflow.
- The plan source is kept as snapshots. Restoring one writes that version back to the plan file and updates the open page.

### Notes

Loopback, LAN, and `addressing` / `reply` / `address` are unchanged. Parsing still reads the plan file for interactions and the workflow. No registry restart needed beyond the usual version check.

## 0.8.1

**PR:** [#63](https://github.com/marco-calderon/visual-living-plan/pull/63)

**Bump:** patch

### Summary

Workflow connectors meet the center of each step’s incoming and outgoing side, including a branch and a return.

### Bugs fixed

- Squared workflow lines follow the cards after layout and land on the center of each side, instead of riding the border between the ports.

### Notes

No registry restart needed.

## 1.0.0

**PR:** [#62](https://github.com/marco-calderon/visual-living-plan/pull/62)

**Bump:** major

### Summary

The plan page is a flat document, and a plan is authored as the MDX components that page renders. Markdoc tags and YAML entry fences no longer parse.

### Improvements

- The page, dashboard, and registry use the document palette in `DESIGN.md`: canvas background, surface cards with a hairline and 16px radius, pill buttons, and DM Sans. Light and dark stay. An accent color sets the settings swatch and does not tint the canvas or the cards.
- Agents author `<phase>`, `<choice>`, `<form>`, `<questions>`, `<approve>`, `<checklist>`, `<workflow>`, plus layout components and charts. A workflow graph stays a pipe table inside `<workflow>`. Wait JSON for choice, form, questions, and approve is unchanged.

### Notes

This breaks the plan schema. Plans written with `{% tags %}` or entry fences such as ` ```phase ` need to be rewritten as MDX. The title bar, dashboard, comments, and approve / decline / message stay. No registry restart needed beyond the usual version check.

## 1.0.1

**PR:** [#64](https://github.com/marco-calderon/visual-living-plan/pull/64)

**Bump:** patch

### Summary

Plan cards and stacked plan components sit apart by the documentation-card step on the existing space scale. Light and dark use the same spacing.

### Bugs fixed

- Phases, callouts, choices, forms, questions, approvals, checklists, and workflow sections no longer sit flush against the next card. The gap is 24px (`xl`), the documentation-card padding already on the space scale. Stacks and rows of those cards use that same step. Space inside a card uses `xs` through `lg` from that scale.

### Notes

The canvas, hairline cards, title bar, dashboard, popups, comments, and workflow connectors are unchanged. No registry restart needed beyond the usual version check.

## 1.0.2

**PR:** [#65](https://github.com/marco-calderon/visual-living-plan/pull/65)

**Bump:** patch

### Summary

The plan page compiles its MDX from the app itself. Markdoc is no longer installed with this package.

### Improvements

- Phases, choices, forms, questions, approvals, checklists, callouts, Pele diagrams, TanStack charts, and the ELK workflow render from the app. A plan is still the MDX components on that page.
- Headings, tables, source blocks, and mermaid figures in the bundle-less column keep their comment targets and in-page jumps.

### Notes

A workflow graph stays the pipe table inside `<workflow>`. `{% tags %}` and entry fences such as ` ```phase ` stay rejected. No registry restart needed beyond the usual version check.

## 1.1.0

**PR:** [#66](https://github.com/marco-calderon/visual-living-plan/pull/66)

**Bump:** minor

### Summary

A plan step shows its number in a square beside the title, colored for that step's state, and clicking the number or the title opens that step on the workflow diagram.

### Improvements

- The number sits in a square beside the title, with the status word under the title. The square is as tall as that title and status together, and just as wide. The numeral scales with the square. Done, active, and pending use the document success, accent, and muted colors. An active step shows the same spinner as a workflow diagram step.

### New features

- Clicking the step number or the step title switches to the workflow diagram and frames that step, zooming in when it is outside the view or too small to read. Back and forward restore the previous tab and scroll position.

### Notes

No registry restart needed. The title bar, dashboard, comments, and approve / decline / message stay. Agents working in this repo also have the Emil Kowalski skills under `.agents/skills`. That install does not change the plan page.
