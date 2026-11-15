# Changelog — 2026-11-14

## 2.28.0

**PR:** [#196](https://github.com/marco-calderon/visual-living-plan/pull/196)

**Bump:** minor

### Summary

A click on a card's title or on the text inside a card now puts the caret there and edits it where it reads, as paragraphs and headings already did. No Edit button is needed for text. Enter makes a new block and moves the caret into it, and blocks can be dragged while one is being edited.

### Bugs fixed

- A click on a phase's title jumped to the Workflow tab instead of editing it. Where the plan can be edited, the title now takes the caret; the step number still jumps to the workflow.
- A click on the text inside a callout, an update, a tab, a compare pane, a box, an approval, or a choice did nothing. It now opens that text in place, in its own font and spacing.
- Text near the end of a plan scrolled to the bottom no longer jumps up when it opens for editing.
- Enter in text no longer adds a second paragraph inside the same editor with wider spacing that jumped when the edit closed.
- A block being edited, and every other block, can be dragged by its grip; the grip used to disappear while an editor was open.
- The Move menu a grip opens no longer closes when the pointer moves onto the block's text or another block; it closes on a click outside it.
- The bar of unapplied changes no longer disappears while a block is being edited. Apply changes keeps the open block's edit and applies it with the rest; Discard drops it.
- Paragraphs inside a card in its editor (an update, a callout) are spaced as paragraphs on the page instead of touching.
- Hovering text inside a phase showed the phase's Edit and +, so + added a block after the whole phase and Edit opened the phase. The text now shows + alone, which adds a block right below it inside the phase. The phase's own Edit is on its title row.
- A block open in its editor showed two grips; it shows one.
- Typing after / to filter the block menu no longer makes the menu look like it closed and opened again on each key.
- With a card open in its editor, a click or tap on another block did nothing: the editor kept the focus. It now keeps the edit, closes, and the focus goes where you pressed: that text opens, or that card shows its Edit. A press on the page's margin or the toolbar still leaves the editor open.
- On an iPad or a phone, a tap on a card's text or title opened the text and never showed the card's Edit. The first tap on a card now shows its Edit, over its top right corner; the next tap on its text or title edits it. Taps with a pen count too, and a tap outside open text keeps the edit in Safari.

### Improvements

- Enter in a paragraph or a heading makes a new block: the text after the caret becomes the next block and the caret moves to its start. Enter at the end opens an empty block below. The page keeps its spacing throughout, and nothing moves when the edit closes.
- Pressing a grip while a block is open keeps what was typed, then moves the block. Move up and Move down work the same way.
- Backspace in an empty block removes it and puts the caret at the end of the block above, or at the start of the block below when it was the first. It used to do nothing.

### New features

- The grip's menu has Delete. It asks once, then takes the block out as a change waiting to be applied. Locked blocks keep their place.
- The / menu adds chips and pills inside the text: a Labels section with Chip and Pill. The caret goes right after the label, so you keep typing the sentence.
- Titles are edited where they read: phases, callouts, checklists, choices, forms, questions, approvals, and the workflow. Enter or a click elsewhere keeps the change; Escape with nothing typed closes it. Only the title's text changes in the file, and a phase's step number stays as written.

### Notes

Locked cards, and forms and questions (locked by default), keep their text and titles as written. `SHELL_CACHE_VERSION` moves to 2.28.0. No registry restart needed.

## 2.27.2

**PR:** [#195](https://github.com/marco-calderon/visual-living-plan/pull/195)

**Bump:** patch

### Summary

Every block on a plan page can be reordered again, without opening an editor: drag the grip beside it, or click the grip for Move up and Move down.

### Bugs fixed

- Since 2.26.0 blocks could be reordered only inside an open block's editor, so most of the page could not be reordered. Text, cards, choices, forms, endpoints, diagrams, code, tables, layout blocks, phases, and the blocks inside a phase now each show a grip on the left.

### Improvements

- Drag a grip to move the block before or after another one, at the top level or inside a phase. A line shows where it will go, and the page scrolls near the window's edges. Escape cancels.
- Click or tap a grip for Move up and Move down; the menu stays open on the block as it moves. Alt+Up and Alt+Down move the block with focus.
- A move is kept on this device with your other unapplied changes, and Apply changes saves it. Only the moved block's place in the file changes, and moving it back leaves nothing to apply.
- The parts of a component (a file tree's rows, a choice's options, a diagram's nodes) keep their order on the page; edit the component to change them. Blocks inside a locked block keep their order too. A locked block itself can move.

### Notes

No registry restart needed.

## 2.27.1

**PR:** [#194](https://github.com/marco-calderon/visual-living-plan/pull/194)

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
