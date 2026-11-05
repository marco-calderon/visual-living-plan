# ADR 0028: Hosted plans open only for the owning account

- Status: Accepted
- Date: 2026-11-03
- Supersedes: the viewer cookie in [ADR 0022](0022-opt-in-cloud-host.md)

## Context

[ADR 0022](0022-opt-in-cloud-host.md) let a signed link, `GET /plans/:id/view/:sig`, set a viewer cookie that reads and submits on a plan with no account. The signature was an HMAC of the plan id alone. It never expired, it could not be revoked for one plan (only by rotating `BETTER_AUTH_SECRET`, which also signs everyone out), and anyone the link reached got in. `serve --cloud` opened that link on every publish, so it was easy to pass on by accident.

Every hosted plan should be behind an account.

## Decision

- Only the signed-in account that owns a plan can read it, submit on it, or open its socket. The plan bearer keeps uploading source and reading the agent socket.
- `GET /plans/:id/share` is gone. `GET /plans/:id/view/:sig` grants nothing. It clears the old cookie and redirects to `/plans/:id/`, which sends a signed-out visitor to `/login`.
- A signed-in account that does not own the plan gets 403 on the plan page. A signed-out visitor gets 401.
- `serve --cloud` opens the plain plan URL.
- One function in `src/host/app.ts`, `planAccess`, decides the role of a request on a plan. The `viewer` role stays in `src/host/access.ts` and the Durable Object.

## Consequences

Links already shared stop working. The person who opens one is asked to sign in, and only the owner gets in.

Sharing is a follow-up. It adds a share list for each plan in D1 and returns `viewer` from `planAccess` for an account on that list. Accounts are not email-verified yet, so a share should be accepted by a signed-in account from an invite link, not granted to a typed email address.
