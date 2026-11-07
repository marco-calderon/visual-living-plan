# Changelog — 2026-11-07

## 2.13.1

**PR:** [#164](https://github.com/marco-calderon/visual-living-plan/pull/164)

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

## 2.13.0

**PR:** [#165](https://github.com/marco-calderon/visual-living-plan/pull/165)

**Bump:** minor

### Summary

`live-plan search` finds terms in a plan, block by block, on the local service and on the cloud host, and both dashboards gain a search field that looks across every listed plan. Both search live text by default and saved versions only when you ask.

### New features

- `live-plan search --url <plan-url> --query TERMS` lists each matching block with its id, type, file line, and a snippet. Repeat `--query` for more terms, and use `"double quotes"` for a phrase. It exits `0` with hits and `2` with none.
- `live-plan search --query TERMS` without `--url` searches every plan on this machine's service, and `--cloud` searches every plan on your hosted account. Each plan is listed with its link, then its matches.
- Every term must be in the same block. `--any` returns blocks with at least one term, ranked by how many matched.
- `--version N` searches one saved version, and `--version all` searches the live plan and every saved version. A saved version that matches the live plan is not listed twice. `--json` prints the full response.
- Both dashboards have a search field above the plan table. It searches every listed plan's live text, or saved versions too with **Include saved versions**, and **Match any term** relaxes the match. Each result links to the plan page, or the saved version on the host, at the matching block. On the hosted dashboard the field is off while offline.
- `GET /api/search?q=...&version=live|N|all&match=all|any` on a plan URL answers on both hosts with the same JSON. On the host, the owner and the plan bearer search every saved version, and a viewer searches the live plan only.

### Bugs fixed

- The cloud host now passes a request's query string through to the plan.
- The dashboard's plan section no longer grows wider than a phone screen when its filter tabs do not fit.

### Notes

No registry restart needed beyond the usual version check. The host keeps the latest 10 versions, so an older version number returns 404.
