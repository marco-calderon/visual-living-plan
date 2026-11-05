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

**PR:** [#154](https://github.com/marco-calderon/visual-living-plan/pull/154)

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
- The Workflow tab of a hosted plan showed the sample loop instead of the plan's workflow, and hosted plan progress was not measured. The hosted plan loaded a layout library a Worker cannot run. It now builds the workflow without it, and the page lays it out.
- `live-plan close` on a hosted plan failed with `Unexpected end of JSON input`. It now closes the plan.
- The comment box on a plan part could close by itself while you typed. The page treated every re-render as a new document. It now does that only when the plan itself changed.
- A comment sent while the connection was slow could show twice, and could stay doubled on that device. The queued copy now gives way to the one the host saved.
- Clicking the Plan, Workflow, or Settings tab did nothing when the address already named that tab but another one was showing. The tab now opens.
- A quick Forward right after Back could land away from the section it opened.
- A burst of log lines on a busy machine could miss its write deadline, and a failed line stopped the logs from being cleared. Waiting writes now share one reader, and one failed line no longer blocks the rest.

### Improvements

- The status reads Reconnecting while the page has lost its connection for more than a few seconds, so an out-of-date status is not taken as current.
- A connection that goes quiet is noticed and opened again. The host now pings an open page every 20 seconds.
- A local plan page keeps its connection when the computer has no network.
- A hosted plan page has the same lock banner as a local one while a run is live.
- `execution push` keeps the run on or off as it is, and `execution stop` keeps the last step and graph on the Workflow tab. Flags you leave out keep their current value.

### New features

- `POST /api/execution/push` on both hosts, and `start`, `push`, and `stop` routes on hosted plans. The host merges the fields it is sent into the run, so a client does not have to read the run first.

### Notes

The unit and browser suites pass again: stale expectations were updated, and specs that count submissions run on a plan server of their own. No registry restart needed beyond the usual version check. The shell cache name is 2.5.0. Hosted plans need this Worker deployed for `execution push` and `stop` to work from this CLI.

## 2.6.0

**PR:** [#132](https://github.com/marco-calderon/visual-living-plan/pull/132)

**Bump:** minor

### Summary

Settings now offers every syntax theme `@pierre/diffs` can load, picked separately for light and dark mode. Only the chosen themes download.

### Improvements

- The syntax theme picker in Settings and in the local plan's Settings tab is a fixed-height card with an inner scroll and Light and Dark tabs. Previews come from a generated catalog, so the picker does not load any theme files.
- Code blocks that are already on the page switch to a newly saved theme without a reload.

### New features

- 75 syntax themes (26 light, 49 dark), including GitHub, Catppuccin, Rosé Pine, Tokyo Night, Dracula, Nord, Solarized, Gruvbox and Vitesse. `diffsTheme` saves a Pierre family id as before, or a `light/dark` pair such as `github-light/tokyo-night`.

### Notes

Existing `diffsTheme` values keep working. Run `bun scripts/generate-diffs-themes.mjs` after upgrading `shiki`, `@pierre/theme`, or `@pierre/theming`. No registry restart needed.
