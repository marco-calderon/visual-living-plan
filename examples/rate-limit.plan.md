---
title: Rate limiting rollout
summary: Add a sliding-window limiter at the API gateway, keep humans in the loop for policy choices, and stream status as the agent works.
agent: local-cursor
mode: watch
---

# Rate limiting rollout

We add a sliding-window limiter at the gateway, behind a flag. This living plan is the agent's status surface: phases update as work progresses, and interaction blocks pause for your direction.

```workflow
id: rollout
title: Expected execution
nodes:
  - id: design
    ref: design
    label: Confirm limiter design
  - id: redis-dependency
    ref: redis-dependency
    label: Redis dependency
  - id: fail-mode
    ref: fail-mode
    label: Choose fail mode
  - id: limits
    ref: limits
    label: Set production limits
  - id: rollout-notes
    ref: rollout-notes
    label: Rollout notes
  - id: proceed-implement
    ref: proceed-implement
    label: Approval to implement
  - id: implement
    ref: implement
    label: Implement gateway middleware
  - id: observe
    ref: observe
    label: Ship dashboards and alerts
  - id: done-when
    ref: done-when
    label: Definition of done
edges:
  - from: design
    to: redis-dependency
  - from: redis-dependency
    to: fail-mode
  - from: fail-mode
    to: limits
  - from: limits
    to: rollout-notes
  - from: rollout-notes
    to: proceed-implement
  - from: proceed-implement
    to: implement
  - from: implement
    to: observe
  - from: observe
    to: done-when
```

```phase
id: design
title: Confirm limiter design
status: done
body: |
  Use Redis for a shared sliding window. Return 429 with Retry-After when over limit.
```

```phase
id: implement
title: Implement gateway middleware
status: active
body: |
  Wire the limiter into the request path and add a feature flag defaulting to off.
```

```phase
id: observe
title: Ship dashboards and alerts
status: pending
body: |
  Emit reject counts and latency, then alert on sustained 429 spikes.
```

```callout
id: redis-dependency
kind: risk
title: Redis dependency
body: |
  A Redis outage must not take down the API. Fail-open vs fail-closed is a human policy decision below.
```

```choice
id: fail-mode
prompt: If Redis is unreachable, how should the limiter behave?
options:
  - id: open
    label: Fail open
    description: Allow traffic if Redis is down. Prefer availability.
  - id: closed
    label: Fail closed
    description: Reject traffic if Redis is down. Prefer strict limiting.
```

```form
id: limits
prompt: Set the initial production limits
fields:
  - name: max_rps
    label: Max requests per window
    type: number
    required: true
    default: 120
  - name: window_s
    label: Window seconds
    type: number
    required: true
    default: 60
  - name: rollout
    label: Initial rollout percentage
    type: select
    required: true
    options: ["1", "5", "25", "100"]
    default: "5"
```

```questions
id: rollout-notes
prompt: Anything else the agent should know before coding?
items:
  - Which environments should receive the flag first?
  - Is there an existing dashboard the agent should extend?
```

```approve
id: proceed-implement
prompt: Proceed with implementation using your answers above?
body: |
  The agent will update phase statuses in this file as it works. Keep the watch URL open to follow progress and answer any new gates.
```

```checklist
id: done-when
title: Done when
items:
  - text: Middleware behind a flag
    done: false
  - text: 429 + Retry-After behavior covered by tests
    done: false
  - text: Dashboard panels for rejects and latency
    done: false
```
