---
title: Submission delivery showcase
summary: Click through comments, choices, gates, and review verdicts so the one-shot events client and the execution watch client can be tried in order.
agent: local-cursor
mode: watch
---

# Submission delivery showcase

This page is the click target for the delivery runbook. Work only the step the guide names. A comment needs the Comment control on. A choice, form, question, or gate needs it off, because an armed comment grab eats the click.

```workflow
id: showcase
title: Showcase path
nodes:
  - id: queued-comment
    ref: queued-comment
    label: Comment while events is down
  - id: live-comment
    ref: live-comment
    label: Comment while events is waiting
  - id: delivery-shape
    ref: delivery-shape
    label: Choose what to queue
  - id: batch-note
    ref: batch-note
    label: Submit the form
  - id: reconnect-notes
    ref: reconnect-notes
    label: Answer the questions
  - id: hold-execution
    ref: hold-execution
    label: Deny the early gate
  - id: review-verdict
    ref: review-verdict
    label: Review deny, iterate, approve
  - id: start-execution
    ref: start-execution
    label: Approve execution
  - id: execute
    ref: execute
    label: Watch stays up
  - id: done-when
    ref: done-when
    label: Stop watch after execution
edges:
  - from: queued-comment
    to: live-comment
  - from: live-comment
    to: delivery-shape
  - from: delivery-shape
    to: batch-note
  - from: batch-note
    to: reconnect-notes
  - from: reconnect-notes
    to: hold-execution
  - from: hold-execution
    to: review-verdict
  - from: review-verdict
    to: start-execution
  - from: start-execution
    to: execute
  - from: execute
    to: done-when
```

```phase
id: queued-comment
title: Comment while events is down
status: active
body: |
  The events process is not running. A comment sent now sits on the server with `delivered_at` empty. The next `events` start prints it and exits immediately.
```

```phase
id: live-comment
title: Comment while events is waiting
status: pending
body: |
  Events is running and waiting. The next comment prints as JSON and that process exits. Starting events again should stay up, because nothing else is pending.
```

```callout
id: comment-grab
kind: tip
title: Comment grab
body: |
  Press Comment, or the C key, until the mode chip says comment. Then click this callout, type the message for the current step, and Send. Press Comment again before you touch a choice, form, or gate.
```

```choice
id: delivery-shape
prompt: Which pair should we queue while events is stopped?
options:
  - id: choice-and-comment
    label: This choice plus a comment
    description: Stop events, pick this, then comment, then start events once. Both lines print and the process exits.
  - id: choice-only
    label: This choice alone
    description: One interaction line, then events exits.
```

```form
id: batch-note
prompt: Leave a note on the form submission
fields:
  - name: observer
    label: Your name
    type: text
    required: true
    placeholder: Ada
  - name: batch
    label: How many events should one events process print
    type: select
    required: true
    options: ["1", "2"]
    default: "1"
```

```questions
id: reconnect-notes
prompt: What should the agent do after events exits?
items:
  - After a comment, a denial, or any other event, what should happen to the events process?
  - After an approval, which command should stay running until execution finishes?
```

```approve
id: hold-execution
prompt: Deny this gate. Execution should not start.
body: |
  Deny prints an interaction with `approved: false`. The agent reconnects events and does not open watch.
```

```phase
id: review-verdict
title: Review deny, then iterate, then approve
status: pending
body: |
  Review mode adds a Deny button on the bottom bar and an Approve button in the corner. Iterate has no button on this page. The guide submits that verdict when the step says so. Deny and iterate must not start watch. Approve must.
```

```approve
id: start-execution
prompt: Approve this gate to start the execution watch.
body: |
  Approve prints an interaction with `approved: true`. Events stops for good. Watch starts and stays up while the workflow is pushed.
```

```phase
id: execute
title: Watch stays up during execution
status: pending
body: |
  The watch process is the status client. A comment during execution prints on that process and the process keeps running. Forms stay locked until execution stops.
```

```checklist
id: done-when
title: Done when
items:
  - text: A comment sent while events was down printed on the next start, then that process exited
    done: false
  - text: A comment sent while events was waiting printed and exited, and the next start stayed up
    done: false
  - text: Two queued submissions printed together from one events process
    done: false
  - text: The early gate denial reconnected events and did not start watch
    done: false
  - text: Review deny and iterate did not start watch
    done: false
  - text: Approval started watch, execution updates landed, and watch closed only after execution stop
    done: false
```
