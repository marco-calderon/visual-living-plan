# ADR 0040: The plan page is the editor: a block opens its own editor in place, and Apply changes makes the version

- Status: Accepted
- Date: 2026-11-13

## Context

The page had two modes. Reading showed the rendered plan; Edit in the toolbar ([ADR 0033](0033-page-editor.md)) swapped the whole plan for one MDXEditor document, and Publish made a new version. The block Edit pill from [ADR 0039](0039-document-first-page.md) only opened that same whole-page editor, scrolled to the block.

A person who wanted to fix one line lost the rendered plan around it: code became editors, diagrams became source, and the page jumped. Other planning tools edit a block where it sits and keep the rest of the document as it reads.

## Decision

### One page, no edit mode

- The toolbar has no Edit button. `src/planEditButton.ts`, the `.plan-edit-btn` styles, and `client/editor/PlanEditor.tsx` are gone.
- The rendered plan is always on screen. Where the plan can be edited (a local plan, or a hosted plan this account owns, never a saved version), each block offers its own editor.

### Every block knows its place in the file

- `src/planMdx/remarkBlockRanges.ts` stamps each top-level block, and each block directly inside a `<phase>`, with `data-plan-block="start-end"`: offsets into the MDX the page compiles (the body after the front matter, trimmed; `mdxBodyOffset`). A JSX block gets it as an attribute; markdown gets it on the element it renders to, and a fence on its `<code>`.
- Components pass it to their root element. `lockable` in `client/planComponents.tsx` wraps layout blocks, figures, the workflow, and DataTable in a `.plan-block-frame` that carries it.
- A block inside a phase is stamped only when it starts at column 1, so cutting it out and putting it back cannot lose indentation.

### Edit and + on the block

- `bindBlockEditButton` (`client/planEditButton.ts`) shows one pill, Edit and +, beside the innermost `[data-plan-block]` under the pointer, with focus, or tapped on a touch screen. It never shows on a locked block or in comment mode.
- Edit opens that block's editor in its place. + opens an empty block's editor right after it. E edits the block with focus, or the first block at the reading line. Add a block, under the plan, opens one at the end.
- `client/planMdx.tsx` puts the editor in the React tree (`placeEditSlot`): it copies only the elements on the way to the block, so every other block keeps its state. The page keeps drawing the file the editor opened on until the editor closes, even if the agent writes meanwhile.

### The block editor

- `client/editor/BlockEditor.tsx` is MDXEditor with the plan's plugins (`planEditorPlugins` in `client/editor/editorSetup.tsx`), loaded with the block's text (`blockEditorText`). Its bar has Remove (asks once), Cancel, and Done. Ctrl or Cmd+Enter is Done; Escape cancels while nothing is typed.
- Done runs `applyBlockEdit` (`src/planMdx/blockEdit.ts`): the editor's text replaces the block's range, or goes after it. Blocks of the edit that mean the same as the file keep the file's text (`mergeEditedBody`), and a new phase, choice, form, questions, or approval gets a workflow step (`wireNewSteps`). Every other byte of the file stays.
- The result must compile (`planNotReadyReason`) before it is kept. The editor shows the error and stays open otherwise.
- The empty line with the caret shows "Type / to add a block" (`client/editor/slashHint.tsx`), in the block and in each card body. The + bars do not.
- `<DataTable>` has its own editor (`client/editor/dataTableEditor.tsx`, added the same day in [#192](https://github.com/marco-calderon/visual-living-plan/pull/192)). The header strip holds the label, the header row holds the columns, and each cell is a nested editor on that cell's children. The pure changes live in `client/editor/dataTableMdast.ts`. Ids stay, attributes stay, and a cell's `value` follows its text only when it repeated that text. The editor writes the table one part per line (`compactTableHandler`), so an edit to one cell is one changed line. A locked table is read-only.

### Apply changes makes the version

- Done keeps the edit on the device: `living-plan:draft:<plan>` holds `{ base, source, edits, savedAt }` (`client/editor/draftStore.ts`), and the page draws `source`. Closing the tab keeps it.
- A bar at the bottom of the plan says how many changes are not applied, with Discard (asks once) and Apply changes. Apply sends `{ base, source }` to the existing `PUT …/api/plan-mdx/source`, which saves a version and tells the agent, as Publish did. The server refuses it when the plan moved past `base`; the bar says so and offers Discard.
- A draft from the whole-page editor (`{ base, markdown }`) is turned into a plan file once, with `planSourceFromEditor`.
- Unapplied changes are never remembered as the last rendered plan, so a reload offline still falls back to the live plan.

### An agent write under unapplied changes

Added the same day ([#191](https://github.com/marco-calderon/visual-living-plan/pull/191)).

- When the live plan moves past `draft.base` and no block editor is open, the page merges the draft onto it with `rebaseDraft` (`src/planMdx/rebaseDraft.ts`), a block-level three-way merge at the same grain as editing: top-level blocks and the blocks inside a phase. Cards match by id, other blocks by meaning, and a block changed in place pairs with the most alike block of its shape. An open editor stages its Done against the file it opened on first.
- A block only one side changed takes that side; a block the person added goes after its neighbour in the agent's plan; every byte of the agent's plan the edits do not touch stays as written; a phase merges attribute by attribute and block by block; front matter takes the agent's unless only the person changed it.
- When the person's workflow differs only by the steps `wireNewSteps` wrote for their new cards, the agent's workflow wins and those cards are wired onto it again.
- A block both changed differently keeps the agent's text, and the draft holds `rebase: { base, mine, keep, conflicts }` until the person keeps a side of each in the Apply bar. Apply and block editing wait meanwhile. A merge that does not compile (`planNotReadyReason`) leaves the draft as it was, and the bar says applying will be refused and offers Discard.
- A 409 on Apply reads the live plan again, so the merge runs.
- A move the person made counts as a remove plus an add, so a move of a block the agent also changed is a conflict. Blocks inside an indented container merge as one block.

### Text is edited as it reads

Added the next day (2.27.0).

- Text (a paragraph, a heading, a list, a quote, top-level or in a phase) shows no pill. A click on it opens its editor in place with the caret where the click landed (`client/caretSpot.ts` counts characters on the page and puts the caret at the same count in the editor). A link, a checkbox, or a drag that selects text keeps its own click.
- The editor opens `inline` (`data-inline` on `.plan-block-editor`): no frame, no bar, the page's font and the block's own margins (collapsed with its first and last child's), and no empty line after a heading, a list, or a quote unless the caret is on it. Text in it sits where the text sat, and the blocks under it do not move.
- A press outside it, a Tab out of it, Ctrl or Cmd+Enter, or Escape keeps the edit; Escape with nothing typed closes it. A finger keeps it at a tap, since its press may start a scroll. A press on other text keeps the open edit, then opens that text with the caret where it was pressed. Emptying the text removes the block. The bar appears only when the edit does not render, so there is a way back.
- `remarkBlockRanges` also stamps each pipe table cell with `data-plan-cell-range`, the place of its text (an empty cell's is where its text would go). A click on a cell opens an editor in that cell; Enter keeps it, and `applyCellEdit` (`src/planMdx/blockEdit.ts`) writes only that cell's text, on one line, with its pipes escaped.
- A click on a cell of a `<DataTable>` that is a block of its own opens the table's editor with the caret in that cell. The row is found by its id (`row-3` is the third `<Row>`), whatever the sort.
- The pill stays on everything that is more than text: cards, choices, forms, endpoints, data models, diagrams, code, layout, and tables (for their rows and columns). Text in a phase shows the phase's pill. E edits the block under the pointer or with focus, text included.
- The pill no longer hides when the pointer goes to it and back onto its block: coming back cancels the hide that leaving started.
- Ctrl or Cmd+Enter is caught before the editor sees it; it used to split the line at the caret before Done read the text.

### Every block moves where it reads

Added in 2.27.2. The whole-page editor had a grip on every block. Once each block opened its own editor, a grip was left only inside an open editor, so on the page nothing could be reordered.

- `bindBlockMove` (`client/planBlockMove.ts`) shows a grip left of the block under the pointer, with focus, or tapped: text, cards, choices, forms, endpoints, diagrams, code, tables, layout, phases, and the blocks inside a phase. These are exactly the blocks `remarkBlockRanges` stamps. A phase's rail and the gutter left of its blocks belong to the block level with the pointer, so the pointer can go left to that block's grip.
- The grip fits the 20px between the docked contents list and the plan column. On a narrow screen it sits over the block's top-left corner, as the pill sits over its top-right one.
- Dragging the grip draws a line where the block will go: between the top-level blocks, or between the blocks of a phase, as wide as that level. A phase goes only between top-level blocks. Near the top or bottom of the window the page scrolls. Escape cancels.
- A click or a tap on the grip opens Move up and Move down, which stay open on the block after it moves. Alt+Up and Alt+Down move the block with focus (or the block of the focused grip).
- `moveBlock` (`src/planMdx/remarkBlockRanges.ts`) cuts the block's text with one separator beside it and puts it before or after the target block, as written. Every other byte stays, and moving a block back where it was gives the file back. The result must compile before it is kept. A move is one more unapplied change, like Done, and Apply changes publishes it.
- Blocks a component draws inside itself (a file tree's rows, a choice's options, an endpoint's fields, a diagram's nodes, a tab's panel) are not blocks of the plan and keep their order; that component's editor changes them. Blocks inside a locked block keep their order too, and nothing is dropped into one. The locked block itself moves, as a locked card does in the editor.
- The grip is gone while an editor is open, in comment mode, and while the page merges an agent write.

## Consequences

- Reading and editing are the same page. Nothing jumps when a block opens, and the blocks around it stay rendered.
- An edit touches only its block's bytes in the file, so the agent's formatting survives.
- The e2e specs drive the block pill (`e2e/block-edit.spec.ts`), text and cells edited where they read (`e2e/inline-edit.spec.ts`), and the move grip (`e2e/block-move.spec.ts`); the checklist and dark-text specs open a block's editor instead of the toolbar's.
