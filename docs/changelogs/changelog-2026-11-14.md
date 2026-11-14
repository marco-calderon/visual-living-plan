# Changelog — 2026-11-14

## 2.27.1

**PR:** link once known

**Bump:** patch

### Summary

In the editor, a choice's options, a form's fields, and a checklist's lines no longer touch: each framed row has room above it, as options do on the page.

### Bugs fixed

- Editing a choice, a form, or a checklist stacked its option, field, or item cards with no space between them. They are now 8px apart.

### Notes

`SHELL_CACHE_VERSION` moves to 2.27.1. No service restart needed.

## 2.27.0

**PR:** [#193](https://github.com/marco-calderon/visual-living-plan/pull/193)

**Bump:** minor

### Summary

Text on a plan page is edited as it reads: a click puts the caret where you clicked, with no Edit button and no frame. Cards, choices, endpoints, diagrams, code, and tables keep their Edit button.

### Bugs fixed

- The Edit button no longer disappears when the pointer moves to it and back onto its block.
- Ctrl or Cmd+Enter no longer splits the line at the caret before it keeps an edit.

### Improvements

- Paragraphs, headings, lists, and quotes show no Edit button. Text inside a phase shows the phase's Edit.
- A data table cell opens the table's editor with the caret in that cell.

### New features

- A click on text opens it in place, in its own font and spacing, with the caret where the click landed. A click elsewhere, Ctrl or Cmd+Enter, or Escape keeps the change; Escape with nothing typed closes it. A click on other text keeps the open edit and opens that text.
- A pipe table cell is edited in its cell. Enter keeps it, and only that cell's text changes in the file, with its pipes escaped.

### Notes

No registry restart needed.
