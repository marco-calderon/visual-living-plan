# ADR 0031: The tier caps plans with an agent listening, not open plans

- Status: Accepted
- Date: 2026-11-07
- Replaces the open-plan count in [ADR 0022](0022-opt-in-cloud-host.md)

## Context

[ADR 0022](0022-opt-in-cloud-host.md) capped open hosted plans per tier: a plan took a slot from `serve --cloud` until it was closed. A plan stays open for hours after its agent stops, so an account filled up with plans nobody was working on. Deleting a plan from the hosted dashboard only hides the row and leaves `plans.status` at `running`, so the hidden plan kept its slot and the person had no way to see why `serve --cloud` was refused.

What the tier is meant to limit is concurrent work: how many agents an account runs against hosted plans at the same time. [ADR 0030](0030-agent-presence.md) already records that on each row as a presence lease.

## Decision

- A slot is a plan with an agent listening: `agentConnected` in `plans.meta` with an `agentCheckedAt` lease under three minutes old. Free is 1, Pro 10, Business 50. Open plans with no agent, closed plans, and hidden plans take no slot.
- The Worker checks the slot when an agent opens `/plans/<id>/api/agent-events`, before the request reaches the plan object. It counts the account's other running plans with a fresh lease. A plan whose own agent already holds a slot may open another stream. Over the cap it answers `402` with the reason. Only a caller with the account session or a bearer is checked, so anyone else still gets the object's `401`.
- `POST /api/plans` (`serve --cloud`, `review --cloud`) applies the same check, so a plan whose agent could not connect is refused before it is published. Registering takes no slot.
- A refused WebSocket upgrade hides its body, so the CLI asks again over plain HTTP and prints the `402` reason instead of `Agent socket failed`.
- Settings → Usage shows "Agents listening" against the tier limit.

## Consequences

An account can keep any number of plans open. Ending `events`, `watch`, `wait`, or `review` frees the slot at once; an agent that disappears without closing frees it when its lease runs out, within three minutes. Two agents that connect in the same instant can both pass the check, so the cap is soft by at most a few streams. Hiding a plan from the dashboard still does not close it.
