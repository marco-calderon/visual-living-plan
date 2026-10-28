# ADR 0020: The plan page is the MDX React app

- Status: Accepted
- Date: 2026-10-28
- Supersedes: the render half of [0018](0018-markdoc-plan-tags.md)

## Context

The plan column was a Markdoc HTML string. Comments, the title bar, and the page script all read that HTML. A separate sample under `spikes/mdx-react` already rendered the same entries as React: MDX, one event stream, SQLite snapshots, Pele diagrams, an ELK workflow, and TanStack charts, themed like the live page.

## Decision

The page opened for a plan is that MDX app. `renderPlanPage` no longer calls Markdoc. It serves the plan shell (title bar, dashboard navigation, settings, review dock) and a mount point. The client compiles the plan as MDX and renders the sample components. Choice, form, questions, and approve post the same interaction JSON as before.

The plan file stays the document. Opening a session stores that source in the sample's snapshot tables (`plan_documents`, `plan_snapshots`) under the config home. A file change appends an edit. Restore writes that snapshot back to the file and publishes it on the plan event stream. Loopback, LAN, and `addressing` / `reply` / `address` are unchanged.

Markdoc still parses `.plan.md` into the session model (interactions, workflow, progress). It is not on the render path. YAML fences and `{% tags %}` are rewritten to MDX for the page. A file that is already MDX is compiled as written.

## Consequences

The open plan is a React tree. Part ids are stamped on that tree so comments, including select-and-highlight, keep working. A bundle-less page still has static anchors so in-page jumps work before the client loads. New presentation is a component in the MDX map, not a Markdoc transform.
