# Changelog — 2026-11-16

## 2.30.0

**PR:** [#198](https://github.com/marco-calderon/visual-living-plan/pull/198)

**Bump:** minor

### Summary

Adding and editing blocks feels like writing on the page. + sits under every block and opens an empty line right there, and a card's Edit opens only the card's own editor: no frame, no Remove, Cancel, or Done. Changes count as changes to apply as you make them, and Apply changes saves them.

### Bugs fixed

- A click on text no longer blinks: the text stayed blank, behind a blue box, for a frame while its editor loaded. The page now keeps drawing the text until the editor's own text is in.
- Escape in a card's field closed nothing. It now closes an untouched card's editor, and keeps the change in one that was edited.
- Edit on a code block or a diagram put the caret on its language picker, so typing went nowhere. The caret now goes into the code.
- A "/word" with no matching block (a path such as `/api/keys`) opened an empty, unseen menu that took the first Escape and Enter. It opens no menu now.

### Improvements

- Text and titles open with no blue wash: they read exactly as the page draws them.
- A card's Edit opens only the card's editor where the card was, with the caret in its first field and no focus ring. The frame, its focus ring, the "Type / to add a block" line under the card, and the bar with Remove, Cancel, and Done are gone. The card's delete is a small red trash inside its top right corner. A press or a Tab outside keeps the edit; Escape closes it.
- A table opens in its editor as the same card it reads as on the page, in the same place with no space over it: rounded edge, tinted header, rules between rows, the same column widths, the page's font, and its delete as a small red trash inside the top right corner. A column's menu shows over its header on hover.
- While a table or a data table is open, + to add a row and + to add a column show the whole time, the same size as + under a block.
- Opening a card no longer pulls the block under it up.
- Add a block at the end of the plan keeps room under it.
- The first change in an open editor shows in the bar of unapplied changes at once ("1 change not applied"). Apply changes saves it with the rest; Discard drops it.
- The Edit pill holds Edit alone. Text has no pill; a click opens it.
- The editor loads while the page is idle, so the first click on text opens at once.

### New features

- A + bar under the block under the pointer adds a block below it: text, cards, choices, forms, and phases. Inside a phase, the phase's own + shows under the whole phase, labelled *After phase*, and adds after it. Every + bar has the same size, the size of a table's add-row bar.
- A adds a block below the block under the pointer or with focus, as E edits it.
- + opens an empty line where it was pressed, edited as text, with the `/` hint for cards. Add a block under the plan does the same after the last block.
- The grip's menu has Add below, above Move up, Move down, and Delete.

### Notes

Removing a block is now the grip's Delete only. No registry restart needed beyond the usual version check.
