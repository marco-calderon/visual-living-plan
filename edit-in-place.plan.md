---
title: Edit in place showcase
summary: A tour of editing on the page in 2.30.0. Plus under every block, cards that open as their own editor, and changes that wait for Apply.
mode: watch
---

# Edit in place showcase

This plan is here to be edited. Nothing you do reaches the file until you press **Apply changes** in the bar at the bottom of the plan, and **Discard** there puts everything back.

## Try these first

- Click any line of text, like this one. It opens where it reads, with no blue wash and no blink.
- Point at a block and look under it. A slim **+** bar adds an empty line right there.
- Press **A** with the pointer on a block to add a line below it from the keyboard. **E** edits it.
- Click the grip left of a block for **Add below**, Move up, Move down, and Delete.

> A quote is text too. Click it, type, and click away. The change waits in the bar at the bottom.

| Where | What to try |
| --- | --- |
| A table cell | Click it and type. Enter keeps it. |
| This table | Press its Edit. It opens as the same card, with a small red delete in its top right corner. |
| An empty new line | Type / for a card: a note, a tip, a data table, a checklist. |

<phase id="text" title="Text inside a phase" status="done">
Point at this paragraph. One + bar sits under it, inside the phase, and a second one, labelled **After phase**, sits under the whole phase.

Press Enter at the end of this line to make a new block, then Backspace on the empty line to take it back.
</phase>

<phase id="cards" title="Cards open as their own editor" status="active">
Point at the choice below and press its **Edit** pill. Only the choice's own editor opens, with the caret in its question and no focus ring. There is no frame, no Done button, and no line under it. Change a word, then click anywhere outside it, or press Escape.

<choice id="layout" prompt="Which layout should the release notes use?">
<option id="list" label="A list of changes" recommended>
One bullet per change, grouped by kind.
</option>
<option id="story" label="A short story">
Two paragraphs that walk through what changed and why.
</option>
</choice>
</phase>

<callout id="pending" kind="note" title="Changes wait for Apply">
The first key you type in any editor counts in the bar at the bottom: 1 change not applied. Click this text to try it, or press Edit on the callout to open the whole callout.
</callout>

## A code block

Press Edit on the code below. The caret goes straight into the code, not onto the language picker.

```ts
export function retryAfter(windowMs: number, now: number): number {
  return Math.ceil((windowMs - (now % windowMs)) / 1000)
}
```

## A data table

Click a cell to open the table's editor with the caret in that cell.

<DataTable label="Release owners">
<Column id="area" header="Area" sort />
<Column id="state" header="State" filter />
<Column id="owner" header="Owner" />
<Row>
<Cell>Editor</Cell>
<Cell value="done"><Pill tone="success">done</Pill></Cell>
<Cell><Chip>web</Chip></Cell>
</Row>
<Row>
<Cell>Docs</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell><Chip>docs</Chip></Cell>
</Row>
</DataTable>

## An answer card

A form is answered on the page, so it offers no Edit. It still has a + under it, and its grip still moves it.

<form id="feedback" prompt="How did editing feel?">
<field name="rating" label="Rating" type="select" options="Great, Fine, Rough" default="Fine" />
<field name="notes" label="Notes" type="textarea" />
</form>

<checklist id="seen" title="Seen it working">
<item done="true">Text opens without a blink</item>
<item status="active">A + under every block</item>
<item>A card opens as its own editor</item>
<item>Apply changes saves a new version</item>
</checklist>

<workflow id="tour" title="The tour">
```workflow
text | Text inside a phase | text
cards | Cards open as their own editor | cards
pending | Changes wait for Apply | pending
seen | Seen it working | seen
--
text -> cards
cards -> pending
pending -> seen
```
</workflow>
