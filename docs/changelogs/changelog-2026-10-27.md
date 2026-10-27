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

## 0.4.1

**PR:** [#48](https://github.com/marco-calderon/visual-living-plan/pull/48)

**Bump:** patch

### Summary

The plan page background is theme-aware graph paper instead of the radial wash, with the quieter line opacity from the follow-up pass.

### Changes

- A 2px line every 100px and a 1px line every 20px, on the paper color.
- Lines follow the accent. Light mode uses 20.4% and 9.6%. Dark mode uses 15.6% and 7.2%, which is 60% of the first pass so the grid stays quiet in both schemes.
- Registry and dashboard pages keep their own washes.

### Notes

No registry restart needed.

## 0.4.2

**PR:** [#53](https://github.com/marco-calderon/visual-living-plan/pull/53)

**Bump:** patch

### Summary

The plan page has a solid top bar again. The title sits beside the logo, and the logo card opens and closes with the same motion as the Plans popup.

### Changes

- Restore the fixed bar: panel background, bottom border, blur, and the previous 3.75rem bar height.
- Show the plan title on the bar, immediately to the right of the logo, at the 1.45rem size the old bar used.
- Keep the logo card for the summary and icon status. Escape, a second click, and a click outside still close it.
- The card uses the Plans popup timing and motion: 280ms open, 240ms close, and the same 12px rise with a 0.96 scale. It scales from the logo side. Reduced motion still skips the animation.

### Notes

No registry restart needed.

## 0.4.3

**PR:** [#50](https://github.com/marco-calderon/visual-living-plan/pull/50)

**Bump:** patch

### Summary

The workflow card no longer names the canvas library or says that plan interactions are available. The diagram stays on the page.

### Changes

- Remove “Canvas · React Flow” from the workflow card.
- Remove “Plan interactions available” from the workflow card.

### Notes

No registry restart needed.

## 0.5.0

**PR:** [#51](https://github.com/marco-calderon/visual-living-plan/pull/51)

**Bump:** minor

### Summary

Plan entries are Markdoc tags. A callout can contain a choice, and existing YAML fences still render.

### Changes

- Author `phase`, `callout`, `choice`, `form`, `questions`, `approve`, `checklist`, and `workflow` as tags. The page still receives the same section HTML, part ids, and interaction JSON.
- `{% status %}` is an inline status chip. It is not its own section.
- Mermaid, code, and diff fences are unchanged. A YAML fence whose language is an entry type still opens.
- `skills/live-plan` tells agents to write tags. Wait responses keep the same JSON shapes.

### Notes

No registry restart needed. Open sessions written with YAML fences keep rendering.

## 0.5.1

**PR:** [#52](https://github.com/marco-calderon/visual-living-plan/pull/52)

**Bump:** patch

### Summary

Running plan cards no longer show a separate open button. The plan title still opens the site.

### Changes

- Remove the round external-open control from the bottom-right of each card in the Running plans panel.
- Leave the title, mode icon, folder, copy path, git line, and uptime pill in place.

### Notes

No registry restart needed. The title link is unchanged.
