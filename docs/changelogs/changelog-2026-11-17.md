# Changelog — 2026-11-17

## 2.30.1

**PR:** [#199](https://github.com/marco-calderon/visual-living-plan/pull/199)

**Bump:** patch

### Summary

Inline code no longer jumps when you click into its text. It keeps the same place, size, and font open and closed. Text that ends in a path such as `/health` no longer opens the / menu by itself when you click into it, and every + bar is a smaller 8px, the same height everywhere.

### Bugs fixed

- Inline code grew wider, shrank its type, dropped a few pixels, and changed font when its text opened for editing, then jumped back when it closed. The editor drew a second code style inside the page's and used its own monospace font. It now draws inline code with the page's one style, in paragraphs, lists, quotes, table cells, and text inside cards.
- A click into text or a table cell that ended in a "/word" a block answers to (`GET /health`) opened the / menu with every block in it, and the first Escape only closed the menu. The menu now opens only while a "/query" is right before the caret, and one Escape closes the text.
- Apply changes pressed soon after the agent wrote the plan could be refused ("The plan changed while you were editing") and need a second press. When the page's copy of the plan on this device started late, it put back the plan from when the page loaded, and the unapplied changes moved onto that older plan. The page now ignores a device copy older than the plan it has heard from the plan itself.

### Improvements

- Every + bar is one height, 8px (16px before): under a block, under a phase, and a table's add-row and add-column bars. A bar under a block sits in the middle of the gap with its + in it, so in most gaps it no longer touches the blocks above and below it.

### Notes

No registry restart needed.
