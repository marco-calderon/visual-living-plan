# Changelog — 2026-11-07

## 2.12.2

**PR:** pending

**Bump:** patch

### Summary

The plan stays readable during a run, even when an agent edit leaves the plan file in a state the page cannot render.

### Bugs fixed

- A live plan whose newest edit did not compile showed only an error instead of the plan. The page now keeps the last plan it rendered, or falls back to the newest saved version, with a short notice. Forms stay locked while the run is live, and the next good edit replaces it.

### Notes

No registry restart needed.
