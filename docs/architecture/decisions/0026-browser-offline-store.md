# ADR 0026: A device copy of the open plan

- Status: Accepted
- Date: 2026-11-02

## Context

The page already caches the app shell. That cache is HTML, JavaScript, CSS, and static assets. It is not a copy of the plan. A person who loses the network can open the shell and still cannot read the document or send an answer.

The local registry (`~/.config/living-plan/registry.sqlite`), hosted D1, and the plan Durable Object already store the document, submissions, and account. Replacing any of those with a browser database would split the authority the agent and the CLI already use.

OPFS and service workers exist only in a secure context. Loopback and HTTPS qualify. A plain HTTP LAN origin (`http://192.168.x.x`, `http://living-plan.local`) does not.

## Decision

On a secure origin the page opens one OPFS database, `living-plan.sqlite`, with TanStack DB. Collections are the open plan, comments, hosted dashboard summaries, and appearance. The plan body is capped and older source bodies are evicted. The outbox is never evicted. Compiled MDX is not stored.

Submissions use `@tanstack/offline-transactions`. Each attempt sends `Idempotency-Key` and the plan row's `baseRevision`. The local session stores the ledger in `plans.meta`. The Durable Object stores it in its meta key `idempotency`. The same key and body return the stored result and do not append another event. A different body is `409`. `401` waits. `409` stops that attempt and shows a failure.

An agent write (source or an execution-active change) bumps the revision and replaces the source. A person's submission does not bump the revision, so later queued writes still match. While online, HTML comes from the network. The shell cache is the fallback when that fetch fails. Plan JSON stays out of the cache.

The title bar shows offline, a pending count, or one failed write. There is no new settings page. Settings use `updatedAt` and are not part of the plan outbox.

Plain HTTP LAN pages do not open the database. They keep today's network reads and writes.

## Consequences

`GET /api/snapshot` is the sync read on both hosts. Existing POST routes stay. A client that omits the key and `baseRevision` keeps the previous behavior. The browser file holds the plan the person could already see. It does not hold the plan bearer, the account token, or the LAN secret. Opening the registry does not change. A LAN URL on plain HTTP stays network-only.
