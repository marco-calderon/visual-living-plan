# Changelog — 2026-11-16

## 2.30.0

**PR:** [#198](https://github.com/marco-calderon/visual-living-plan/pull/198)

**Bump:** minor

### Summary

Adding and editing blocks feels like writing on the page. + sits under every block and opens an empty line right there, and a card's Edit opens only the card's own editor: no frame, no Remove, Cancel, or Done. Changes count as changes to apply as you make them, and Apply changes saves them.

### Bugs fixed

- A click on text no longer blinks: the text stayed blank, behind a blue box, for a frame while its editor loaded. The page now keeps drawing the text until the editor's own text is in.
- Escape in a card's field closed nothing. It now closes an untouched card's editor, and keeps the change in one that was edited.

### Improvements

- Text and titles open with no blue wash: they read exactly as the page draws them.
- A card's Edit opens only the card's editor where the card was, with the caret in its first field. The frame, its focus ring, the "Type / to add a block" line under the card, and the bar with Remove, Cancel, and Done are gone. A press or a Tab outside keeps the edit; Escape closes it.
- The first change in an open editor shows in the bar of unapplied changes at once ("1 change not applied"). Apply changes saves it with the rest; Discard drops it.
- The Edit pill holds Edit alone. Text has no pill; a click opens it.

### New features

- A + bar under the block under the pointer adds a block below it: text, cards, choices, forms, and phases. Inside a phase, the phase's own + shows under the whole phase and adds after it.
- + opens an empty line where it was pressed, edited as text, with the `/` hint for cards. Add a block under the plan does the same after the last block.
- The grip's menu has Add below, above Move up, Move down, and Delete.

### Notes

Removing a block is now the grip's Delete only. No registry restart needed beyond the usual version check.
