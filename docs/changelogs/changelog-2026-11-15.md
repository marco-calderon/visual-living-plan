# Changelog — 2026-11-15

## 2.29.0

**PR:** [#197](https://github.com/marco-calderon/visual-living-plan/pull/197)

**Bump:** minor

### Summary

The dashboard is organized into three summary cards and a grouped plan table. You see at a glance how the period's plans split by status, how many questions are waiting on you, and how much work the runs did. Each row now shows the folder, branch, plan file, questions waiting, review verdict, and timing.

### Bugs fixed

- On a phone, the plan table cut off its Progress and Started columns, and the status tabs ran past the edge of the screen. Each plan now reads as a card, and the tabs scroll inside their pill.
- A hosted plan's dashboard row never showed questions waiting, because the hosted host keeps no pending count. The row and the summary now count its unanswered questions.
- With a card's text open on a phone, the card's Edit could vanish for good: if the page jumped and the card left the screen for a moment, which can happen while typing, the Edit stayed hidden after the card came back. It now hides only while the card is out of view and shows again with it.

### Improvements

- The seven equal stat tiles are now three cards. **Plans** shows the period's plan count, a bar that splits it into Active, Idle, Executed, and Interrupted, and a legend with counts. **Open now** shows questions waiting on you, open plans, plans waiting on you, and agents connected. **Work** shows execution time, phases done, answers given, and, on the local dashboard, files modified and folders.
- The plan table lists open plans first, then finished runs, each under its own heading. The caption counts the plans, and reads "2 of 5" while a status filter hides some.
- A row shows the plan's mode as a chip, its folder and git branch, and the plan file relative to its folder (the full path is the tooltip).
- The status pill carries the plan page's status glyph. Under it, an open plan shows how many questions wait on you and the step running now, or when its agent was last seen. A finished run shows its review verdict: Approved, Denied, or Iterate requested.
- The progress meter shows its percent beside the bar and is colored by state: blue while open, green when complete, amber when stopped. Completion that has not started reads "Not started" instead of a second "Idle".
- The Started column also shows how long the plan has been open or how long the run took, and how many files it changed.
- The period's window sits beside the period tabs ("Today · Nov 15, 12:00 AM – 9:24 PM"). The note on how the numbers are counted moved to the foot of the page.

### Notes

The local and hosted dashboards share the new layout, CSS, and text helpers (`src/dashboardOverview.ts`, `src/dashboardFormat.ts`). `/api/dashboard` adds `questions`, `waiting`, `phaseDone`, `phaseTotal`, `interactionDone`, and `interactionTotal` to its summary; existing fields are unchanged. No registry restart needed beyond the usual version check.
