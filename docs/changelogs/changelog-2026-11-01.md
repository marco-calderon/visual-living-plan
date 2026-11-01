# Changelog — 2026-11-01

## 1.7.9

**PR:** (link once opened)

**Bump:** patch

### Summary

The hosted site keeps one set of pages. Dashboard, account, settings, login, the plan, and version history are the TanStack pages.

### Improvements

- The Worker no longer returns a second HTML copy of the dashboard, account, settings, login, plan, or version history. The browser already opened the TanStack pages for those addresses.
- Sign-in, the account dashboard data, plan hosting, and the Durable Object are unchanged.

### Notes

No registry restart needed. `live-plan dashboard` and `live-plan tui` still use the local service.
