# ADR 0032: Each account has a storage limit, and deleting a plan frees its storage

- Status: Accepted
- Date: 2026-11-07

## Context

The host keeps the latest 10 published versions of every plan in D1 (`plan_versions`), with no limit per account. Settings → Usage already showed the bytes those versions take, but nothing stopped an account from growing without bound. Deleting a plan from the hosted dashboard only set `meta.deletedAt`, so its versions stayed and a person had no way to give space back.

## Decision

- An account may keep the bytes of saved versions its tier allows: Free 50 MB, Pro 500 MB, Business 5 GB (1024-based). A version counts its title and body in UTF-8, the same measure Usage shows. Comments, answers, and the plan object's own storage are not counted.
- `POST /api/plans` and `PUT /plans/<id>/source` work out the account's total after the publish: an unchanged document adds nothing, and a plan at 10 versions drops its oldest. Over the limit they answer `413` with the limit and the current total, before the plan object takes the edit, so the page and the saved versions stay the same document. A publish that does not raise the total is always accepted, so an account over its limit can still shrink a plan.
- Deleting a plan from the dashboard (`DELETE /api/account/plans/<id>`) now closes it, sets `plans.status` to `executed`, and deletes its saved versions. The row stays with `deletedAt`, so the id is not reused.
- `GET /api/account/usage` adds `storageCap`, `socketCap`, and `idleMs`. Settings → Usage shows Stored against the limit with a meter that turns amber from 80% and red when full, with a note that new versions are refused. On a phone the three cards stack, 16px padded and 12px apart, per DESIGN.md.

## Consequences

`serve --cloud` and its file watcher print the `413` reason when an upload is refused. A deleted plan cannot be reopened from its saved versions. Two publishes in the same instant can both pass, so the limit can be passed by about one version.
