---
title: Form controls
summary: Checkbox lists and steppers save as you change them. A text form still uses Submit, then Edit.
agent: local-cursor
mode: watch
---

# Form controls

Check a box or step a number and the plan stores it immediately. A text form keeps Submit on the right. After you submit, Edit unlocks the fields and the next submit replaces the saved answer.

<Row>
<form id="prod-switch" prompt="Prod switch">
<field name="windows" label="Prod switch" type="checkbox" options="Each window: after the hourly monorepo copy publishes the 01:00 ET unpause run's changesets (about 01:24 ET) and before the next BOLP run (00:05 ET) no PENDING or RUNNING changeset, Window 1: coe_budgets live; the next run's summary reads route api; land the Terraform value, Window 2 a few days later: create prod's Google Ads operations service and 60m copy, Window 2: coe_enables live too; re-enables appear as queued operations; land the Terraform value, Window 2: check no changeset is in flight then pause the monorepo changeset-publish copy, Window 2: add the 'a copy went quiet' rule after the 60m copy's first clean run" />
</form>
<form id="watch" prompt="Watch">
<field name="checks" label="Watch" type="checkbox" options="Day 1: sample 20 applied budgets; amounts in Google Ads match budget_change, Every re-enable has reenable_ts only after the campaign is ENABLED, No unexplained FAILED operation; the queue backlog drains each hour, Seven days of both writers live in prod with no rollback and no unexplained alert" />
</form>
</Row>

<Stack>
<form id="copies" prompt="Copies">
<field name="copies" label="Copies" type="stepper" default="1" min="0" max="8" step="1" />
</form>
<form id="note" prompt="Rollout note">
<field name="note" label="Note" type="text" required="true" placeholder="What should the agent remember?" />
</form>
</Stack>

<callout id="access" kind="note" title="Nested list">
<Stack>
<form id="scopes" prompt="Scopes">
<field name="scopes" label="Scopes" type="checkbox" options="read, write, admin" />
</form>
</Stack>
</callout>

<workflow id="forms" title="Form controls">
```workflow
prod-switch | Prod switch | prod-switch
watch | Watch | watch
copies | Copies | copies
note | Rollout note | note
scopes | Scopes | scopes
--
prod-switch -> watch
watch -> copies
copies -> note
note -> scopes
```
</workflow>
