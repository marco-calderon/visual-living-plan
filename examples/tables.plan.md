---
title: Table showcase
summary: Pipe tables in the plan text, and the same tables inside a phase and a callout.
agent: local-cursor
mode: watch
---

# Table showcase

A pipe table in the plan text. The separator row sets alignment: `---` left, `---:` right, `:---:` center.

| Status | Meaning | Lease |
| --- | --- | ---: |
| `PENDING` | Waiting for a producer | — |
| `RUNNING` | A script holds the row | 1h |
| `SUCCEEDED` | The script finished | — |

```workflow
id: showcase
title: Expected execution
nodes:
  - id: queue
    ref: queue
    label: Operation queue
  - id: producers
    ref: producers
    label: Producers
edges:
  - from: queue
    to: producers
```

```phase
id: queue
title: "New generic queue: google_ads_operation"
status: pending
body: |
  **Owner:** `campaigns`. Producers call it in-process, as COE calls `changeset_service` today:

  - COE now;
  - targeting (channel operations) and COE pauses later.

  **Table** `pixability.google_ads_operation` (draft)

  | Column | Purpose |
  | --- | --- |
  | `google_ads_operation_id` | PK |
  | `account_id_ext` | `XXX-XXX-XXXX`, the account the script runs in |
  | `operation_type` | `enable_campaign` now; `pause_campaign`, `set_youtube_channels`, `remove_youtube_channels` later |
  | `target_id` | campaign or ad group id |
  | `payload` | JSON, type-specific (empty for enable; channel ids later) |
  | `state` | `PENDING` → `RUNNING` → `SUCCEEDED` / `FAILED` / `CANCELLED` |
  | `attempt_count`, `leased_at` | lease and retry, as `ad_group_sync_queue.CLAIM_LEASE` (1h); re-offered after expiry, `FAILED` after N attempts |
  | `error`, `completed_at` | what the script reported |
  | `source`, `source_ref` | who asked and for what, e.g. `coe.unpause_safety_pause` + `safety_pause_id`, so a producer can read its results back |

  Plus `created_at`, `updated_at` (with the trigger) and `deleted_at`.

  **Service:** `campaigns/services/google_ads_operations.py`

  - `enqueue(db, operations)` validates every operation against its type's payload.
```

```callout
id: producers
kind: note
title: Who writes a row
body: |
  The same pipe table works in a callout body.

  | Producer | When |
  | --- | --- |
  | COE | now |
  | targeting | when a channel operation needs a pause |
```
