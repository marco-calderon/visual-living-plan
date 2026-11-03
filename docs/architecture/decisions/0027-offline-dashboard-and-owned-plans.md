# ADR 0027: Offline dashboard and owned plans

- Status: Accepted
- Date: 2026-11-02

## Context

[ADR 0026](0026-browser-offline-store.md) stores the plan that is open and a thin list of the dashboard period on screen. That is not enough to open the installed app with no network.

`/` is a redirect, so the start URL has no cached document. Dashboard links are full page loads, and the device only kept plans the person had already opened, four at a time. Lazy chunks for a plan page were cached only after they loaded once. Switching Today, Week, and Month called the account server function and failed offline. The service worker cannot read `Cookie`, so a cookie hash never separated accounts, and sign-out left the previous person's pages and database on the device.

## Decision

The shell worker precaches the client build from `/precache-manifest.json` at install. One failed asset does not fail install. A missing manifest, as on the dev server, is skipped.

The installed app starts at `/dashboard`. The manifest `id` stays `/`. `/` with no network uses the cached dashboard. Dashboard periods share that one document. A document that is not cached, including a plan page this device has not stored, is a small offline notice that links back to the dashboard.

On a secure origin, while online and not in data-saver mode, the dashboard stores the account and each period. Every other hosted page (not sign-in, not a local plan page) refreshes the account's plan list and warms the plans that are due. When the tab or installed app becomes visible or focused, or the network returns, the list is re-read (at most once every 30 seconds) so plans made elsewhere are saved too. There is no background timer. It warms up to 50 owned plans, most recent first: the snapshot goes into the device database, and the plan HTML goes into the shell cache. A plan is skipped when its `heartbeatAt/storedPath` is unchanged and it was warmed in the last 10 minutes. Owned plans within that cap stay. Plans the person no longer owns are dropped when the owned list refreshes. A plan that was only opened, not owned, still keeps the last four. The plan open on screen is kept so that page does not go blank.

The dashboard reads those stored periods when the account request fails because the network is down. A real unauthorized response still goes to sign-in. History and the plan file need the network and are marked that way while offline. Writes stay on the existing outbox.

Sign-out asks before discarding unsent writes, then clears the device collections and every cached document. Sign-in drops cached documents so the next account does not see the previous account's HTML. The collection schema version stays 1. A bump resets every collection under TanStack's default mismatch policy and would drop plan rows the outbox still points at. The account and dashboard collections are new ids at that same version. The outbox stays in IndexedDB and is cleared only after the person confirms sign-out with pending writes.

## Consequences

The first online visit after a plan exists is what puts it on the device. The page writes each plan document into the shell cache after the worker is ready, and the warm record stores that cache name. A new shell cache makes every owned plan due again. An error from the host is not marked saved. Fifty is a cap, not a full archive. A plan past the cap, or one that has not been warmed yet, shows the offline notice. Plain HTTP on the LAN stays network-only. The registry, D1, and the Durable Object remain the authority.
