---
title: Comments in watch and approval
summary: Comments stay available in watch and review, and a comment shows progress while the agent is addressing it.
agent: local-cursor
mode: review
---
# Comments in watch and approval

The part selector is what lets a person pin a comment on a plan element. Today it follows session mode. The next change keeps comments usable on the status page and on the approval bar, and shows when a comment is in progress.


<workflow id="comment-modes" title="How the change lands">
```workflow
gap | Name the current arming | gap
arm | Ask what a review comment does | arm-shape
progress | Show addressing in progress | progress
prove | Prove the page | done-when
--
gap -> arm
arm -> progress
progress -> prove
```
</workflow>

<phase id="gap" title="Name the current arming" status="done">
The selector is armed when the session is not `watch`. Comment mode and review mode both arm it. Watch mode does not.

The Comment button is the other half. From watch it switches to comment and arms the selector. From comment or review it switches to watch and turns the selector off. So approval (review) already starts with comments armed, and the Comment button is what disarms them.

A part click while the selector is armed opens the comment popover and cancels that click. That includes choices, form fields, and Approve or Deny inside the plan.
</phase>

<callout id="current-vs-request" title="What the page does now" kind="note">
The request was to enable comments in watch and approval, with comments already enabled in watch. The code has the reverse: watch is off, and comment plus review are on. This plan treats approval as review mode, the mode with the verdict bar.
</callout>

<phase id="arm" title="Arm comments in watch and review" status="active">
Watch and review both keep comments available. Comment mode stays the full grab it is today.

The Comment button in review must not be the control that drops the session back to watch and disarms comments. Watch no longer means "comments off."
</phase>

<questions id="arm-shape" prompt="What should a comment during review do?">
<item>
Should the approval bar stay up while the agent is answering a comment?
</item>
</questions>

<phase id="progress" title="Show addressing in progress" status="pending">
A comment gains `addressingAt`, empty until the agent starts work. `POST /api/comments/:id/addressing` sets it and broadcasts the same `comment` event. `POST /api/comments/:id/address` still sets `addressedAt`, clears `addressingAt`, and broadcasts again.

In the popover, the message that is being addressed shows a progress icon in place of Mark addressed. The corner icon on that element swaps from the comment mark to the same progress icon while any open comment on that part is being addressed. When the comment is addressed, the corner icon goes away as it does now.

The agent skill tells the agent to call addressing before editing the plan, then address when the edit is done. Reduced motion keeps a static mark instead of a spinning one.
</phase>

<checklist id="done-when" title="Done when">
<item done="false">
Watch and review can open a comment thread, and review does not lose that by pressing Comment
</item>
<item done="false">
The answer about a comment during review is what the approval page does
</item>
<item done="false">
The popover message and the corner icon both show progress while addressingAt is set
</item>
<item done="false">
Addressing then addressing-done round-trips on the comment event, and the icon clears when the comment is addressed
</item>
</checklist>
