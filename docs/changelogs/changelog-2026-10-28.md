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
