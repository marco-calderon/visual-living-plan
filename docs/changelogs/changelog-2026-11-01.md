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
