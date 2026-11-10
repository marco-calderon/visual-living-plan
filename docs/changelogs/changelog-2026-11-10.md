# Changelog — 2026-11-10

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

## 2.17.0

**PR:** link once known

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
