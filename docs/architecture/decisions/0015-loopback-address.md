# ADR 0015: Publish the loopback service as 127.0.0.1

- Status: Accepted
- Date: 2026-10-22

## Context

[ADR 0010](0010-local-hostname.md) published the loopback service as `living-plan.local`. `.local` is the multicast-DNS suffix (RFC 6762). A hosts-file line was supposed to pin that name to `127.0.0.1`, and port 80 was forwarded so the URL could omit the port.

Resolvers still send `*.local` through mDNS. On macOS that answer can arrive before the hosts file, and it can take long enough to outlast a health check. A non-loopback answer was treated as a conflict, so the pretty URL was dropped and the IP was printed anyway. The CLI already dialed `127.0.0.1` to avoid waiting on that lookup. The name, the hosts-file edits, and the port 80 forward existed only for the browser URL.

## Decision

The loopback service is published as `http://127.0.0.1:9477`. The socket stays on `127.0.0.1`. There is no `.local` name, no hosts-file edit, and no port 80 forward.

- `serve` prints `http://127.0.0.1:9477/plans/<id>/` when the service uses the default host and port.
- A URL whose host is `living-plan.local` or `visual-living-plan.local` is dialed at `127.0.0.1` on the service port. The CLI does not resolve those names.
- `--host` other than loopback is still the address a cloud agent shares.
- `live-plan hostname` is removed. `--no-local-name` and `LIVE_PLAN_LOCAL_NAME` are no longer read.

## Consequences

People and agents open the IP URL. An older printed `http://living-plan.local/...` or `http://visual-living-plan.local/...` URL still reaches this machine's service, because the CLI rewrites it to `127.0.0.1` before connecting. A hosts-file line left by an older install is unused and can be deleted by hand.
