# ADR 0033: A person edits a plan on the page as a draft on their device, and publishes it as a new version

- Status: Accepted
- Date: 2026-11-07, revised 2026-11-08

## Context

The plan file is the agent's document. A person could answer and comment on the page but could not change the plan itself: fix a title, move a phase to done, add a phase, or add a question. The page already renders every card from MDX, and the browser already compiles that MDX. The page works offline, so an edit should not depend on the network until the person decides to publish it.

## Decision

### Editor

- The plan page has an Edit button on a local plan and on a hosted plan the signed-in account owns. A saved version stays read-only. Edit opens [MDXEditor](https://mdxeditor.dev) in place of the document. The editor loads as its own chunk, only when Edit is pressed.
- Each plan tag has an editor that reuses the page's card look: `CardLabel` and its icons, the phase `StatusIcon`, and the page's `Select`. Short fields (`title`, `prompt`, `status`, `kind`, `icon`, `id`, field settings) are controls in the card header. The body is a nested rich-text editor. Fences (code, mermaid, the workflow table) are plain text areas. Layout and chart tags use MDXEditor's generic editor.
- `<form>` and `<option>` are also HTML tags, which MDXEditor would treat as HTML. They are renamed `<plan-form>` and `<plan-option>` while editing and back on publish.
- Typing `/` opens a menu of cards with their icon and label: phase, the five callout kinds, choice, form, questions, approval, and checklist. Inside a card it also offers option, field, and item. Arrow keys move, Enter or Tab adds, Escape closes.

### Drafts stay on the device

- An edit is a draft in `localStorage` under `living-plan:draft:<plan id>`: the plan file it started from (`base`), the editor text, and when it was saved. Writes are throttled to one a second while typing, and flushed when the tab is hidden, closed, or the editor closes. Nothing is sent to the plan while drafting, online or offline.
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
