# Changelog — 2026-11-17

## 2.30.1

**PR:** (link once known)

**Bump:** patch

### Summary

Inline code no longer jumps when you click into its text. It keeps the same place, size, and font open and closed.

### Bugs fixed

- Inline code grew wider, shrank its type, dropped a few pixels, and changed font when its text opened for editing, then jumped back when it closed. The editor drew a second code style inside the page's and used its own monospace font. It now draws inline code with the page's one style, in paragraphs, lists, quotes, table cells, and text inside cards.

### Notes

No registry restart needed.
