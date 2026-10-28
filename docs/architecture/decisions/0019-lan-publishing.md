# ADR 0019: Opt-in LAN publishing

- Status: Accepted
- Date: 2026-10-28

## Context

The plan service listens on `127.0.0.1:9477`. Browser submissions are open because only this machine can connect. The agent stream checks a bearer token. [ADR 0016](0016-loopback-address.md) publishes that service as `http://127.0.0.1:9477` and keeps the CLI on loopback so it never waits on mDNS.

[ADR 0010](0010-local-hostname.md) tried to name the loopback service `living-plan.local`. Resolvers drop a multicast answer whose address is loopback, and macOS can answer `*.local` slowly enough to fail a health check. That name was removed. This decision does not bring it back for the CLI.

People on another device on the same network still need a way to open the page. `--host` other than loopback already binds a reachable address for a cloud agent. It does not advertise the service or open a firewall port. A fresh install must not do those things.

## Decision

LAN publishing is off until someone on that machine turns it on. `live-plan lan on` stores the choice under `~/.config/living-plan`. Later service starts honor it. `live-plan lan off` turns it off and rebinds to loopback. A fresh install does not publish, bind widely, or touch the firewall.

[ADR 0016](0016-loopback-address.md) stays accepted. The CLI still dials `127.0.0.1` and still rewrites legacy `living-plan.local` URLs onto that address. It does not resolve `*.local`.

- `lan on` stores the preference, starts or restarts the service, and prints the LAN URL. `lan off` clears the preference, withdraws the announcement, removes a firewall rule this tool added, and restarts on `127.0.0.1`. `lan status` prints whether it is enabled, the bind address, the advertised name, the LAN URL, and the firewall result.
- With LAN enabled and no explicit non-loopback `--host`, the service listens on all interfaces. The registry lock still tells the CLI to dial `127.0.0.1`. An explicit `--host` other than loopback keeps its current meaning and is what gets advertised when that address is local.
- While LAN mode is on, the service publishes a DNS-SD record: instance `Living Plan`, type `_http._tcp`, host `living-plan.local`, port equal to the bound port. The A or AAAA record is a private LAN address on a real interface, preferring the default-route interface. It is never `127.0.0.1`, `::1`, or a link-local address. If none exist, `lan on` reports that it cannot advertise, does not open the firewall, and leaves the loopback service usable.
- On macOS, registration goes through the system mDNS daemon when it already owns UDP 5353. On Linux, Avahi is used when it is running. Otherwise the process answers. The announcement is withdrawn on `lan off` and when the service exits. The TXT record is the port and the product name only.
- Firewall changes are best effort: the macOS Application Firewall, Linux `ufw` or `firewalld` when present, and Windows `netsh advfirewall`, for inbound TCP on the service port from the local network. A missing tool, missing admin rights, or a failed command logs a warning and prints the manual command. `lan on` and `serve` still succeed. Only a rule this tool added is removed on `lan off`.
- A non-loopback peer needs a secret stored in the config home (mode 0600) before it can read a plan page or call a plan API. The LAN URL carries that secret. Visiting it sets a cookie and redirects to the dashboard, or to a relative `next` path. mDNS discovery alone does not grant access. Other non-loopback requests get 401. Loopback peers stay open. The agent stream still requires its bearer token on every peer.
- `serve` and `review` keep printing `http://127.0.0.1:9477/plans/<id>/` when the service is reached on loopback, including when the socket is bound to all interfaces. The LAN URL is printed only by `lan on` and `lan status`.

`--no-registry` private servers are unchanged. There is no HTTPS redirect, no port 80 forward, and no hosts-file edit.

## Consequences

Other devices open the printed LAN URL. Agents keep the loopback URL `serve` prints and do not look up `living-plan.local`. Turning LAN off stops the advertisement and returns the next service start to `127.0.0.1`.
