# ADR 0039: The plan page reads as a document, data views are their own blocks, and every block can be edited from the block

- Status: Accepted
- Date: 2026-11-13

## Context

Every block on the plan page was a grey panel: a phase, a callout, a checklist, and each question sat in its own card. Checklist lines and choice options were cards inside those cards. A long plan read as a stack of boxes, and nothing set a code walkthrough or an API contract apart from a note.

Agents write the same kinds of data into most plans: the files a change touches, an API contract, a schema, a payload, a code walkthrough. They wrote them as paragraphs, lists, or code fences, because the page had nothing else.

The page editor ([ADR 0033](0033-page-editor.md)) opened only from the toolbar, at the section on screen. Forms and questions were locked by their tag, and no other block could be locked.

Other planning tools show a plan as a Markdown document with data cards inside it, and let the reader edit a block in place. The survey and the target design are in the implementation spec that accompanied this change.

## Decision

### Document first

- Prose blocks have no card: phase, callout, checklist, choice, form, questions, and approve. They keep their classes and markup. `surface="plain"` replaces the panel, and a rule at the end of `client/entries/primitives.css` clears `.block`'s frame for them.
- A phase gets a hairline above it and a 28px step circle that carries its status. A callout gets a 2px left rule in its kind's color. A checklist gets an eyebrow title, a `done/total` count, and a segmented bar. A question for the person gets a hairline above it, like a phase.
- Every block label is an eyebrow: 12px, 600, uppercase, 0.08em tracking.
- A card is only for data with its own format: code, diffs, diagrams, charts, tables, and the document blocks below. DESIGN.md has the card policy and the new tokens (`--tag-*`, `--rule-*`, `--status-*`, `--mark`, `--data-card-radius`, `--flow-gap`).

### Document blocks

- `client/mdx/docBlocks.tsx` adds `FileTree`/`File`, `Endpoint`/`Param`/`Request`/`Response`, `DataModel`/`Entity`/`Attr`/`Relation`, `JsonView`, `AnnotatedCode`/`Note`, `Tabs`/`Tab`, `Compare`/`Pane`, `Update`, `Properties`/`Prop`, and the inline `Path`.
- They are PascalCase MDX components, like `DataTable`: no `id`, no events, no workflow step. A parent reads its rows' props; a row renders nothing by itself (a `File` on its own reads as a path).
- Attributes are strings, so the editor can write them. A boolean is bare, `"true"`, or `{true}`.
- `src/planMdx/outline.ts` lists them in `EMBED_NAMES`, so their text joins the outline as markdown for search and the static page.
- `AnnotatedCode` draws each note under its line through Pierre's `lineAnnotations` (`CodeBlock` gained `annotations`).
- A hidden tab panel gets `hidden="until-found"`, set after render because React writes `hidden` as a flag, so find in page still reaches it.

### Smaller additions to existing blocks

- A checklist `<item>` takes `status` (`pending`, `active`, `blocked`, `done`, `failed`), which wins over `done`. The outline keeps it.
- `<option recommended>` shows a Recommended label. It does not preselect and does not change the event.

### The plan header

The plan's first heading, when it is the document's first heading and an `h1`, gets an eyebrow (Living plan, the page's mode, and `agent`) and fact chips (the active phase, phases done, open questions), computed in `client/planHeader.ts` from the source and the answers. The author writes nothing for it.

### Edit from the block

- While the plan can be edited, the top-level block under the pointer shows one Edit pill at its top right (`bindBlockEditButton` in `client/planEditButton.ts`). It opens the same editor at that block: its own title, prompt, or heading, or the heading above it.
- One button follows the pointer and lives on `body`, so React's blocks stay as React drew them. It never shows on a locked block, on a touch screen, or in print.
- E opens the editor at the block that holds focus, when there is one, so the keyboard reaches the same place.

### Locking any block

- Any component can carry `locked`. The page marks it `data-edit-locked` and shows no Edit pill. The editor shows it with its fields disabled and a Locked badge, lets it move, and keeps it from changing or being removed.
- Forms and questions stay locked by default. `locked="false"` unlocks one. `isLockedMdast` in `client/editor/locked.ts` reads the attribute first and the tag second.

### The editor

- Every document block has an `ENTRY_SPECS` entry: its attributes are fields in the card header (select for enums, a checkbox for booleans), and its body is a nested editor. `Path` is an inline descriptor.
- The `/` menu gains Data (File tree, API endpoint, Data model, Table, Bar chart, Line chart) and Layout (Tabs, Compare, Properties) sections, Annotated code and JSON under Code, and Update under Cards. A row (a file, a param, a tab) is offered only inside its parent block.
- A checklist item's Done checkbox became the status picker phases use.
- In the editor, a phase, a callout, and a checklist get a hairline frame with no fill, and a callout keeps its left rule.

## Not in this decision

- Wireframes (agent-written HTML in a sketch frame) and a storyboard canvas. Rendering agent HTML needs a sandbox, and plan pages already treat agent code as untrusted ([ADR 0037](0037-plans-open-in-the-desktop-app.md)).
- A question card that mixes single, multiple, and free answers. It would change the `questions` event.

## Consequences

A plan reads top to bottom as prose, with data cards where the content has its own format. Agents have a named block for the data they write most, and the person can fix any block without hunting for it in the editor. A block an agent or a person must not change says so with one attribute. Existing plans render without changes: no tag or event changed, and `done` still works.
