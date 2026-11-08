# Changelog — 2026-11-08

## 2.16.0

**PR:** [#169](https://github.com/marco-calderon/visual-living-plan/pull/169)

**Bump:** minor

### Summary

In the page editor, a short gray `+` button under a card or paragraph adds a new block right there. The card menu now starts with Text, so the new block can be a plain paragraph, and a phase's status is set from its status icon.

### New features

- A gray `+` bar shows in the gap under the card or paragraph you point at, or the one you are editing on a phone. It adds a line below and opens the card menu.
- The card menu starts with Text, which keeps the new line a paragraph to write in.
- Click a phase's status icon to change its status. A short list shows each status with its icon. It replaces the Status dropdown.

### Improvements

- Escape on a line that holds only the `/` clears it, so closing the menu leaves an empty line instead of a stray `/`.
- The `+` moved from beside the grip to under the block. The left gutter is narrower, which gives the editor more width on a phone. Add below is still in the grip's menu.
- Blocks sit a little further apart in the editor, so the bar fits between them. The page itself keeps its spacing.
- The card menu no longer offers decision callouts, choice, form, questions, or approval. The agent writes those for you to answer. The editor still edits them when a plan has them.
- The card menu, the grip's menu, the status and icon popovers, and the editor's dropdowns animate when they open. The grip's menu also fades out. With reduced motion they only fade.

### Notes

Editor-only change in the browser bundle. No plan format, CLI, or Worker route changes.
