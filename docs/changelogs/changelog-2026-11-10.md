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
