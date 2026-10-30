# Changelog — 2026-10-30

## 1.5.11

**PR:** [#87](https://github.com/marco-calderon/visual-living-plan/pull/87)

**Bump:** patch

### Summary

Contents icons sit in a small rounded square. Each square keeps the color that entry already uses.

### Improvements

- Each known contents icon is a 12px glyph in an 18px square with a 6px corner. The square is a light wash of that icon’s color, with a stronger edge. Pending, notes, checklists, and Workflow use a hairline square on the canvas. A heading has no square, and its text lines up with the labeled rows.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.12

**PR:** [#88](https://github.com/marco-calderon/visual-living-plan/pull/88)

**Bump:** patch

### Summary

The live-plan skill describes the primitives and page controls a plan author can use now. `npm run skills:install` copies this repo's skills into `~/.agents/skills`.

### Improvements

- The live-plan skill and `skills/live-plan/primitives.md` cover the data table, Chip, Pill, checkbox fields, autosubmit forms, choice cards, markdown tables, checklist state icons, Default / Wide / Full page widths, the file version on the description card, the sticky contents list, and the code-wrap setting.
- `npm run skills:install` copies `skills/live-plan`, `skills/living-plan`, and `.cursor/skills/version-bump` into `~/.agents/skills`. Running it again replaces those copies and leaves any other skills in that folder in place.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.13

**PR:** [#89](https://github.com/marco-calderon/visual-living-plan/pull/89)

**Bump:** patch

### Summary

The Plan, Workflow, and Settings switch is the same height as the Plans button.

### Improvements

- The page switch matches the Plans button height in light and dark. The icons stay the same size, and the Plans button is unchanged.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.14

**PR:** [#90](https://github.com/marco-calderon/visual-living-plan/pull/90)

**Bump:** patch

### Summary

Plan, Workflow, and Settings all sit inside the page switch, and choosing one is a Back and Forward step.

### Bugs fixed

- The settings tab was clipped, and the workflow icon sat outside the page switch. The switch wraps Plan, Workflow, and Settings again, at the same height as the Plans button.

### Improvements

- Choosing Plan, Workflow, or Settings adds a history step. Back and Forward return to the previous tab and scroll position, the same way a plan jump does.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.15

**PR:** [#91](https://github.com/marco-calderon/visual-living-plan/pull/91)

**Bump:** patch

### Summary

A data-table cell can wrap onto more than one line, or wrap inside a percentage of the table. Cells without that stay on one line.

### New features

- `<Cell wrap>` breaks that cell onto more than one line. `<Cell wrap="40%">` or `<Cell wrap={40}>` wraps it inside 40% of the table, and the column header wraps inside that share. A cell without `wrap` stays on one line, and the table still scrolls sideways when those columns do not fit.

### Notes

No registry restart needed beyond the usual version check.

## 1.6.0

**PR:** [#93](https://github.com/marco-calderon/visual-living-plan/pull/93)

**Bump:** minor

### Summary

`serve` and `review` can host a plan on a signed-in Worker. The local machine service stays the default.

### New features

- `live-plan account login --url https://host` stores an account session in `~/.config/living-plan/cloud.json`. `LIVE_PLAN_CLOUD_URL` supplies the host when `--url` is omitted.
- `serve --cloud` and `review --cloud` register the plan, write `cloudId` into the frontmatter, and print an https URL. They do not start the local registry. `events`, `wait`, `watch`, `mode`, `execution`, `addressing`, `reply`, `address`, and `close` use that URL. `dashboard`, `tui`, `logs`, and `lan` stay on this machine.

### Notes

No registry restart needed beyond the usual version check. Deploying the Worker is a separate step, described in `cloud/README.md`.

## 1.6.2

**PR:** [#94](https://github.com/marco-calderon/visual-living-plan/pull/94)

**Bump:** patch

### Summary

After you sign in on the hosted service, the browser lands on a signed-in page instead of a missing `/review` page.

### Bugs fixed

- Signing in sent the browser to `/`, and a saved redirect from the previous site on that hostname continued to `/review`. Both addresses now show that the account is signed in and that the plan URL comes from `serve --cloud`.

### Notes

Redeploy the Worker from `cloud/` for this page to show on the host. No registry restart needed beyond the usual version check.

## 1.5.16

**PR:**

**Bump:** patch

### Summary

Search and sort on a data table stay off until a column turns them on. Cells, wrap, the state filter, and sideways scroll are unchanged.

### New features

- `<Column search>` includes that column in the search field. The field is hidden when no column sets `search`. `<Column sort>` adds a header button for that column. Other headers stay plain.

### Notes

No registry restart needed beyond the usual version check.
