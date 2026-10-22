# ADR 0015: Keep loopback plans on 127.0.0.1

- Status: Accepted
- Date: 2026-10-21
- Supersedes: [0010](0010-local-hostname.md)

## Context

[ADR 0010](0010-local-hostname.md) published the loopback service as `living-plan.local`. That suffix is reserved for multicast DNS. Browsers query mDNS before the hosts file, so a page that is already in `/etc/hosts` can still take seconds to open, and sometimes waits until the resolver times out. The same delay hits Dashboard and other plan links, because those navigations use the published name.

An in-process mDNS answer was already rejected in ADR 0010. Pinning the name in the hosts file does not stop the browser lookup.

## Decision

Loopback plans are published on the bind address, `http://127.0.0.1` with the service port. The service does not install `living-plan.local` or open port 80 for that name unless `LIVE_PLAN_LOCAL_NAME=1`.

Pages rewrite a `living-plan.local` link to `127.0.0.1` before navigation, so a plan opened under the old name does not stall on the next click. `--no-local-name` still forces the IP address.

## Consequences

`serve` prints an IP URL. Opening Dashboard or another plan from that page does not wait on mDNS. `live-plan hostname install` remains for someone who opts in. A cloud agent still passes `--host` when the URL must be reachable from another machine.
