# Changelog — 2026-11-11

## 2.21.0

**PR:** to be added when the PR opens

**Bump:** minor

### Summary

When Living Plan is installed as an app, `serve`, `review`, `dashboard`, and the terminal dashboard open pages in that app window. Without an install they open a browser tab, as before.

### New features

- The CLI finds a Living Plan app installed in Chrome, Edge, Brave, or Chromium for the page's host, and opens the plan or dashboard there. It checks every browser profile and prefers `Default`.
- The terminal dashboard's Open control does the same.
- `LIVE_PLAN_OPEN=browser` always opens a browser tab.

### Notes

`account login` still opens a browser tab, because sign-in returns to a loopback callback. Firefox and Safari web apps are not detected, so those open a tab. `--no-open` and `--open` work as before. No registry restart needed beyond the usual version check. The shell cache name is 2.21.0.
