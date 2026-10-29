# Changelog — 2026-10-29

## 1.2.0

**PR:** [#67](https://github.com/marco-calderon/visual-living-plan/pull/67)

**Bump:** minor

### Summary

Settings offers three document widths — Narrow, Default, and Wide — and Plan, Workflow, and Settings share that column. The choice is saved with the accent in the theme config.

### New features

- Narrow is 560px, default is 720px, and wide is 1120px. A saved full-width setting opens as wide. The value is stored as `theme.pageWidth`.

### Notes

No registry restart needed.

## 1.2.1

**PR:** [#68](https://github.com/marco-calderon/visual-living-plan/pull/68)

**Bump:** patch

### Summary

Plan pages, the dashboard, and the registry use short, interruptible motion. The document layout, light and dark themes, and the three page widths stay.

### Improvements

- The logo card and the Plans popup scale up from their buttons and reverse if you close them while they are still opening. Comment popovers scale from the comment button.
- The dashboard and the registry fade in with a small rise. Changing the dashboard period is a short move. Filtering fades the rows in place.
- Buttons press in slightly. Plan sections fade in. The review bar rises a short distance. Dragging a plan highlight follows the pointer.
- Framing a workflow step takes 200ms and is skipped when reduced motion is on.
- The live indicator and the active phase pulse with opacity. Spinners still spin the same way.
- Reduced motion keeps the fades and drops the slides and scales.

### Notes

No registry restart needed beyond the usual version check. Version 1.2.0 is the three page widths: narrow 560px, default 720px, and wide 1120px.

## 1.2.2

**PR:** [#70](https://github.com/marco-calderon/visual-living-plan/pull/70)

**Bump:** patch

### Summary

Plan popups, the form dropdown, the settings disclosure, and save notices use the same overlay components as the comment popover. Page widths, motion, and the step number stay.

### Improvements

- The Plans list and the plan-details card open as popovers anchored to their buttons. Escape and a click outside still close them. They still scale up from the button.
- A form select opens a list of options instead of the browser's native menu. The submitted value is unchanged.
- The diff-theme section opens and closes as a collapsible disclosure. Accent, width, and diff-theme saves show a toast at the top left.

### Notes

No registry restart needed.

## 1.3.0

**PR:** [#71](https://github.com/marco-calderon/visual-living-plan/pull/71)

**Bump:** minor

### Summary

Forms can ask for several checkboxes. Checked values are saved with the plan session and come back after a refresh or a service restart.

### New features

- A `checkbox` field renders one box per option. Submitting the form stores the checked options as an array of strings. A field with no options is one box, saved as `"true"` or `"false"`.
- The field works inside a form and inside layout or other plan components that compose that form. The checklist block is unchanged: its done flags stay in the plan file.

### Notes

No registry restart needed beyond the usual version check.

## 1.3.1

**PR:** [#72](https://github.com/marco-calderon/visual-living-plan/pull/72)

**Bump:** patch

### Summary

Open questions show the number and the question on the same line. The answer field stays underneath.

### Bugs fixed

- In a questions block, the number (1., 2.) and the question text render on one line in light and dark. A question written as a paragraph no longer drops below its number.

### Notes

No registry restart needed beyond the usual version check.
