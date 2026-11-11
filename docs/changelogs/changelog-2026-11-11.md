# Changelog — 2026-11-11

## 2.21.0

**PR:** link once known

**Bump:** minor

### Summary

Commands that wait on a plan now survive a dropped connection, a restart of the plan service, or a crash, and nothing sent meanwhile is lost. One `events --follow` can now serve a whole plan: it prints a line each time the mode changes, and `mode review --iteration N` asks for a verdict without a separate blocking `review`.

### Bugs fixed

- `watch` and `events --follow` exited when the plan service was down for more than a second, or crashed, and missed every comment sent after it came back. They now reconnect and print what was sent meanwhile.
- `wait` and `review` reported "Timed out" the moment the plan service restarted, with most of their timeout left. They now reconnect until their own `--timeout`.
- A listener that used the local service token was refused after the service restarted with a new one. It now reads the new token.
- Running `review` again after the person approved while nothing was listening cleared the approval from the page and waited for hours. The verdict is now kept and printed at once.
- On a hosted plan, `review --cloud` for the next round returned the previous round's verdict at once. A new round now clears a verdict the agent already received, and the hosted plan records the round number.
- A failed delivery ack was never retried while the command kept running. It is retried, and a row still pending after a reconnect is acked without being printed twice.

### Improvements

- A plan service on this machine that crashed is started again by the command that was waiting on it. A service stopped on purpose stays stopped, and a running service is never restarted by a waiting command.
- A connection that went silent, after a laptop sleep or a network change, is noticed within about a minute and reconnected. On a hosted plan the CLI now pings its socket.
- While reconnecting, commands print `Lost the plan stream (...)` and `Reconnected to the plan stream.` on stderr. stdout stays JSON lines.
- `wait` and `review` exit `4` when the stream was refused or never connected, and `3` only when their timeout runs out.
- `mode review` is refused while the person's last verdict has not reached any agent, with a message to run `events` first.
- The live-plan skill and the agent guidelines describe the single-listener flow and what to do when a connection drops.

### New features

- `events --follow` and `watch` print `{"event":"mode","data":{"mode":"review","iteration":2}}` whenever the session moves to another mode or review round.
- `mode --iteration N` sets the review round, locally and on a hosted plan.

### Notes

No plan format changes. The plan service restarts once when this version first connects, as with every version change, and attached listeners now reconnect through it. `SHELL_CACHE_VERSION` moves to 2.21.0.
