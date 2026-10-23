# Submission delivery showcase runbook

Click target: `examples/submission-delivery.plan.md`.

The guide serves that file, then walks these steps in order. Do only the step marked current. Say when it is done. The guide reads the JSON, restarts the right client, and names the next click.

Commands below are what the guide runs from this repo. `events` prints one JSON object per line, `{ "event", "id", "seq", "data" }`, then exits. `watch` prints the same shape and stays up.

## Before the first click

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun src/cli.ts check examples/submission-delivery.plan.md
bun src/cli.ts serve examples/submission-delivery.plan.md --detach --no-open
bun src/cli.ts mode comment --url "$URL"
```

`events` is not started yet. The mode chip on the page should say `comment`.

## 1. Comment while events is down

Click the callout **Comment grab**. Type `queued while events was down`. Send.

Expected before the guide starts `events`: the page shows the comment, and no CLI is running.

The guide then runs `events --url "$URL"`.

Expected: one `comment` line whose `data.text` is that message, then the process exits `0`. A second `events` is not left running.

## 2. Comment while events is waiting

The guide starts `events` and leaves it running.

Click **Comment grab** again. Type `listener was waiting`. Send.

Expected: `events` prints one `comment` line and exits. The guide starts `events` again. That process stays running, because the server has nothing left to deliver.

## 3. Marking addressed does not deliver an event

With `events` still waiting, open the same comment and click **Mark addressed**.

Expected: `events` does not print and does not exit. Addressing is not a submission.

## 4. Two submissions queued, one events process

The guide stops `events` and switches the page to `watch`. The mode chip must say `watch`. Comment grab has to be off or the choice click opens a comment instead.

Click **This choice plus a comment**.

Press **Comment** (or `C`). Click the choice section. Type `queued with the choice`. Send. Press **Comment** again so the chip says `watch`.

The guide starts `events` once.

Expected: two JSON lines, the `interaction` for `delivery-shape` and the `comment`, in seq order. The process exits once. The guide starts `events` again and it stays waiting.

`data` for the choice:

```json
{ "kind": "choice", "id": "delivery-shape", "optionId": "choice-and-comment", "label": "This choice plus a comment" }
```

## 5. Form while events is waiting

Chip says `watch`. Fill **Your name**, leave the select on `1`, click **Submit**.

Expected: `events` prints one `interaction` for `batch-note` and exits. `data.kind` is `form`, `data.values.observer` is the name, `data.values.batch` is `"1"`. The guide starts `events` again.

## 6. Questions while events is waiting

Chip says `watch`. Answer both questions. Click **Send answers**.

Expected: one `interaction` for `reconnect-notes`. `data.kind` is `questions`. `data.answers["0"]` and `data.answers["1"]` are the two texts. The process exits. The guide starts `events` again.

## 7. Approve-gate denial

Chip says `watch`. On **Deny this gate. Execution should not start.** click **Deny**. Optional note: `hold`.

Expected: one `interaction` with `id` `hold-execution`, `approved` `false`, and `note` `hold` when you typed one. The process exits. The guide starts `events` again and does **not** start `watch`. The new `events` stays waiting.

## 8. Review denial

The guide switches the page to `review` and leaves `events` waiting. The bottom bar shows **Deny**. The corner shows **Approve**.

Click **Deny**. Do not click the corner Approve.

Expected: one `review` line, `data.decision` `deny`. The process exits. The page returns to watch. The guide starts `events` once more and does **not** start `watch`.

## 9. Review iterate

The guide switches the page back to `review`. This page has no Iterate button. The guide posts `{ "decision": "iterate", "note": "showcase iterate" }` to `/api/review`.

Expected: one `review` line, `data.decision` `iterate`. The process exits. The page stays in review. The guide starts `events` again and does **not** start `watch`.

## 10. Review approve, then watch

`events` is still the waiting client. The guide switches to `review` if the chip is not already `review`.

Click the corner **Approve**.

Expected: one `review` line, `data.decision` `approve`. `events` exits. The guide does **not** start `events` again. It starts `watch --url "$URL"` and leaves that process running. The chip says `watch`. Stderr from watch says it stays running until execution is finished.

## 11. Execution, with watch left running

The guide runs `execution start`, updates the plan file (phase `execute` becomes `active`, checklist items flip as steps finish), and `execution push` when the workflow graph changes.

Click **Comment** and send `comment during execution` on the **Watch stays up during execution** phase.

Expected: `watch` prints that `comment` and the process is still running. The form and review controls are locked. The guide does not stop `watch`.

The guide runs `execution stop`. The lock banner goes away. Then the guide stops `watch`. That is the first time watch is closed.

## 12. After watch closes

The guide starts `events` one more time.

Expected: if you sent nothing else, `events` stays waiting. If you sent a comment after watch exited, that line prints immediately and the process exits, and the guide starts `events` again.

## What not to overlap

Do not leave `events` and `watch` running together. Both would see the same live notice, and only one ack is recorded.

Do not approve **Approve this gate to start the execution watch** during steps 1–9. That gate is the alternate approval path. Use it only if step 10 was skipped: the guide treats `approved: true` the same as review approve and switches from `events` to `watch`.
