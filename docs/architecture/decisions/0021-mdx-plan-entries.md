# ADR 0021: Agents author MDX components

- Status: Accepted
- Date: 2026-10-28
- Supersedes: the fence and tag rewrite in [0020](0020-mdx-plan-page.md)

## Context

[ADR 0020](0020-mdx-plan-page.md) made the open plan an MDX React page, and still treated Markdoc tags and YAML entry fences as the authoring contract. Those forms were rewritten into MDX before the page compiled them. The components the page actually renders are MDX elements (`<phase>`, `<choice>`, and the rest). Keeping a second syntax meant the parser accepted plans that were no longer the contract.

## Decision

Agents author the MDX components the page renders. The plan parser reads those components for the session model: interactions, workflow, and progress. `{% tags %}` and top-level entry fences (` ```phase ` and the same fence for the other entry types) are rejected. They are not rewritten.

A workflow graph may keep a structured pipe-table body inside `<workflow>`. That table may sit in a ` ```workflow ` fence. The fence is the graph body, not an entry of its own. Mermaid, code, and diff stay markdown fences. `<Mermaid>`, `<BarChart>`, `<LineChart>`, and the layout components (`Box`, `HStack`, `VStack`, `Stack`, `Row`, `ResponsiveStack`) are part of the same MDX map.

`wait` JSON for choice, form, questions, and approve is unchanged.

## Consequences

Plans written as Markdoc tags or YAML entry fences no longer parse. New plans use MDX, as in `examples/rate-limit.plan.md`. The page shell is unchanged: title bar, dashboard, comments, and approve / decline / message stay. The document palette is [DESIGN.md](../../../DESIGN.md). An accent color does not repaint that canvas.
