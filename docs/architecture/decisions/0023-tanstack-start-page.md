# ADR 0023: TanStack Start is the web application

- Status: Accepted
- Date: 2026-10-30
- Updates: the page-serving sentence of [0022](0022-opt-in-cloud-host.md). Where the host code lives is updated by [0024](0024-one-plan-store.md).

## Context

[ADR 0022](0022-opt-in-cloud-host.md) puts an opted-in plan on a Worker. The account, the plan bearer, and the viewer cookie stay. Each plan is one SQLite Durable Object, and the page shares a hibernating WebSocket with the agent. The local machine service stays the default.

The Worker was also the HTML document: a string page that loaded the Vite client from `/client/`. The browser compiled the plan MDX and rendered the React entries. That compile cannot move into the Worker, because a request there cannot eval generated code. The page host can change without moving the compile or the session.

## Decision

TanStack Start is the web application. It lives at the repository root, on the same Worker as `cloud/`. There is no separate app directory.

- Every page is a Start route: `/`, `/review` (both redirect to `/dashboard`), `/login`, `/dashboard`, `/account`, `/settings`, `/plans/:id`, `/plans/:id/history`, `/local`, and `/sample`.
- `GET /plans/:id` renders the plan with the existing MDX client and comment layer. The browser compiles the source, as it does on loopback. `/local` renders that same page with no account and no Durable Object.
- WebSocket upgrades, `/api/*`, plan writes, the viewer link, `/plans/:id/document`, and `/plans/:id/versions/:n` stay on the Worker in `cloud/`.
- The local Bun service, loopback on `127.0.0.1`, `--no-registry`, and LAN publishing are unchanged. `npm run dev` is still that service. `--cloud` is still opt-in. The library client bundle is `vite.client.config.ts`.

## Consequences

`src/entry.ts` exports the Durable Object and delegates session requests to the Worker fetch. `npm run host` runs the application on local workerd, including D1 and the Durable Object. Apply migrations with `npm run host:migrate`. Production still sets `BETTER_AUTH_SECRET` as a secret. The value in `wrangler.jsonc` is for that local process only.

The Worker does not return HTML for `/`, `/review`, `/login`, `/dashboard`, `/account`, `/settings`, `/plans/:id`, or `/plans/:id/history`. Those pages are Start routes. `cloud/` keeps the session, plan APIs, Durable Object, and auth that those routes and the CLI call.
