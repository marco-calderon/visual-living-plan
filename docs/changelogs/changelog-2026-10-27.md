# Changelog — 2026-10-27

## 0.2.2

**PR:** [#45](https://github.com/marco-calderon/visual-living-plan/pull/45)

**Bump:** patch

### Summary

Contributor workflow for version bumps and changelogs, plus a clearer local global install path.

### Changes

- Add the `version-bump` project skill (`.cursor/skills/version-bump/`) with an in-skill changelog template; files land in `docs/changelogs/changelog-yyyy-mm-dd.md`.
- Point root `AGENTS.md` at that skill.
- Simplify `scripts/build-cli.mjs` into numbered steps and add `npm run install:global` (`build` then `npm install -g .`).

### Notes

No registry restart needed.

## 0.3.0

**PR:** [#46](https://github.com/marco-calderon/visual-living-plan/pull/46)

**Bump:** minor

### Summary

Workflow diagrams are laid out with ELK.js. Connectors are squared and orthogonal instead of the previous curved Dagre paths.

### Changes

- Layered left-to-right placement for chains, fan-in, and wide rows.
- Squared orthogonal edge paths.
- Fan-in and return rails still separate overlapping edges.

### Notes

No registry restart needed.

## 0.4.0

**PR:** [#47](https://github.com/marco-calderon/visual-living-plan/pull/47)

**Bump:** minor

### Summary

Plan title, summary, and status open from the logo. The fixed header is gone, so the page starts under the floating tabs.

### Changes

- Click the logo to open a card with the title, summary, and icon status row. Click again, click outside, or press Escape to close it. The logo shows an accent ring while the card is open.
- A pending count above zero is an amber badge on the logo and an inbox icon in the card. A count of zero stays off the row.
- Plan, Workflow, and Settings stay icon tabs in the top-right, next to the Plans switcher.

### Notes

No registry restart needed.
