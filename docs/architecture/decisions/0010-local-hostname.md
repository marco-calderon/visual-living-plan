# ADR 0010: Publish the loopback service as living-plan.local

- Status: Accepted
- Date: 2026-10-15

## Context

The plan service listens on `127.0.0.1:9477`. People and agents open that IP and port. A stable local name is easier to remember, and a URL with no port is easier still.

`living-plan.local` cannot be registered in public DNS. `.local` is the multicast-DNS suffix (RFC 6762). Three ways to make the name reach this machine were considered:

- A hosts-file line, `127.0.0.1 living-plan.local`. On a resolver that reads the hosts file before DNS (`hosts: files dns` on this system), both the browser and the CLI resolve it to loopback. `living-plan.localhost` was rejected: browsers treat `*.localhost` as loopback, but glibc on Linux does not, so the CLI could not call that URL.
- An in-process mDNS answer of `living-plan.local` to `127.0.0.1`. Resolvers often drop a multicast answer whose address is loopback, and this environment has no mDNS daemon. The app does not depend on that path.
- Moving the service itself to port 80. Browsers omit the port only for 80 and 443. Binding 80 requires privilege, and the stable service port is 9477.

The socket has to stay on loopback. Browser submissions are open without the agent token because only the local machine can connect. `--host` remains the way a cloud agent publishes a reachable address.

## Decision

For a loopback service on a fixed port, the printed origin is `http://living-plan.local` when that name resolves only to loopback. The listen address stays `127.0.0.1`.

- The service adds `127.0.0.1 living-plan.local` to the hosts file, marked `# visual-living-plan`, when it can write the file or when passwordless `sudo` can. `live-plan hostname install` does the same and may prompt. `live-plan hostname remove` deletes only the marked line.
- If the name already resolves to any address that is not loopback, the hosts file is left unchanged and the URL stays on the bind address.
- When the service is on the default port 9477, it also accepts loopback port 80 so the URL can omit the port. It binds 80 in-process when the process is allowed to. Otherwise a passwordless `sudo` helper binds `127.0.0.1:80`, drops to the invoking user, and copies bytes to 9477. Port 80 is left alone when something else is already listening. If 80 cannot be opened, the URL is `http://living-plan.local:9477`.
- `--host` other than loopback does not use this name. `--no-local-name` and `LIVE_PLAN_LOCAL_NAME=0` keep the IP URL. A random port, including the ports tests bind, stays on the IP.

## Consequences

Agents keep using the URL `serve` prints. A person on the same machine can open `http://living-plan.local/plans/<id>/` when the name is installed and port 80 is open. A cloud agent that must share a URL still passes `--host` with a reachable address. On macOS, mDNS can still answer `.local` before the hosts file; a non-loopback answer is treated as a conflict and the IP URL is kept.
