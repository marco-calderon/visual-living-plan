# Changelog — 2026-11-05

## 2.4.0

**PR:** pending

**Bump:** minor

### Summary

Stopping and resuming an agent no longer opens the plan page again. `serve` and `review` open a plan page only the first time, and the tab the person already has keeps following the plan.

### Improvements

- `serve` and `review` remember which plan pages this machine has opened, in `~/.config/living-plan/opened-pages.json`. A later `serve` or `review` of the same plan prints `Page already opened before` and leaves the browser alone.
- The `live-plan` skill and the agent guidelines tell agents to pass `--no-open` when they resume a plan, and not to reopen the page to show a change.

### New features

- `--open` on `serve` and `review` opens the page again even when it was opened before.

### Notes

`--no-open` still never opens a browser. `dashboard` and `account login` open their page every time, as before. No registry restart needed.
