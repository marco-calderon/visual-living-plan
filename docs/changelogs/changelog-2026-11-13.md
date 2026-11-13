# Changelog — 2026-11-13

## 2.26.0

**PR:** [#190](https://github.com/marco-calderon/visual-living-plan/pull/190)

**Bump:** minor

### Summary

The plan page reads as a document instead of a stack of grey cards, and it is also the editor: there is no edit mode. Each block opens its own editor where it sits, and Apply changes saves the edits as a new version. Agents get blocks for the data they write most: file trees, API endpoints, data models, JSON, and annotated code. Any block can be locked.

### Improvements

- Phases, callouts, checklists, choices, forms, questions, and approvals no longer sit in grey cards. Data tables, the workflow, charts, and markdown tables are white cards with a header strip. A phase and a question get a hairline above them, a phase's number is a circle in its status color, a callout has a colored rule on its left, and every block label is a small uppercase eyebrow.
- A checklist shows how many lines are done (`2/5`) and a bar with one segment per line. Done lines are dimmed and struck through.
- Choice options put the radio first, and a picked option is outlined in blue.
- The plan's first heading has a label with the mode and the agent above it, and chips under it for the active phase, phases done, and open questions.
- In the editor, phases, callouts, and checklists have a light frame like the page, and a checklist line's Done box is now the same status picker a phase uses.
- Blocks no longer touch: layout boxes, a paragraph after a question, a heading after a data block, and labels side by side in Properties all have room between them.
- The toolbar no longer has an Edit button, and the whole-page editor is gone. An unpublished draft from it opens as unapplied changes.
- DESIGN.md has the card policy, the new color tokens, and the eyebrow, tag, chip, and pill components.

### New features

- New document blocks: `<FileTree>` with `<File>` (added, modified, deleted, renamed, in a folding tree with counts), `<Endpoint>` with `<Param>`, `<Request>`, and `<Response>`, `<DataModel>` with `<Entity>`, `<Attr>`, and `<Relation>`, `<JsonView>` (a JSON payload that folds), `<AnnotatedCode>` with `<Note>` (notes drawn under their lines), `<Tabs>`, `<Compare>`, `<Update>` (a status note with On track, At risk, or Off track), `<Properties>`, and the inline `<Path>`.
- A checklist `<item>` takes `status="active"`, `blocked`, or `failed` as well as `done`.
- `<option recommended>` marks the option the agent suggests.
- Pointing at a block shows Edit and + beside it. Edit opens that block's editor in its place, with the rest of the plan still on screen; + opens a new block below it. A block inside a phase (a paragraph, a callout, a file tree) opens on its own. E edits the block that has focus, and a tap shows the buttons on a touch screen.
- Done keeps an edit on this device and shows it on the page. A bar at the bottom counts the changes not applied, with Discard and Apply changes; Apply changes saves a version and tells the agent. Only the edited block's text changes in the plan file.
- The empty line with the caret says "Type / to add a block". Add a block, under the plan, adds one at the end.
- `locked` on any block keeps the person from changing it on the page or in the editor, and from removing it with the block around it. Forms and questions stay locked unless `locked="false"`.
- The editor's `/` menu has Data and Layout sections with every new block, plus Table, Bar chart, and Line chart. Each new block has fields for its attributes, and a block's rows (a file, a param, a tab) are offered inside it.

### Bugs fixed

- A code block showed light colors on a dark page when the system was set to light. Code now follows the page's own light or dark choice.
- `start=` after a fence's language did not number the lines on the page. It does now.

### Notes

No plan format break: every existing tag and event is unchanged, and `done` on a checklist item still works. Applying changes uses the same route and `edit` event as Publish did ([ADR 0040](../architecture/decisions/0040-edit-in-place.md)). `examples/component-showcase.plan.md` shows every component on one page, and `examples/component-tour.plan.md` uses the new blocks in a realistic plan. `SHELL_CACHE_VERSION` moves to 2.26.0. No service restart needed.
