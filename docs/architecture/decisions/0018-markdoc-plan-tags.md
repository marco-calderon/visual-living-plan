# ADR 0018: Plan entries are Markdoc tags

- Status: Accepted
- Date: 2026-10-27

## Context

Plan entries were YAML fences (` ```phase `, ` ```choice `, and the rest). That shape cannot nest: a callout cannot contain a choice, and a new composition had to become another arm of the plan block union. The page, comments, stamps, and interaction JSON already depend on the section HTML those fences render to.

## Decision

`.plan.md` is parsed with Markdoc and rendered with `Markdoc.renderers.html`. There is no React on the plan path, and plan files do not run Markdoc functions, partials, or `$variables`.

Each current entry is a tag. Its transform emits the same section markup, part attributes, and interaction JSON the page script already understands. Tags nest, so a callout can contain a choice. `{% status %}` is an inline chip and is not a plan block.

Existing YAML fences are rewritten to those tags before parse, so open sessions and `examples/rate-limit.plan.md` keep rendering. Mermaid, code, and diff stay markdown fences. Section stamps and part ids stay on the top-level section.

Agents author tags. Wait responses keep the same JSON shapes.

## Consequences

New plans use tags. Fence-authored plans still open. A composed presentation is a schema and a transform, not a new block type. Comment anchors and the page script stay on the HTML they already read.
