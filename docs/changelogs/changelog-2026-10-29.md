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

## 1.4.0

**PR:** [#73](https://github.com/marco-calderon/visual-living-plan/pull/73)

**Bump:** minor

### Summary

Checkbox fields use the animated check control. A form of checkboxes or steppers saves as you change it. A text form keeps Submit on the right, then Edit, and submitting again replaces the saved answer.

### New features

- A checkbox uses the animated check control in light and dark. A group still saves the checked options as an array. One box still saves `"true"` or `"false"`.
- A form made only of checkbox and stepper fields posts on each toggle or step. There is no separate Submit button. The same interaction is replaced in the session and restored after a refresh.
- A stepper field is a number with decrease and increase buttons.
- A checkbox list can sit in a row of cards, including inside a callout or stack. The card title is the prompt, with a checked count. See `examples/form-controls.plan.md`.
- A text form keeps Submit on the right. After submit, Edit unlocks the fields and submitting again replaces the stored response.

### Notes

No registry restart needed beyond the usual version check.

## 1.4.1

**PR:** [#77](https://github.com/marco-calderon/visual-living-plan/pull/77)

**Bump:** patch

### Summary

Pipe tables in a plan render as tables again. Cell text still renders as markdown.

### Bugs fixed

- A pipe table in the plan, a phase, or a callout is a table again. Inline code, bold, and links inside a cell still render. Column alignment from the separator row is unchanged.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.0

**PR:** [#74](https://github.com/marco-calderon/visual-living-plan/pull/74)

**Bump:** minor

### Summary

A plan can include a data table that searches, sorts, and filters its rows on the page. Pagination shows when that table has 100 or more rows.

### New features

- `<DataTable>` searches the loaded rows, sorts every column, and filters one state column with a select. Pagination appears at 100 rows, ten per page, and stays off below that.
- A cell can hold a chip, a pill, a list, the checkbox control, a checkbox field, and other plan components.
- `<Chip>` and `<Pill>` are plan primitives. They render in a phase or a callout, and inside a data table cell.
- The table code loads only on a plan that contains a data table.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.1

**PR:** [#75](https://github.com/marco-calderon/visual-living-plan/pull/75)

**Bump:** patch

### Summary

A choice asks for one option with a radio choice card. Multi-select checkboxes and the rest of the page stay as they are. The selected option is saved with the session and comes back after a refresh.

### Improvements

- Each option in a choice is a radio card: the label, the description, and a radio, in light and dark. Choosing one posts the same choice response.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.2

**PR:** [#76](https://github.com/marco-calderon/visual-living-plan/pull/76)

**Bump:** patch

### Summary

Plan cards sit closer together. Type, buttons, and form controls stay the same size.

### Improvements

- A plan card pads 16px, and the cards sit 16px apart. A card inside another card pads 12px. A row gaps 12px. The column starts 16px under the titlebar. Code blocks pad 12px by 16px.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.3

**PR:** [#78](https://github.com/marco-calderon/visual-living-plan/pull/78)

**Bump:** patch

### Summary

Single-select choice cards use the same corner radius as other plan cards, in light and dark.

### Bugs fixed

- A choice option stays a rectangle with the 16px card radius. It is no longer a fully rounded pill.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.4

**PR:** [#79](https://github.com/marco-calderon/visual-living-plan/pull/79)

**Bump:** patch

### Summary

A Done when checklist shows a filled check for a finished line and an empty ring for a line still to do. The line text stays.

### Improvements

- Done and to-do are icons, in light and dark. A filled disk with a check is done. An empty ring is not done. The words DONE and TODO are no longer shown beside the line.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.5

**PR:** [#80](https://github.com/marco-calderon/visual-living-plan/pull/80)

**Bump:** patch

### Summary

Settings offers Default, Wide, and Full for the document column. Cards, prose, and code stay inside that column. A table scrolls sideways when its columns do not fit.

### Bugs fixed

- At the default width, a table header, prose, and code chips stay in the column. The table scrolls sideways instead of clipping, and cell text stays the same size.

### Improvements

- Page width is Default (720px), Wide (1120px), and Full. Full uses the available width. Narrow is gone; a saved narrow width opens as default. A saved full-width flag still opens as wide. Plan, Workflow, and Settings share the column.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.6

**PR:** [#81](https://github.com/marco-calderon/visual-living-plan/pull/81)

**Bump:** patch

### Summary

The plan page no longer lists snapshots. The description card shows the current file version, and it opens when you hover the logo as well as when you click it.

### Improvements

- The Snapshots section is gone. The layers marker in the description card shows the file version, such as v1. It does not edit or restore a snapshot.
- The description card opens on hover over the logo, in light and dark. Click still opens it, and a second click closes it.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.7

**PR:** [#82](https://github.com/marco-calderon/visual-living-plan/pull/82)

**Bump:** patch

### Summary

The plan has a table of contents on the left. It lists the plan’s sections and the Workflow page, and it stays put while the page scrolls. Default, Wide, and Full still size only the plan column.

### New features

- On a wide window the contents sit in the gutter beside the column. On a small window they are hidden, and a floating button opens them as a sidebar. Neither the list nor the button changes the column width.
- A section link scrolls to that part of the plan. A Workflow link opens the Workflow page, and a workflow step link opens that step. Each of those is a Back/Forward step, the same history as the other plan jumps. Light and dark use the document colors.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.8

**PR:** [#83](https://github.com/marco-calderon/visual-living-plan/pull/83)

**Bump:** patch

### Summary

Settings can turn wrapping on or off for text in code blocks. The choice is saved with the accent, page width, and diff theme.

### New features

- A switch in Settings wraps long lines inside code blocks, in light and dark. Off, those lines scroll sideways. The value is stored as `theme.wrapCode`.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.9

**PR:** [#84](https://github.com/marco-calderon/visual-living-plan/pull/84)

**Bump:** patch

### Summary

The table of contents marks each row with the kind of plan entry it points at. A step’s mark follows that step’s progress.

### Improvements

- Phases show an open circle, a progress ring, a check, a pause, or an x for pending, active, done, blocked, and failed. The same mark is used on the workflow step that points at that phase, and it updates when the phase or the live run changes.
- Choices, forms, questions, approvals, checklists, callouts, and Workflow use their own colored marks in light and dark. Headings stay unmarked.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.10

**PR:** [#85](https://github.com/marco-calderon/visual-living-plan/pull/85)

**Bump:** patch

### Summary

Comments on a plan part, and messages sent to the agent, are shown as chat threads. The part popup stays compact. The messages tray uses the full chat size.

### Improvements

- The comment popup header sits above a dividing line, and its title and description are 2px smaller. Each comment is a short chat: your note on the right, the agent reply as plain text on the left, and a pending, addressing, or addressed status.
- The messages tray is a full-size chat. Your notes sit in bubbles, the agent reply is the message text, and the status reads pending, working, implemented, errored, or had issues.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.11

**PR:** [#86](https://github.com/marco-calderon/visual-living-plan/pull/86)

**Bump:** patch

### Summary

The comment popup composer uses a shared textarea and a full-width send button, in the same light and dark document as the rest of the plan.

### Improvements

- The message field is a rounded textarea with a hairline border, canvas fill, and a visible resize handle. Its type size matches the comments in that popup. Placeholder copy reads “Type your message here.”
- Send is a full-width pill. It is black on a light page and light on a dark page. Inside the button, under the label, a keyboard hint shows that Command+Enter, or Control+Enter, sends. Enter is a return icon.
- A comment’s state is an icon. Pending is an open circle, addressing is the progress ring, and addressed is a check. Mark addressed stays a text action. A minibar message that is still pending uses the same open circle.

### Notes

No registry restart needed beyond the usual version check.

