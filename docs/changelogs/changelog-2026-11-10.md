# Changelog — 2026-11-10

## 2.18.0

**PR:** [#175](https://github.com/marco-calderon/visual-living-plan/pull/175)

**Bump:** minor

### Summary

Dashboard search now runs as you type and finds plans by title as well as text, even with typos. Both dashboards show placeholders while plans load, keep the last numbers on screen while a new period loads, and show a spinner while a search runs.

### Improvements

- The plan table and the summary cards show placeholder rows and cards on the first load, instead of an empty table and a bare "Loading…".
- Switching between Today, Week, and Month keeps the last numbers on screen, dimmed, with "Loading this week…", until the new period arrives. The slide plays when the new rows are in.
- Refresh spins its icon and reads "Refreshing…" while it runs. Polling every 4 seconds still changes nothing on screen until it answers.
- A dashboard that cannot load shows "Could not read the dashboard." with a Try again button.
- An empty filter names what is missing, such as "No idle plans this week."
- While a search runs, the field's icon becomes a spinner. The first search shows placeholder results, and a later search keeps the last results dimmed until the new ones arrive. A failed search offers Try again.

### New features

- The dashboard search field searches while you type, from two characters, at most once every 300 ms. Each new search cancels the request it replaces. Enter still searches at once. The Search button is gone.
- Dashboard search is fuzzy: it also matches the start of a word ("limit" finds "limiting"), small typos ("reids" finds "Redis"), and words run together ("ratelimit" finds "Rate limiting"). Exact matches rank first, and the matched words are highlighted.
- Dashboard search matches plan titles. A title that holds every term lists the plan first, and terms in a title count toward each block of that plan, so "rate redis" finds the Redis sections of "Rate limiting rollout".
- Search still runs on the host: the local service for the local dashboard, the Worker for the hosted one. The search APIs take `fuzzy=on`. Without it they match exactly, as before.
- `live-plan search --fuzzy` turns on the same matching from the CLI. Without the flag the CLI matches exactly, as before.

### Notes

No plan format or storage changes, and no registry restart is needed. `SHELL_CACHE_VERSION` moves to 2.18.0 so the shell worker replaces the previous cache.

## 2.17.1

**PR:** [#173](https://github.com/marco-calderon/visual-living-plan/pull/173)

**Bump:** patch

### Summary

A new plan no longer shows an empty "label" step in its workflow. A header row or markdown table syntax in the `<workflow>` body is read as a table, not as steps.

### Bugs fixed

- A `<workflow>` body that started with the column header `id | label | ref | detail` drew an extra step named "label". The header row is now skipped, on the Workflow tab and in the diagram on the plan page.
- A markdown separator row (`---|---`) in the workflow body drew a "---" step. It is now skipped.
- Workflow lines written with outer pipes (`| design | Design | design |`) were dropped, so `check` could report a missing workflow. They now read as steps.
- A `from -> to` header line under `--` no longer adds an edge between steps that do not exist.

### Improvements

- The skill and primitives docs say to write one line per step and no header row.

### Notes

The plan page, the Workflow tab, the editor, and search now read the workflow body with one shared parser (`src/workflowSource.ts`). No registry restart needed.

## 2.17.0

**PR:** [#172](https://github.com/marco-calderon/visual-living-plan/pull/172)

**Bump:** minor

### Summary

Tables in a plan are easier to read without scrolling sideways. A pipe table wraps long cell text to fit the page column, and an agent can turn wrapping on for a whole data-table column or a whole data table.

### Bugs fixed

- A pipe table with long text in a cell no longer runs past the page column. Cell text wraps between words, in light and dark. Inline code, chips, and pills stay on one line, and a word is never split, so a table with long code or many columns still scrolls sideways.

### New features

- `<Column wrap>` wraps every cell in that data-table column. `<Column wrap="40%">` wraps them inside 40% of the table, the same as `<Cell wrap="40%">`.
- `<DataTable wrap>` wraps every column in the table.
- Under a column or table `wrap`, a cell with less than 20 characters of text stays on one line at its own width, so short columns such as a name or a state pill do not grow. `wrap={false}` on a column or a cell keeps it on one line. `<Cell wrap>` works as before.

### Notes

The live-plan skill, `primitives.md`, and the agent guidelines describe the new wrapping. `SHELL_CACHE_VERSION` moves to 2.17.0 so the shell worker replaces the previous cache. No registry restart needed beyond the usual version check.

## 2.16.2

**PR:** [#171](https://github.com/marco-calderon/visual-living-plan/pull/171)

**Bump:** patch

### Summary

Plan headings are white and step down in size from h1 to h6, on the page and in the editor. Tables in the editor read like the page's tables, and their add-row and add-column buttons match the + that adds a block.

### Bugs fixed

- Headings in the editor took the editor's own dark text color and were hard to read on the dark theme. They now use the ink color.
- An h1 was smaller than an h2, and h2/h3 used browser default sizes. h1 to h6 now follow the design scale: 32, 24, 20, 18, 16 and 14px.
- Table cells in the editor had dark text and bright white borders. They now use the ink color, the line border and a soft header row.

### Improvements

- A table's add-row and add-column buttons in the editor are slim bars with a +, like the bar that adds a block, and show when the table is hovered or focused.

## 2.16.1

**PR:** link once known

**Bump:** patch

### Summary

A plan page downloads about a third of the code it used to. The workflow layout engine, the diagram renderer, the charts, and the Workflow tab's canvas load only when the page uses them.

### Improvements

- A plan with no workflow, diagram, or chart downloads 382 KB of compressed code instead of 1,166 KB, and the browser parses 1.2 MB of JavaScript instead of 3.6 MB.
- The workflow, Mermaid diagram, and chart code is fetched only for a plan that has them, while the plan compiles, so the page still draws in one pass.
- The Workflow tab's canvas (React Flow and ELK, about 500 KB compressed) loads the first time the tab opens. It starts loading when the pointer or keyboard focus reaches the tab.

### Notes

Browser bundle only. No plan format, CLI, or Worker route changes. The hosted app still precaches every file for offline use, so the canvas and the deferred blocks open offline. `SHELL_CACHE_VERSION` moves to 2.16.1 so the shell worker replaces the previous cache. Most of the remaining plan page code is the MDX compiler (about 157 KB compressed), which compiles the plan in the browser.
