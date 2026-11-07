# Changelog — 2026-11-07

## 2.14.1

**PR:** pending

**Bump:** patch

### Summary

Live updates keep the reader's place and point at what changed. The Workflow tab keeps its zoom and follows the running step, and plan and workflow links work on the hosted page.

### Bugs fixed

- A live edit to the plan rebuilt the whole page, and on Safari the reader was sent back to the top. Unchanged blocks now stay, and the page returns the reader to the block they were reading.
- Every status change reset the Workflow tab's zoom. The view now stays where the person put it, also across tab switches, and pans to keep the running step on screen.
- On the hosted page, a step number on the plan did not open its workflow step, and a workflow step did not open its plan section. Both work now, with Back and Forward between them.
- A comment on a callout ran its title and body together ("Next: a commentYou picked"). Blocks are now separated by a space.

### Improvements

- A block an agent edit changed flashes briefly, so the reader sees what moved.

### Notes

Needs a Worker deploy for the hosted page. No registry restart needed.

## 2.14.0

**PR:** pending

**Bump:** minor

### Summary

The hosted plan limit now counts plans with an agent listening at the same time, not open plans, and each account gets a storage limit for saved plan versions: Free 50 MB, Pro 500 MB, Business 5 GB.

### Bugs fixed

- A plan deleted from the hosted dashboard kept its slot, so `serve --cloud` was refused with no visible plan to close. Hidden and idle plans no longer count.
- `events`, `watch`, `wait`, and `review` printed `Agent socket failed` when the host refused the connection. They now print the host's reason.

### Improvements

- The host checks the limit when an agent connects, and frees the slot when the agent stops, or within 3 minutes if the agent vanished.
- Settings → Usage shows Agents listening against the tier limit.
- Settings → Usage shows Stored against the storage limit. The meter turns amber from 80% and red when full. On a phone the cards stack with the design system's spacing.
- Deleting a plan from the hosted dashboard closes it and removes its saved versions, so it frees storage.

### New features

- Each account has a storage limit for saved plan versions. A publish that would pass it is refused with the limit and the current total.

### Notes

Needs a Worker deploy. No registry restart needed.

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
