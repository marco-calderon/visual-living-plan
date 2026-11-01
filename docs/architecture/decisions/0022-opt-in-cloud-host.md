# ADR 0022: An opt-in cloud host

- Status: Accepted. The page host in the consequences is updated by [0023](0023-tanstack-start-page.md). Where that code lives is updated by [0024](0024-one-plan-store.md).
- Date: 2026-10-30

## Context

[ADR 0004](0004-one-plan-service.md) keeps one Bun process on the machine. A person who is not on that machine cannot open the page. Putting the same plan on a shared host needs three credentials: an account session, a plan bearer the agent keeps, and a viewer cookie a review link can set. Cloudflare Access is a team gate for a staging hostname. It is not the product login.

The local registry, loopback pages, and LAN publishing stay the default. A failed cloud sign-in must not start that registry.

## Decision

`serve` and `review` take `--cloud`. Without the flag they still use the machine service. With the flag they do not start that service, and they do not fall back to loopback. `--cloud` and `--no-registry` together exit 1.

- `live-plan account login --url https://host` (or `LIVE_PLAN_CLOUD_URL`) opens a loopback callback and stores the account bearer in `~/.config/living-plan/cloud.json`. `LIVE_PLAN_HOME` still moves that directory.
- The first upload asks the account to register the plan. The server mints `cloudId`, the CLI writes it into the plan frontmatter, and stores the plan bearer in `cloud.json`. The bearer is not written into the plan file.
- `events`, `wait`, `watch`, `review`, `mode`, `execution`, `addressing`, `reply`, `address`, and `close` send that plan bearer when the URL belongs to the signed-in host. `dashboard`, `tui`, `logs`, and `lan` stay on the local service.
- The host is a Worker in `cloud/`. Better Auth (email and password, and Google or GitHub when those secrets are set) uses one D1 database. Each plan is one SQLite Durable Object. The page and the agent share a hibernating WebSocket. Local pages keep the existing event stream.
- `GET /plans/:id/view/:sig` sets the viewer cookie. The owning account can open the plan. The plan bearer uploads source and reads the agent socket.
- Open plans, sockets, and idle time follow the account tier. Free is 1 plan, 2 sockets, and 1 hour. Pro is 10, 4, and 6 hours. Business is 50, 50, and 6 hours. Reattaching a plan does not take another slot. There is no billing screen. `user.tier` in D1 is the switch until billing exists.
- Cloudflare Access stays off the production hostname.

While `serve`, `review`, `events`, `wait`, or `watch` runs, that process watches the plan file and uploads source, the theme file beside it, and the git snapshot. `serve --cloud --detach` leaves a `cloud-watch` process. `close` stops that process and deletes the plan. A missing watcher is not fatal: the next command uploads first. A stale revision is HTTP 409, and the CLI retries once with the current revision.

## Consequences

A cloud plan's id is `cloudId` in the file, not the hash of the local path. TanStack Start serves the pages ([0023](0023-tanstack-start-page.md)). The Worker keeps the account session, plan APIs, the Durable Object, and auth. It does not return HTML documents. The account bearer registers a plan. The plan bearer uploads and reads submissions. A viewer cookie reads and submits on the page. An https plan URL is not rewritten onto `127.0.0.1`.

Each source upload is a published version of the plan document. The Worker stores that markdown in D1 (`plan_versions`) and keeps the latest 10 versions. Publishing an 11th deletes the oldest. The Durable Object still holds the live session. Loopback snapshots and the registry plans folder are unchanged. `/dashboard` on the host is the plans dashboard. `/account` and `/settings` are separate pages. `/` and `/review` redirect to `/dashboard`. Those pages are Start routes.
