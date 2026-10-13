---
title: Custom execution path
summary: A branched workflow with a self-loop and a return edge, used to check that the live-plan skill matches the running CLI.
agent: local-cursor
mode: watch
---

# Custom execution path

This plan is the expected path for checking the skill. **Check** splits into a revise loop or a straight serve, and **Sign off** can send the work back to the start.

```workflow
id: skill-check
title: Custom execution path
nodes:
  - id: author
    ref: author
    label: Author the plan
    x: 40
    y: 80
  - id: check
    ref: check
    label: Check the plan
    x: 340
    y: 80
  - id: serve
    ref: serve
    label: Serve the page
    x: 640
    y: 80
  - id: sign-off
    ref: sign-off
    label: Sign off
    x: 940
    y: 80
  - id: revise
    ref: revise
    label: Revise the skill
    x: 340
    y: 300
edges:
  - from: author
    to: check
  - from: check
    to: serve
    label: valid
  - from: check
    to: revise
    label: invalid
    fromSide: bottom
    toSide: top
  - from: revise
    to: revise
    label: again
  - from: revise
    to: check
    label: recheck
    fromSide: left
    toSide: bottom
  - from: serve
    to: sign-off
  - from: sign-off
    to: author
    label: iterate
    fromSide: bottom
    toSide: left
```

```phase
id: author
title: Author the plan
status: done
body: |
  Write one `.plan.md` with phases and a `workflow` block. The diagram above is that custom path.
```

```phase
id: check
title: Check the plan
status: active
body: |
  Run `check` and confirm the printed workflow nodes are `author`, `check`, `serve`, `sign-off`, and `revise`.
```

```phase
id: revise
title: Revise the skill
status: pending
body: |
  If check output disagrees with the skill, fix the skill and run check again. The self-loop is that extra pass.
```

```phase
id: serve
title: Serve the page
status: pending
body: |
  Open the Workflow tab. The branch, the revise self-loop, and the iterate return edge should already be on screen before a live run starts.
```

```callout
id: loop-note
kind: tip
title: Two different loops
body: |
  `revise -> revise` is a self-loop drawn as an arc. `sign-off -> author` is a return edge with `fromSide: bottom` and `toSide: left`, so it does not sit on the forward path.
```

```choice
id: path-taken
prompt: Which branch should the live overlay follow after check?
options:
  - id: valid
    label: Valid path
    description: Check goes straight to serve, then sign-off.
  - id: invalid
    label: Revise loop
    description: Check drops into revise, loops once, then rechecks.
```

```approve
id: sign-off
prompt: Does this custom path match what you see on the Workflow tab?
body: |
  Approve when the branch, the self-loop, and the return edge are all visible. Deny sends the plan back through the iterate edge.
```

```checklist
id: skill-valid
title: Skill is valid when
items:
  - text: check prints these five workflow nodes
    done: true
  - text: Workflow tab shows the branch, self-loop, and return edge before execution starts
    done: true
  - text: A live graph uses the same node ids and overlays this path
    done: true
```
