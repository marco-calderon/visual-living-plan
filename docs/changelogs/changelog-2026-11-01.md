# Changelog — 2026-11-01

## 1.7.9

**PR:** [#110](https://github.com/marco-calderon/visual-living-plan/pull/110)

**Bump:** patch

### Summary

The hosted site keeps one set of pages. Dashboard, account, settings, login, the plan, and version history are the TanStack pages.

### Improvements

- The Worker no longer returns a second HTML copy of the dashboard, account, settings, login, plan, or version history. The browser already opened the TanStack pages for those addresses.
- Sign-in, the account dashboard data, plan hosting, and the Durable Object are unchanged.

### Notes

No registry restart needed. `live-plan dashboard` and `live-plan tui` still use the local service.

## 1.7.10

**PR:** [#111](https://github.com/marco-calderon/visual-living-plan/pull/111)

**Bump:** patch

### Summary

A tap on a contents row opens that section, including on iPad.

### Bugs fixed

- Tapping a contents row follows that section or workflow step. The label and icon no longer take the touch without navigating.

### Notes

No registry restart needed beyond the usual version check.

## 1.7.11

**PR:** [#109](https://github.com/marco-calderon/visual-living-plan/pull/109)

**Bump:** patch

### Summary

The architecture page now explains both hosts and how a plan page is rendered, for someone new to the repo.

### Improvements

- The architecture page explains the local Bun service, the TanStack Start app, the Worker, Durable Objects, D1, Better Auth, and the browser MDX compile behind PlanShell. The repository README links that page.

### Notes

Docs only. No registry restart needed. The hosted pages are the TanStack routes. The Worker does not keep a second HTML copy.

## 1.7.12

**PR:** [#113](https://github.com/marco-calderon/visual-living-plan/pull/113)

**Bump:** patch

### Summary

Plan saving and the hosted APIs live in one place. Local plans use SQLite. Hosted plans stay in D1. HTTP routes are Elysia apps.

### Improvements

- The hosted account, plan catalog, published versions, and Durable Object moved from `cloud/` into `src/host`. D1 migrations are `src/migrations`. Deploy from the repository root.
- The local service stores sessions, submissions, finished runs, and document history in `registry.sqlite` through one SQLite store.
- Local and D1 now use the same plan tables. A plan row keeps the columns queries filter, and configuration sits in `meta`. Better Auth tables are created locally and left empty. Sign-in stays on the host.
- Hosted HTTP routes and the Durable Object's plan routes are Elysia. TanStack pages, Better Auth, and the live Durable Object socket stay.

### Notes

No registry restart needed beyond the usual version check. The next local open folds an older registry into the shared tables. Redeploy the Worker and apply D1 migrations, including `0004_one_schema` (`npm run host:migrate` locally, `wrangler d1 migrations apply` in production). A local plan's older `mdx/*.sqlite` history is not copied; the next open saves the current document in `registry.sqlite`.
