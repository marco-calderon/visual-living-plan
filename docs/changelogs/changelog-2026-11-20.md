# Changelog — 2026-11-20

## 2.32.2

**PR:** not opened yet

**Bump:** patch

### Summary

The comment popover and the Messages tray list messages newest first, by the time they were sent. Before, they could come up shuffled after the page loaded.

### Bugs fixed

- Comments in the comment popover and messages in the Messages tray could show in a shuffled order. The page's device copy keeps comments by their random id, and the page used that order. Both now show the newest message on top. An agent reply stays under the message it answers.

### Improvements

- In the Messages tray, the note sent with an *Iterate* review sits above the newest comment it was sent with, instead of always on top.

### Notes

`SHELL_CACHE_VERSION` moves to 2.32.2. No registry restart needed.
