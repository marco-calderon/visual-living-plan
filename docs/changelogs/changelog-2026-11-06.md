# Changelog — 2026-11-06

## 2.12.0

**PR:** [#162](https://github.com/marco-calderon/visual-living-plan/pull/162)

**Bump:** minor

### Summary

Forms on a hosted plan no longer fail after the agent reconnects or edits the plan, Edit unlocks a submitted form, a choice can be changed, and `events --follow` delivers each submission the moment it arrives.

### Bugs fixed

- A hosted page's next answer no longer fails as "stale" after the agent restarts `events`, `wait`, or `watch`. An unchanged plan file keeps its revision.
- A hosted page now hears the new revision when the agent edits the plan or starts or stops execution, so its next answer is accepted.
- Edit on a submitted form now unlocks the fields. It used to send the old values again and lock the form.
- `addressing` on a hosted plan shows the comment as Addressing. It used to resolve the comment.
- `events` reconnects when the host closes an idle connection, instead of exiting with nothing printed.
- A choice can be changed after the first pick. Picking another option replaces the answer and sends a new event. It locks only while execution is active.

### New features

- `events --follow` stays connected and prints each submission as it arrives, without switching the page mode. An agent that reacts to each line no longer leaves a gap between events.

## 2.11.0

**PR:** Not opened yet

**Bump:** minor

### Summary

Sign in the CLI on a machine with no browser, such as a VM or a cloud agent. Open a page on any device, then paste the command it shows into the terminal.

### Improvements

- When no browser opens, `account login` now points to `--headless`.
- The Account page links to Terminal sign-in.

### New features

- `live-plan account login --url <host> --headless` prints `<host>/cli-token` and exits at once.
- The `/cli-token` page asks the person to sign in or sign up, then shows `live-plan account login --url <host> --token <token>` with a Copy button. Each token is its own 30-day session, so signing out in the browser does not sign the terminal out.
- `account login --token <token>` checks the token with the host before saving it to `~/.config/living-plan/cloud.json`. A bad or expired token exits 1 and points back to the page. `--token -` reads the token from stdin.

### Notes

No database migration. The token is a row in the existing `session` table.

## 2.10.0

**PR:** #160

**Bump:** minor

### Summary

Plans can be deleted from the dashboard without losing their data, and each plan row has fewer buttons. Folder, Files, and Duration are no longer table columns.

### Bugs fixed

- The row menu on the hosted dashboard showed its icons above the text with no space between them. Icons and text now sit on one centered line with a gap.
- The Delete entry and the divider in that menu were not styled on the hosted dashboard. Delete is now red.

### Improvements

- Each dashboard row has one More actions menu with Plan file, Versions (hosted), and Delete. The Open button is gone: the plan title opens the plan while it is running.
- Delete asks first in a confirmation dialog that names the plan, shows progress, and stays open with an error if the request fails.
- The dashboard table drops the Folder, Files, and Duration columns. The data is still stored, and the summary tiles still show it.

### New features

- Delete a plan from the local or hosted dashboard. It sets `deletedAt` in the plan's meta and hides the plan and its finished runs. Nothing is removed. Serving or registering the plan again shows it again. Routes: `DELETE /api/dashboard/plans/:id` (local) and `DELETE /api/account/plans/:planId` (hosted).

### Notes

No registry restart needed beyond the usual version check.

## 2.9.0

**PR:** to be added when the PR opens

**Bump:** minor

### Summary

The dashboard and the plan page now show whether an agent is connected to a plan. A plan is Active only while a `serve`, `events`, `wait`, `watch`, or `review` command is waiting on it. An open plan with no agent waiting reads Idle.

### Bugs fixed

- The dashboard showed every open plan as Running, even when no agent had been connected for hours. An open plan now reads Active only while an agent is connected, and Idle otherwise.
- The dashboard status line said "N plans active" for every plan in the period. It now says how many plans there are and how many have an agent connected.

### Improvements

- Agent presence is an icon, not a label: a green robot while an agent is connected, and a grey struck-through robot while not, so it reads without color. Hovering it says "Agent connected" or "No agent connected" with when it was last seen, and screen readers read the same.
- The plan page shows that icon on the status chip. It follows a connect or a drop without a reload, and a drop shows after a few seconds so `events` starting again does not flicker.
- The dashboard shows the icon next to an open plan's Active or Idle pill. The Plans menu and the Running plans page show it on each plan.
- The terminal dashboard (`tui`) shows Active and Idle, colors Idle grey, and lists plans with an agent before idle ones.
- A CLI command that went away without closing its connection is noticed within about 20 seconds, so its plan does not stay active.

### New features

- Active and Idle filters and summary counts on the local dashboard, the hosted dashboard, and `tui`. Running is no longer a filter.
- Pages receive an `agent` event, and `hello` carries `agent`, with `{ connected, clients, seenAt }`. `/api/dashboard`, `/api/plans`, and `/api/processes` rows carry `agentConnected` and `agentSeenAt`, and the dashboard summary carries `active` and `idle`.

### Notes

Restart the registry to pick this up (the usual version check does it). Hosted plans need this Worker deployed. A hosted plan already open when it deploys shows its agent from the next time the agent connects. The shell cache name is 2.9.0.
