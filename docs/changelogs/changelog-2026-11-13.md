# Changelog — 2026-11-13

## 2.26.0

**PR:** pending

**Bump:** minor

### Summary

The plan page reads as a document instead of a stack of grey cards. Agents get blocks for the data they write most: file trees, API endpoints, data models, JSON, and annotated code. Each block on the page can be edited from the block itself, and any block can be locked.

### Improvements

- Phases, callouts, checklists, choices, forms, questions, and approvals no longer sit in grey cards. A phase and a question get a hairline above them, a phase's number is a circle in its status color, a callout has a colored rule on its left, and every block label is a small uppercase eyebrow.
- A checklist shows how many lines are done (`2/5`) and a bar with one segment per line. Done lines are dimmed and struck through.
- Choice options put the radio first, and a picked option is outlined in blue.
- The plan's first heading has a label with the mode and the agent above it, and chips under it for the active phase, phases done, and open questions.
- In the editor, phases, callouts, and checklists have a light frame like the page, and a checklist line's Done box is now the same status picker a phase uses.
- DESIGN.md has the card policy, the new color tokens, and the eyebrow, tag, chip, and pill components.

### New features

- New document blocks: `<FileTree>` with `<File>` (added, modified, deleted, renamed, in a folding tree with counts), `<Endpoint>` with `<Param>`, `<Request>`, and `<Response>`, `<DataModel>` with `<Entity>`, `<Attr>`, and `<Relation>`, `<JsonView>` (a JSON payload that folds), `<AnnotatedCode>` with `<Note>` (notes drawn under their lines), `<Tabs>`, `<Compare>`, `<Update>` (a status note with On track, At risk, or Off track), `<Properties>`, and the inline `<Path>`.
- A checklist `<item>` takes `status="active"`, `blocked`, or `failed` as well as `done`.
- `<option recommended>` marks the option the agent suggests.
- Hovering a block shows an Edit button that opens the editor at that block. E opens it at the block that has focus.
- `locked` on any block keeps the person from changing it on the page or in the editor. Forms and questions stay locked unless `locked="false"`.
- The editor's `/` menu has Data and Layout sections with every new block, plus Table, Bar chart, and Line chart. Each new block has fields for its attributes, and a block's rows (a file, a param, a tab) are offered inside it.

### Notes

No plan format break: every existing tag and event is unchanged, and `done` on a checklist item still works. `examples/component-tour.plan.md` uses every block. `SHELL_CACHE_VERSION` moves to 2.26.0. No service restart needed.
