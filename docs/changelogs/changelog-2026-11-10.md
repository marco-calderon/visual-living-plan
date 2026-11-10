# Changelog — 2026-11-10

## 2.16.1

**PR:** [#171](https://github.com/marco-calderon/visual-living-plan/pull/171)

**Bump:** patch

### Summary

Plan headings are white and step down in size from h1 to h6, on the page and in the editor. Tables in the editor read like the page's tables, and their add-row and add-column buttons match the + that adds a block.

### Bugs fixed

- Headings in the editor took the editor's own dark text color and were hard to read on the dark theme. They now use the ink color.
- An h1 was smaller than an h2, and h2/h3 used browser default sizes. h1 to h6 now follow the design scale: 32, 24, 20, 18, 16 and 14px.
- Table cells in the editor had dark text and bright white borders. They now use the ink color, the line border and a soft header row.

### Improvements

- A table's add-row and add-column buttons in the editor are slim bars with a +, like the bar that adds a block, and show when the table is hovered or focused.
