# Changelog — 2026-11-17

## 2.30.1

**PR:** [#199](https://github.com/marco-calderon/visual-living-plan/pull/199)

**Bump:** patch

### Summary

Inline code no longer jumps when you click into its text. It keeps the same place, size, and font open and closed. Text that ends in a path such as `/health` no longer opens the / menu by itself when you click into it.

### Bugs fixed

- Inline code grew wider, shrank its type, dropped a few pixels, and changed font when its text opened for editing, then jumped back when it closed. The editor drew a second code style inside the page's and used its own monospace font. It now draws inline code with the page's one style, in paragraphs, lists, quotes, table cells, and text inside cards.
- A click into text or a table cell that ended in a "/word" a block answers to (`GET /health`) opened the / menu with every block in it, and the first Escape only closed the menu. The menu now opens only while a "/query" is right before the caret, and one Escape closes the text.

### Notes

No registry restart needed.
