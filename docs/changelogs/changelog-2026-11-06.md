# Changelog — 2026-11-06

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
