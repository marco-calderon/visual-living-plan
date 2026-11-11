# Changelog — 2026-11-11

## 2.21.0

**PR:** link once known

**Bump:** minor

### Summary

An agent now drives a plan with six commands, `check`, `serve`, `events`, `mode`, `reply`, and `close`, and names the plan by its file instead of copying a URL. Commands that wait on a plan survive a dropped connection, a restart of the plan service, or a crash, and nothing sent meanwhile is lost. One `events --follow` can serve a whole plan while `mode` switches it, and after an approval the run starts and ends from the phase statuses in the plan file.

### Bugs fixed

- `watch` and `events --follow` exited when the plan service was down for more than a second, or crashed, and missed every comment sent after it came back. They now reconnect and print what was sent meanwhile.
- `wait` and `review` reported "Timed out" the moment the plan service restarted, with most of their timeout left. They now reconnect until their own `--timeout`.
- A listener that used the local service token was refused after the service restarted with a new one. It now reads the new token.
- Running `review` again after the person approved while nothing was listening cleared the approval from the page and waited for hours. The verdict is now kept and printed at once.
- On a hosted plan, `review --cloud` for the next round returned the previous round's verdict at once. A new round now clears a verdict the agent already received, and the hosted plan records the round number.
- A failed delivery ack was never retried while the command kept running. It is retried, and a row still pending after a reconnect is acked without being printed twice.
- A run left on after every workflow step was done, because `execution stop` was forgotten, kept the page on Executing. It now ends by itself.

### Improvements

- `serve` registers the plan, prints its URL, and returns. `--listen` keeps the old behavior of waiting for the next submissions. `--detach` is still accepted.
- `reply` answers a comment and marks it answered in one command. `--outcome errored` or `issues` records the result, and `--keep-open` replies without closing it.
- A comment shows in progress on the page as soon as the agent's `events` prints it, so `addressing` is no longer needed.
- `review`, `watch`, `wait`, `addressing`, and `address` keep working and are listed as shortcuts in the help and the skill.
- A plan service on this machine that crashed is started again by the command that was waiting on it. A service stopped on purpose stays stopped, and a running service is never restarted by a waiting command.
- A connection that went silent, after a laptop sleep or a network change, is noticed within about a minute and reconnected. On a hosted plan the CLI now pings its socket.
- While reconnecting, commands print `Lost the plan stream (...)` and `Reconnected to the plan stream.` on stderr. stdout stays JSON lines.
- `wait` and `review` exit `4` when the stream was refused or never connected, and `3` only when their timeout runs out.
- `mode review` is refused while the person's last verdict has not reached any agent, with a message to run `events` first.
- The live-plan skill and the agent guidelines teach the six-command loop, the single-listener flow, and what to do when a connection drops.

### New features

- Every plan command takes the plan file in place of `--url`, for example `live-plan events work.plan.md` or `live-plan reply cmt_1 work.plan.md --text "Done"`. A plan served with `--cloud` is found from the `cloudId` in the file. `--url` still works.
- `events --follow` and `watch` print `{"event":"mode","data":{"mode":"review","iteration":2}}` whenever the session moves to another mode or review round.
- `mode --iteration N` sets the review round, locally and on a hosted plan, so `mode review` plus `events` replaces the blocking `review`.
- After an approve verdict, or an approve gate answered yes, marking a phase `active` starts the run (Executing). Every workflow step done ends it (Completed), and a failed step ends it (Stopped). A phase set back to `active` starts it again, and `execution stop` turns this off until the next approval.

### Notes

The one behavior change for existing scripts is `serve` without `--detach`: it now returns after registering. Its submissions stay queued and print on the next `events`, or pass `--listen`. No plan format changes. The plan service restarts once when this version first connects, as with every version change, and attached listeners now reconnect through it. `SHELL_CACHE_VERSION` moves to 2.21.0.
