# Changelog — 2026-11-05

## 2.4.0

**PR:** [#152](https://github.com/marco-calderon/visual-living-plan/pull/152)

**Bump:** minor

### Summary

Stopping and resuming an agent no longer opens the plan page again. `serve` and `review` open a plan page only the first time, and the tab the person already has keeps following the plan.

### Improvements

- `serve` and `review` remember which plan pages this machine has opened, in `~/.config/living-plan/opened-pages.json`. A later `serve` or `review` of the same plan prints `Page already opened before` and leaves the browser alone.
- The `live-plan` skill and the agent guidelines tell agents to pass `--no-open` when they resume a plan, and not to reopen the page to show a change.

### New features

- `--open` on `serve` and `review` opens the page again even when it was opened before.

### Notes

`--no-open` still never opens a browser. `dashboard` and `account login` open their page every time, as before. No registry restart needed.

## 2.4.1

**PR:** [#153](https://github.com/marco-calderon/visual-living-plan/pull/153)

**Bump:** patch

### Summary

The workflow diagram now follows the state of the plan, the same way plan progress does. Answered steps and a live run's progress show on the workflow, not only on the phases and the progress bar.

### Bugs fixed

- A workflow step linked to a choice, form, question, or approval stayed pending after it was answered, while progress counted it as done. It now turns done as soon as the answer arrives, on local and hosted plans.
- Answering an interaction did not refresh the Workflow tab. The local service and the hosted plan now send the updated workflow with each answer.
- A status written on a workflow node hid the status of the phase it links to. The step now shows whichever of the two is further along.
- A live run could show a plan step as less finished than its phase, for example active on a phase marked done, while progress kept the phase done. A step linked to the plan now keeps the further along status, the same rule progress uses. A step that links to nothing in the plan still shows the run status.
- On a hosted plan, an `execution push` sent browsers the run without the plan's workflow, so the Workflow tab lost the plan's steps until the page reloaded. It now sends the same view `GET /api/execution` returns.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 2.4.1.

## 2.5.0

**PR:** pending

**Bump:** minor

### Summary

The open plan page now shows Running and Stopped reliably. It follows an agent's start, push, and stop without reloading, and catches up on its own after a dropped connection or a service restart. `execution push` and `execution stop` now work on hosted plans.

### Bugs fixed

- On a hosted plan, `execution push` and `execution stop` failed, so the page stayed on Running after the work ended. Both now work the same as on a local plan.
- A page whose connection dropped (sleep, a network change, a service restart, or going back to the tab) missed a start or a stop and kept showing the old state. It now catches up as soon as it reconnects.
- A page whose stream the browser closed for good never reconnected. It now opens a new one and keeps every listener.
- A hosted plan page opened during a run showed Stopped with its forms unlocked. It now opens on Running with its forms locked.
- An agent edit to a hosted plan during a run unlocked the page's forms. They now stay locked until the run stops.
- A local plan page reloaded itself on every start and stop, losing scroll and anything typed. It now updates in place.

### Improvements

- The status reads Reconnecting while the page has lost its connection for more than a few seconds, so an out-of-date status is not taken as current.
- A connection that goes quiet is noticed and opened again. The host now pings an open page every 20 seconds.
- A local plan page keeps its connection when the computer has no network.
- A hosted plan page has the same lock banner as a local one while a run is live.
- `execution push` keeps the run on or off as it is, and `execution stop` keeps the last step and graph on the Workflow tab. Flags you leave out keep their current value.

### New features

- `POST /api/execution/push` on both hosts, and `start`, `push`, and `stop` routes on hosted plans. The host merges the fields it is sent into the run, so a client does not have to read the run first.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 2.5.0. Hosted plans need this Worker deployed for `execution push` and `stop` to work from this CLI.
