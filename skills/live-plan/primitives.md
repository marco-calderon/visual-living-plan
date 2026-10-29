# Live Plan primitives

Author each entry as an MDX component. The component name is the entry type (`phase`, `callout`, `choice`, `form`, `questions`, `approve`, `checklist`, `workflow`). Anything outside those components is markdown. A pipe table in that markdown renders as a table. A mermaid fence draws a figure. Any other fence is highlighted source.

A component can contain another component. A callout can contain a choice.

`{% tags %}` are not plan entries. A fence whose language is an entry type (` ```phase `, and the rest) is not a plan entry. `check` rejects both.

Put short fields on the component (`id`, `title`, `status`, `prompt`). A workflow graph is a pipe table in the component body. That table may sit in a `workflow` fence inside `<workflow>`. It is the execution path, not an entry by itself.

Every plan includes one `workflow` component. That block is the execution path.

`live-plan wait <id>` prints one interaction response as JSON. `live-plan review` prints the review result.

The page uses the document design in [DESIGN.md](../../DESIGN.md). Light and dark share that system. An accent color tints swatches and node highlights. It does not repaint the canvas, cards, or body text.

## Frontmatter

```yaml
---
title: Rate limiting rollout
summary: One sentence a person can scan.
agent: local-cursor
mode: watch
---
```

`mode` is `watch` or `review`. The CLI command (`serve` vs `review`) selects the server mode; frontmatter `mode` is recorded on the parsed plan.

## phase

Status timeline. Use one block per major step. Set exactly one phase to `active` while work is underway.

`status`: `pending` | `active` | `blocked` | `done` | `failed`. Unknown values become `pending`.

`id` defaults to a slug of `title`.

```mdx
<phase id="implement" title="Implement gateway middleware" status="active">
Wire the limiter into the request path. Default the flag to off.
</phase>
```

## callout

`kind`: `note` | `tip` | `risk` | `decision` | `warning`. Unknown values become `note`.

```mdx
<callout kind="risk" title="Redis dependency">
A Redis outage must not take down the API.
</callout>
```

## choice

The human picks one option. `wait` prints:

```json
{ "kind": "choice", "id": "fail-mode", "optionId": "open", "label": "Fail open" }
```

```mdx
<choice id="fail-mode" prompt="If Redis is unreachable, how should the limiter behave?">
<option id="open" label="Fail open">
Allow traffic if Redis is down.
</option>
<option id="closed" label="Fail closed">
Reject traffic if Redis is down.
</option>
</choice>
```

Give every option an `id`. The option body is the description.

## form

Each `<field>` has `name`, `label`, and `type`: `text` | `number` | `textarea` | `select` | `checkbox`. Anything else becomes `text`.

`select` needs `options`, a comma-separated string. `checkbox` uses the same `options` string and renders one box per option. The saved value is an array of the checked option strings, in option order. A checkbox field with no `options` is one box; the saved value is `"true"` or `"false"`. `default` for a checkbox group is a comma-separated list of options that start checked. On a single checkbox, `default="true"` starts checked. `default` on any other field is a string. On a number field it is stored as a number. `placeholder` is optional. `required="true"` or a bare `required` marks the field required. A required checkbox group needs at least one box checked.

This is not `<checklist>`. Checklist rows are `done` flags in the plan file. A person does not submit them. A checkbox field is a form interaction, saved like text, number, textarea, and select.

`wait` prints values keyed by `name`. `number` fields come back as numbers. A `checkbox` group comes back as an array of strings. A single checkbox comes back as `"true"` or `"false"`. Other types come back as strings.

A form can sit inside another plan component, such as a callout or a phase. A field can sit inside a layout component, such as `<VStack>`, inside that form. The response is still the form interaction.

```json
{
  "kind": "form",
  "id": "limits",
  "values": { "max_rps": 120, "window_s": 60, "rollout": "5", "channels": ["email", "slack"] }
}
```

```mdx
<form id="limits" prompt="Set the initial production limits">
<field name="max_rps" label="Max requests per window" type="number" required="true" default="120" />
<field name="window_s" label="Window seconds" type="number" required="true" default="60" />
<field name="rollout" label="Initial rollout percentage" type="select" required="true" default="5" options="1, 5, 25, 100" />
<field name="channels" label="Alert channels" type="checkbox" options="email, slack, pager" default="email, slack" />
</form>
```

The same field composed inside a callout:

```mdx
<callout id="access" kind="note" title="Access">
<form id="scopes" prompt="Which scopes should this key have?">
<VStack>
<field name="scopes" label="Scopes" type="checkbox" required="true" options="read, write, admin" />
</VStack>
</form>
</callout>
```

`name` is the key in `values`. Do not rename it after the form is on screen.

## questions

One free-text answer per item. Answer keys are the item index as a string (`"0"`, `"1"`, …), in the order of the `<item>` components.

`wait` prints:

```json
{
  "kind": "questions",
  "id": "rollout-notes",
  "answers": {
    "0": "staging, then production",
    "1": "Extend the existing gateway dashboard"
  }
}
```

```mdx
<questions id="rollout-notes" prompt="Anything else before coding?">
<item>
Which environments should receive the flag first?
</item>
<item>
Is there an existing dashboard to extend?
</item>
</questions>
```

`prompt` is optional. `id` is required in practice so `wait` has a stable target (it otherwise slugs from `prompt` or `"questions"`).

## approve

Yes/no gate. `wait` prints:

```json
{ "kind": "approve", "id": "proceed-implement", "approved": true, "note": "Ship behind the flag" }
```

`note` is omitted when the human leaves it blank.

```mdx
<approve id="proceed-implement" prompt="Proceed with implementation using the answers above?">
Phase statuses in this file will update as the work proceeds.
</approve>
```

## checklist

Not an interaction. You flip `done` as you finish. `done` is true only for `done="true"` or `done={true}`.

```mdx
<checklist title="Done when">
<item done="false">Middleware behind a flag</item>
<item done="true">429 + Retry-After covered by tests</item>
</checklist>
```

## workflow

Required. This component is the execution path. The Workflow tab draws it before the run starts, and the live run follows it. Each node `ref` is the plan block id a click jumps to. `ref` defaults to `id` when that block exists. Give phases, callouts, and checklist items ids when a node should point at them.

`check` exits 1 when this component is missing or has no nodes.

The body is a pipe table. Node lines come first. A line that is only `--` separates nodes from edges. A `workflow` fence may wrap that table. It is not an entry by itself.

```mdx
<workflow id="rollout" title="Expected execution">
```workflow
design | Confirm limiter design | design
implement | Implement gateway middleware | implement | Editing gateway.ts
--
design -> implement
implement -> implement @ right>right | retry
```
</workflow>
```

Node columns are `id | label | ref | detail`. `ref` and `detail` are optional.

Edge lines are `from -> to`, optionally `from -> to @ fromSide>toSide`, then `| label`. Sides are `top`, `right`, `bottom`, or `left`. An edge that points at its own node is drawn as an arc.

## Layout

These components only arrange their children. They are not plan entries, and they do not need an `id`.

- `<Box surface="panel" padding="md">` — `surface` is `plain`, `panel`, `soft`, or `inset`. `padding` is `none`, `sm`, `md`, or `lg`.
- `<HStack gap="md">` and `<VStack gap="md">` — `gap` is `xs`, `sm`, `md`, or `lg`. Optional `align`, `justify`, and `wrap`.
- `<Stack gap={16}>` and `<Row gap={16}>` — vertical and horizontal stacks. `gap` is a pixel number.
- `<ResponsiveStack>` — a row that wraps on a narrow window.

## Figures

`<Mermaid>` takes the diagram as its children, the same source a `mermaid` fence uses.

`<BarChart ariaLabel="Rejects">` and `<LineChart ariaLabel="Latency">` take one `label, value` row per line:

```mdx
<BarChart ariaLabel="Rejects by window">
1s, 12
5s, 40
</BarChart>
```

A mermaid fence in the plan markdown, or inside a phase, callout, or approve component, draws the same kind of figure. A diagram that cannot be parsed stays as source with a short error under it.

## code

Highlighted source. Use this when the human should read the code as it stands. Use [diff](#diff) when they should see a change.

The fence language is the syntax (`ts`, `python`, `bash`, `json`, and the rest). `mermaid` is a figure, not code.

Put the fence in the plan markdown:

````markdown
```ts
if (!flag.enabled) return next()
```
````

The same fence works inside a phase, callout, or approve component:

````mdx
<phase id="implement" title="Implement gateway middleware" status="active">
The limiter, as it stands:

```ts
if (!flag.enabled) return next()
```
</phase>
````

A fence with no language still renders as code, without a language label. An unknown language stays readable as plain text. Every block shows line numbers, starting at 1, so a note can point at a line.

To number a slice of a larger file, add `start=` after the language. The first line of the fence uses that number, and the following lines count up from there. Omit it to start at 1. Do not put `start=` on a diff.

````markdown
```ts start=40
export function gate(req: Request) {
  return reply.code(429).send()
}
```
````

That block shows lines 40 and 41.

## diff

A change rendered as hunks. Use this when the human should see what changed or what you propose to change. Do not paste the whole file for that.

Fence language is `diff` or `patch`. `start=` does not apply. The `@@` header is the line numbers.

````markdown
```diff
--- a/gate.ts
+++ b/gate.ts
@@ -3,1 +3,3 @@
-  if (await limiter.over(req)) return reply.code(429).send()
+  if (await limiter.over(req)) {
+    return reply.code(429).send()
+  }
```
````

That hunk shows one removed line at line 3 and three added lines at lines 3–5. The card header reads `gate.ts`.

Count the body lines so the `@@` header matches:

- A line starting with `-` counts only toward the old count.
- A line starting with `+` counts only toward the new count.
- A line starting with a space is context and counts toward both.

````markdown
```diff
--- a/gate.ts
+++ b/gate.ts
@@ -2,2 +2,2 @@
   if (!flag.enabled) return next()
-  return next()
+  return reply.code(429).send()
```
````

Old count is 2 (the context line plus the deletion). New count is 2 (the context line plus the addition). The context line begins with a space.

A hunk with no `---` / `+++` headers still renders. Put a language before `diff` so the hunk is highlighted as that language:

````markdown
```ts diff
@@ -3,1 +3,1 @@
-  return next()
+  return reply.code(429).send()
```
````

Put a diff fence in the component body the same way as a source fence.

## review result

`live-plan review` prints this and exits `0` approve, `1` deny, `2` iterate, `3` timeout:

```json
{
  "decision": "iterate",
  "note": "Drop the 100% rollout option",
  "comments": [],
  "responses": [],
  "iteration": 1
}
```

`responses` is every interaction answered during that server process, in submission order. `iteration` is the `--iteration` you passed.

## comment

`events` prints a comment as one JSON line. `data` is the comment. Answer it with `addressing`, then `reply`, then `address`. Those three commands are in [SKILL.md](SKILL.md). They do not create another `events` line.

```json
{
  "event": "comment",
  "id": "evt_example",
  "seq": 4,
  "data": {
    "id": "cmt_example",
    "partId": "phase:implement/paragraph:1",
    "kind": "paragraph",
    "blockId": "implement",
    "excerpt": "Wire the limiter",
    "text": "Default the flag on in staging.",
    "createdAt": 1761600000000,
    "addressingAt": null,
    "addressedAt": null,
    "replies": []
  }
}
```

A message from the minibar uses `kind` `message` and `partId` `review:message`. The same three commands apply.

| Field | Who writes it | What the page shows |
|---|---|---|
| `addressingAt` | `addressing`. A number while the comment is being reviewed. Empty before that. Iterate sets it on comments that are not yet answered. | Reviewing. A part comment shows the Addressing spinner, and the corner icon switches to that spinner. A minibar message shows Working. |
| `replies[].text` | `reply --text`. Each reply is `{ "id", "text", "createdAt" }`. The id starts with `rpl_`. | The reply text. A minibar message shows it on the tray. Any other comment shows it in that part's thread, labeled Agent. |
| `addressedAt` | `address`. A number when the comment is answered. Clears `addressingAt`. | Answered. A part comment says Addressed and the corner icon clears. |
| `outcome` | `address --outcome`. `implemented` (the default), `errored`, or `issues`. | On a minibar message: Implemented, Errored, or Had issues. A part comment still says Addressed. |

Until `addressingAt` or `addressedAt` is set, a part comment shows Mark addressed and a minibar message shows no state. Until `reply` runs, no reply text is shown.

## execution graph

`execution start` and `execution push` accept `--graph` (preferred) and optional `--scene`.

```json
{
  "nodes": [
    {
      "id": "design",
      "label": "Confirm design",
      "detail": "Fail-open chosen",
      "status": "done",
      "x": 40,
      "y": 80
    },
    {
      "id": "implement",
      "label": "Implement middleware",
      "status": "active",
      "x": 320,
      "y": 80
    }
  ],
  "edges": [
    { "from": "design", "to": "implement" },
    { "from": "implement", "to": "design", "label": "retry", "fromSide": "bottom", "toSide": "bottom" }
  ]
}
```

Node `status`: `pending` | `active` | `blocked` | `done` | `failed`. `detail`, `x`, and `y` are optional. Reuse the plan block id so the live overlay keeps the plan reference. `fromSide` and `toSide` are `top`, `right`, `bottom`, or `left`.

`execution push` keeps the current `step`, `detail`, `graph`, and `scene` when you omit that flag. `execution stop` sets `active` to false and leaves the last graph on screen. Plan interactions stay locked until execution is stopped.
