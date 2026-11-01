# ADR 0024: One plan store, Elysia on every HTTP route

- Status: Accepted. The plan tables are one shape as of [0025](0025-one-plan-schema.md)
- Date: 2026-11-01
- Updates: the `cloud/` location in [0022](0022-opt-in-cloud-host.md) and [0023](0023-tanstack-start-page.md)

## Context

Hosted plan saving lived in `cloud/`: Better Auth, the D1 catalog, published versions, and a fetch switch that was not Elysia. The machine service stored sessions, submissions, and finished runs through a separate Drizzle client in `src/db`. Local document history used another `bun:sqlite` file per plan. The two hosts did not share a database mechanism, and the hosted routes were not the same kind of controller as the local service.

TanStack Start already serves the pages. Better Auth already signs in the account. Each hosted plan's live session is already one SQLite Durable Object, and the page and the agent already share its WebSocket.

## Decision

The host code lives in `src/host`. D1 migrations live in `src/migrations`. There is no `cloud/` package.

- One prepared-statement store opens the local database. The service catalog (`plans`, `plan_sessions`, `plan_events`, `plan_runs`) and a plan's document history (`plan_documents`, `plan_snapshots`) are tables in `~/.config/living-plan/registry.sqlite`. Drizzle is not on this path.
- Hosted plan rows and the latest 10 published documents stay in D1. The same SQL the host already used writes those rows. The live session stays in the Durable Object.
- HTTP routes on the machine service, the hosted Worker, and the Durable Object are Elysia apps. A WebSocket upgrade is accepted on the Durable Object before Elysia sees it. Elysia builds a new `Response`, and that copy does not carry the Workers socket.
- TanStack Start still renders the pages. Better Auth still uses D1. `npm run dev` is still the local service. `npm run host` is still the Worker. Deploy from the repository root. `wrangler.jsonc` stays at the root because Wrangler reads it there. The browser client stays in `client/`.

## Consequences

A local plan's older `mdx/<id>.sqlite` history is not copied. The next open writes the current document into `registry.sqlite`. Hosted versions are unchanged: apply `src/migrations` on D1 (`npm run host:migrate` for local workerd, `wrangler d1 migrations apply` for production). Redeploy the Worker from the repository root. No second package install under `cloud/`.
