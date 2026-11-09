# ADR 0033: A person edits a plan on the page as a draft on their device, and publishes it as a new version

- Status: Accepted
- Date: 2026-11-07, revised 2026-11-08 (block handles, icon picker, + bar under blocks, status picker, agent-only cards out of the menu, code fences in Pierre's editor)

## Context

The plan file is the agent's document. A person could answer and comment on the page but could not change the plan itself: fix a title, move a phase to done, add a phase, or add a question. The page already renders every card from MDX, and the browser already compiles that MDX. The page works offline, so an edit should not depend on the network until the person decides to publish it.

## Decision

### Editor

- The plan page has an Edit button on a local plan and on a hosted plan the signed-in account owns. A saved version stays read-only. Edit opens [MDXEditor](https://mdxeditor.dev) in place of the document. The editor loads as its own chunk, only when Edit is pressed.
- Each plan tag has an editor that reuses the page's card look: `CardLabel` and its icons, the phase `StatusIcon`, and the page's `Select`. Short fields (`title`, `prompt`, `kind`, `id`, field settings) are controls in the card header. The body is a nested rich-text editor. Fences (code, mermaid, the workflow table) are edited in Pierre's code editor (`@pierre/diffs/edit`, the library the page already uses to draw code), with the page's syntax theme. The page and the editor highlight with Highlights (`preferredHighlighter: 'highlights'`), Pierre's WebAssembly highlighter, which has a palette for every code theme in Settings. A picker above the code sets the fence's language; `workflow` keeps its language, since the plan reads it. A language Highlights does not know (`isSupportedLanguage`) shows as plain text. A mermaid fence draws its figure under the code a moment after typing stops, with the page's diagram colors; while the code does not parse, the last figure stays and the parse error shows under it. Pierre types into a contenteditable inside a shadow root, so the fence stops every key, paste, and drop from reaching the plan's editor, and the `+` lets go of focus before it adds a line. Layout and chart tags use MDXEditor's generic editor.
- A phase edits its status where the page shows it: its status icon is a button that opens a short list of the five statuses, each with its icon. A pick sets the status and closes the list.
- A card that takes an icon edits it where the page shows it: its icon square is a button. It opens a popover with every card icon and the icon colors, drawn in the color picked. A pick shows on the card at once, and the popover stays open until Escape or a click outside, so icon and color are set together. Arrow keys move in each grid. A card without an icon shows a dashed square to add one. No icon also drops the color. The color is the card's `color` attribute (`blue`, `green`, `orange`, `red`, `pink`, `purple`), which the page draws too, over a callout's kind tint.
- `<form>` and `<option>` are also HTML tags, which MDXEditor would treat as HTML. They are renamed `<plan-form>` and `<plan-option>` while editing and back on publish.
- Typing `/` opens a menu of cards with their icon and label: Text first, which keeps the line a paragraph, then Code and Mermaid, which add a fence where the line was and put the caret in it, then phase, the note, tip, risk, and warning callouts, and checklist. Decision callouts, choice, form, questions, and approval are cards the agent writes for the person to answer, so the menu leaves them out; the editor still edits them where the plan has them, and their menu entries stay in code behind `agentOnly`. Inside a card it also offers option, field, and item. Arrow keys move, Enter or Tab adds, Escape closes. The menu takes Enter and Tab before the editor does: inside a card's body the editor would otherwise start a new line first, and the menu would lose the `/query` it replaces. It reads the query from the text at the caret, so a key typed just before Enter counts. A picked card goes into the editor the `/` was typed in, and the empty line it leaves before the card goes away once the card is in. Escape on a line that holds only the `/` empties the line. Menus and popovers grow in when they open; the grip's menu also fades out (fade only with reduced motion).
- Each block has a grip in a gutter on its left, like a block editor's side menu, and a top-level block (card or paragraph) has a short gray `+` bar in the gap under it. Both show for the block under the pointer, or the block being edited on a touch screen. The `+` adds a line below with `/` in it, which opens the card menu; Text in that menu keeps it a paragraph. Blocks sit further apart in the editor than on the page, so the bar fits between them. The grip drags the block to another place with a drop line. Tapping the grip opens Add below, Move up, Move down, and Delete, so a touch screen can reorder too. A card's body has its own grip for its options, fields, items, and paragraphs. The handles sit inside the plan column, because the page clips anything outside it. The document always ends with an empty line, so there is somewhere to type after the last card.
- A card body is a nested editor. When a card field or body takes focus, the editors around it drop their caret. Otherwise the next update of an outer editor puts its old caret back, takes focus from the card, and scrolls the page to it. Card fields write with `skip-dom-selection` and `skip-scroll-into-view`. If a keystroke still moves the page so far that the field being typed in leaves the screen, the page is put back.

### Drafts stay on the device

- An edit is a draft in `localStorage` under `living-plan:draft:<plan id>`: the plan file it started from (`base`), the editor text, and when it was saved. Writes are throttled to one a second while typing, and flushed when the tab is hidden, closed, or the editor closes. A card body tells the plan about its text only when it loses focus, so a draft save pushes the focused body first. Nothing is sent to the plan while drafting, online or offline.
- Close keeps the draft. The button then reads Resume draft, also after the browser restarts. Discard deletes it. An edit that comes back to the published text deletes the draft.
- A draft can be written during a live run and while offline. Publish is disabled offline and refused during a run.
- `localStorage` is used rather than the OPFS store because plain HTTP on the LAN has no OPFS, and a draft is one small value per plan.

### Publish makes a new version

- Publish checks that the edit compiles, then sends `PUT <plan base>/api/plan-mdx/source` with `{ base, source }`. The route is the same on the local service and on the host.
- MDXEditor rewrites the whole document (two-space indentation inside every tag, blank lines). Publish keeps every top-level block whose syntax tree did not change exactly as the file had it, and writes only changed and new blocks without that indentation (`src/planMdx/editSource.ts`).
- A new phase, choice, form, questions, or approval with an id joins the ```` ```workflow ```` fence, between the steps before and after it in the document. Cards that were already in the file are not added.
- Both hosts refuse with `409` when the plan is no longer `base` (the agent wrote it since the draft started) or a run is live. The draft stays, and the person discards it to start again from the new version.
- Local service: writes the file, keeps a snapshot (the local version), and pushes an `edit` submission `{ at, title, by: "page" }`.
- Host: only the owner's account may publish (`edit` action; the plan bearer may not). The Worker checks the storage limit, the plan object replaces the source, bumps the revision, and records it as the last page revision. The Worker saves a published version, so the versions menu lists it, and takes the title from the front matter. The agent hears `edit` with the new `source` and `revision`.

### The agent's file follows a hosted edit

- `live-plan events` (and `serve`, `wait`, `watch`) writes the `source` of a hosted `edit` into the local plan file before printing the line, and remembers the revision. The printed line leaves the source out.
- An agent upload whose revision is older than the last page revision is refused with `409 { pageEdit: true }` instead of the usual stale-revision retry, which would overwrite the person's edit. The CLI says to run `events` first. An upload of exactly the current source returns the current revision, so the file watcher catches up after `events` wrote the pulled edit.

## Consequences

The agent learns that the person changed the plan and reads the file again before its next write. Neither side silently loses an edit: the page refuses a stale draft, and the host refuses a stale upload after a page edit. A draft lives in one browser; another device does not see it. Bodies are edited as rich text, so a hand-written markdown detail inside a changed block (list markers, emphasis style) can come back in the editor's style.
