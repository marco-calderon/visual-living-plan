# Changelog — 2026-11-07

## 2.12.2

**PR:** pending

**Bump:** patch

### Summary

The plan stays readable during a run and while the agent updates it, even when an edit leaves the plan file half written or not compiling.

### Bugs fixed

- An agent edit that was half written, empty, or did not compile replaced the plan with an error. The local service and `serve --cloud` now hold such an edit back until the file is fixed, so the page keeps the last good plan. `serve --cloud` prints `Plan not uploaded yet: <reason>`.
- A live plan whose newest source did not compile showed only an error. The page now keeps the last plan it rendered, or falls back to the newest saved version, with a short notice. Forms stay locked while the run is live.

### Improvements

- The local service waits for a burst of file writes to settle before it reads the plan.
- `check` also fails when the plan does not compile, with the same reason the page would show.

### Notes

No registry restart needed.
