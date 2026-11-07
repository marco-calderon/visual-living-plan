# ADR 0033: A person can edit a local plan on the page, and the agent hears an `edit` event

- Status: Accepted
- Date: 2026-11-07

## Context

The plan file is the agent's document. A person could answer and comment on the page but could not change the plan itself: fix a title, move a phase to done, add a phase, or add a question. The page already renders every card from MDX, and the browser already compiles that MDX.

## Decision

- The plan page has an Edit button on a local plan (not a saved version, not a hosted plan). It opens [MDXEditor](https://mdxeditor.dev) in place of the document. The editor loads as its own chunk, only when Edit is pressed.
- Each plan tag has an editor that reuses the page's card look: `CardLabel` and its icons, the phase `StatusIcon`, and the page's `Select`. Short fields (`title`, `prompt`, `status`, `kind`, `icon`, `id`, field settings) are controls in the card header. The body is a nested rich-text editor. Fences (code, mermaid, the workflow table) are plain text areas. Layout and chart tags use MDXEditor's generic editor.
- `<form>` and `<option>` are also HTML tags, which MDXEditor would treat as HTML. They are renamed `<plan-form>` and `<plan-option>` while editing and back on save.
- Typing `/` opens a menu of cards with their icon and label: phase, the five callout kinds, choice, form, questions, approval, and checklist. Inside a card it also offers option, field, and item. Arrow keys move, Enter or Tab adds, Escape closes.
- MDXEditor rewrites the whole document on save (two-space indentation inside every tag, blank lines). The save keeps every top-level block whose syntax tree did not change exactly as the file had it, and writes only changed and new blocks, without the editor's extra indentation (`src/planMdx/editSource.ts`).
- A new phase, choice, form, questions, or approval with an id joins the ```` ```workflow ```` fence, between the steps before and after it in the document. Cards that were already in the file are not added.
- `PUT /api/plan-mdx/source` takes `{ source, base }`. `base` is the file the editor started from. The session refuses with `409` when the file changed since then or a run is live, and with `400` when the new source does not compile. Otherwise it writes the file, keeps a snapshot, tells the page, and pushes an `edit` submission (`{ at, title, by: "page" }`) on the agent stream. `events` prints it like the other submissions.

## Consequences

The agent learns that the person changed the plan and should read the file again before its next write. An agent write while the editor is open makes the save fail, so neither edit is lost; the person cancels and starts again from the new version. Hosted plans are not editable yet: the Durable Object would need the same route and the same `edit` event. Bodies are edited as rich text, so a hand-written markdown detail inside a changed block (list markers, emphasis style) can come back in the editor's style.
