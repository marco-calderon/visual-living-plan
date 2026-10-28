---
title: Submission delivery showcase
summary: Click through comments, choices, gates, and review verdicts so the one-shot events client and the execution watch client can be tried in order.
agent: local-cursor
mode: watch
---
# Submission delivery showcase

This page is the click target for the delivery runbook. Work only the step the guide names. A comment needs the Comment control on. A choice, form, question, or gate needs it off, because an armed comment grab eats the click.


<workflow id="showcase" title="Showcase path">
```workflow
queued-comment | Comment while events is down | queued-comment
live-comment | Comment while events is waiting | live-comment
delivery-shape | Choose what to queue | delivery-shape
batch-note | Submit the form | batch-note
reconnect-notes | Answer the questions | reconnect-notes
hold-execution | Deny the early gate | hold-execution
review-verdict | Review deny, iterate, approve | review-verdict
start-execution | Approve execution | start-execution
execute | Watch stays up | execute
done-when | Stop watch after execution | done-when
--
queued-comment -> live-comment
live-comment -> delivery-shape
delivery-shape -> batch-note
batch-note -> reconnect-notes
reconnect-notes -> hold-execution
hold-execution -> review-verdict
review-verdict -> start-execution
start-execution -> execute
execute -> done-when
```
</workflow>

<phase id="queued-comment" title="Comment while events is down" status="active">
The events process is not running. A comment sent now sits on the server with `delivered_at` empty. The next `events` start prints it and exits immediately.
</phase>

<phase id="live-comment" title="Comment while events is waiting" status="pending">
Events is running and waiting. The next comment prints as JSON and that process exits. Starting events again should stay up, because nothing else is pending.
</phase>

<callout id="comment-grab" title="Comment grab" kind="tip">
Press Comment, or the C key, until the mode chip says comment. Then click this callout, type the message for the current step, and Send. Press Comment again before you touch a choice, form, or gate.
</callout>

<choice id="delivery-shape" prompt="Which pair should we queue while events is stopped?">
<option id="choice-and-comment" label="This choice plus a comment">
Stop events, pick this, then comment, then start events once. Both lines print and the process exits.
</option>
<option id="choice-only" label="This choice alone">
One interaction line, then events exits.
</option>
</choice>

<form id="batch-note" prompt="Leave a note on the form submission">
<field name="observer" label="Your name" type="text" required="true" placeholder="Ada" />
<field name="batch" label="How many events should one events process print" type="select" required="true" default="1" options="1, 2" />
</form>

<questions id="reconnect-notes" prompt="What should the agent do after events exits?">
<item>
After a comment, a denial, or any other event, what should happen to the events process?
</item>
<item>
After an approval, which command should stay running until execution finishes?
</item>
</questions>

<approve id="hold-execution" prompt="Deny this gate. Execution should not start.">
Deny prints an interaction with `approved: false`. The agent reconnects events and does not open watch.
</approve>

<phase id="review-verdict" title="Review deny, then iterate, then approve" status="pending">
Review mode adds a Deny button on the bottom bar and an Approve button in the corner. Iterate has no button on this page. The guide submits that verdict when the step says so. Deny and iterate must not start watch. Approve must.
</phase>

<approve id="start-execution" prompt="Approve this gate to start the execution watch.">
Approve prints an interaction with `approved: true`. Events stops for good. Watch starts and stays up while the workflow is pushed.
</approve>

<phase id="execute" title="Watch stays up during execution" status="pending">
The watch process is the status client. A comment during execution prints on that process and the process keeps running. Forms stay locked until execution stops.
</phase>

<checklist id="done-when" title="Done when">
<item done="false">
A comment sent while events was down printed on the next start, then that process exited
</item>
<item done="false">
A comment sent while events was waiting printed and exited, and the next start stayed up
</item>
<item done="false">
Two queued submissions printed together from one events process
</item>
<item done="false">
The early gate denial reconnected events and did not start watch
</item>
<item done="false">
Review deny and iterate did not start watch
</item>
<item done="false">
Approval started watch, execution updates landed, and watch closed only after execution stop
</item>
</checklist>
