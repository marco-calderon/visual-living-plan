# Changelog — 2026-11-12

## 2.25.1

**PR:** [#188](https://github.com/marco-calderon/visual-living-plan/pull/188)

**Bump:** patch

### Summary

Changing a dashboard filter or period no longer jumps. The new rows fade in where they are, and nothing around them slides or blinks.

### Bugs fixed

- A filter faded the whole plan table out, held it blank, then faded it back in. On the hosted dashboard it also faded the tabs, the counts, and the status line. Now only the table's header and rows fade in, all at once, and everything around them stays put.
- When a new period arrived, the dimmed numbers dropped to blank and slid in 8px from the side. On the hosted dashboard the tabs and the Refresh button slid with them. The counts now brighten in place, and the table's header and rows fade in.
- The status line jumped 22px to the right when its spinner appeared, and back when it went away. The spinner now sits after the text.
- Refresh on the hosted dashboard faded the page as soon as it was clicked, before anything had loaded. The rows now fade in when the new read arrives.

### Improvements

- A new period settles 150ms after it arrives, down from about 340ms.

### Notes

The table's header fades with the rows because its columns resize to fit them, by as much as 150px between filters. Reduced motion still swaps at once. No plan format changes and no registry restart needed. `SHELL_CACHE_VERSION` moves to 2.25.1.
