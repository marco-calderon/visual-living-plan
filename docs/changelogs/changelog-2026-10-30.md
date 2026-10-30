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
