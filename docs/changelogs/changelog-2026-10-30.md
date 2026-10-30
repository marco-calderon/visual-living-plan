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
