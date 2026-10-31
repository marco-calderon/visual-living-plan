# ADR 0023: The cloud plan page is TanStack Start

- Status: Accepted
- Date: 2026-10-30
- Updates: the page-serving sentence of [0022](0022-opt-in-cloud-host.md)

## Context

[ADR 0022](0022-opt-in-cloud-host.md) puts an opted-in plan on a Worker. The account, the plan bearer, and the viewer cookie stay. Each plan is one SQLite Durable Object, and the page shares a hibernating WebSocket with the agent. The local machine service stays the default.

The Worker was also the HTML document: a string page that loaded the Vite client from `/client/`. The browser compiled the plan MDX and rendered the React entries. That compile cannot move into the Worker, because a request there cannot eval generated code. The page host can change without moving the compile or the session.

## Decision

`start/` is the cloud page. It is a TanStack Start app on the same Worker as `cloud/`.

- `GET /plans/:id` renders the plan with the existing MDX client and comment layer. The browser compiles the source, as it does on loopback.
- `GET /login` is the account form. It posts to the existing Better Auth routes. `GET /local` renders the same client with no account and no Durable Object.
- WebSocket upgrades, `/api/*`, plan writes, the viewer link, version history, and `/dashboard`, `/account`, and `/settings` stay on the Worker in `cloud/`. `/` and `/review` still redirect to `/dashboard`.
- The local Bun service, loopback on `127.0.0.1`, `--no-registry`, and LAN publishing are unchanged. `--cloud` is still opt-in.

## Consequences

A cloud plan URL is served by `start/src/server.ts`. That module exports the Durable Object and delegates every session request to the Worker fetch. The string plan page in `cloud/src/page.ts` remains for a Worker started from `cloud/` alone. New cloud pages go through Start.

`cd start && npm run migrate:local && npm run dev` runs the host on local workerd, including D1 and the Durable Object. Production still sets `BETTER_AUTH_SECRET` as a secret. The value in `start/wrangler.jsonc` is for that local process only.
