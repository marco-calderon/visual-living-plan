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
