# Changelog — 2026-11-11

## 2.24.3

**Bump:** patch

### Summary

The hosted plan page keeps its toolbar on one row at normal window widths, in the Mac app and in a browser.

### Bugs fixed

- On a hosted plan, a long title kept its full width, so the controls on the right wrapped and spilled out of the fixed-height toolbar: the Local and Cloud switch rose above it and the account menu dropped below it. The title now shortens with an ellipsis and the controls stay on one row.

### Notes

`SHELL_CACHE_VERSION` moves to 2.24.3. No registry restart needed.

## 2.24.2

**Bump:** patch

### Summary

Building the Mac app from a checkout works on newer macOS, and one command builds and installs it.

### Bugs fixed

- `bun run desktop:build` failed on newer macOS with `can't find crate` for every proc macro. The release profile stripped the proc-macro libraries too, and macOS refused to load them (`mis-aligned LINKEDIT string pool`). Build-time code is no longer stripped. The app binary still is.

### New features

- `bun run desktop:install` builds the `.app` for this Mac and installs it: it quits a running Living Plan, replaces `/Applications/Living Plan.app`, checks the signature, registers the app for `living-plan://` links, and opens it. `--dmg`, `--no-launch`, `--skip-build`, and `--dest DIR` change that.

### Notes

For people building from a checkout only. The released `.dmg` and the CLI are unchanged. `SHELL_CACHE_VERSION` moves to 2.24.2.

## 2.24.1

**PR:** [#185](https://github.com/marco-calderon/visual-living-plan/pull/185)

**Bump:** patch

### Summary

The Mac app's window buttons line up with the logo and title in the toolbar.

### Bugs fixed

- The close, minimize, and zoom buttons sat near the top of the window, above the middle of the toolbar. The app now centers them in the toolbar and keeps them there after a page loads, the window resizes, or its title changes.

## 2.24.0

**PR:** [#184](https://github.com/marco-calderon/visual-living-plan/pull/184)

**Bump:** minor

### Summary

The Mac app now opens your hosted plans as well as the ones on your computer, and walks you through a short setup the first time: where plans run, the look, the `live-plan` command, and the skill for your agents. Its toolbar is the window's title bar.

### New features

- A setup screen on the first launch of the Mac app, one step at a time: where plans run (this computer or a cloud host), the color mode, accent, and syntax theme, the command line tool, and agent skills. It opens again from Settings on any page and from Plans, then Setup, in the menu bar.
- The Mac app opens a hosted Living Plan. Choose Cloud in setup and enter the host, or sign in with `live-plan account login` and the app uses that host. Local and Cloud in the toolbar switch between the two, and the app reopens on the side you left.
- `live-plan skills install` copies the live-plan skill into Claude Code, Codex, Cursor, Gemini CLI, OpenCode, and `~/.agents`. With no `--harness` it uses every agent found on the machine. `live-plan skills list` shows where it is installed. Setup and Settings have a button for each.
- `live-plan desktop install-cli`, and the Install button in setup, put `live-plan` on your PATH running the copy inside the app, so the app needs no Bun or npm for agents either. A `live-plan` installed another way is left alone.
- `serve --cloud` opens the hosted plan in the Mac app when the app knows that host, through `living-plan://cloud/plans/<id>`, before trying the installed web app and then a tab.
- A Plans menu in the Mac app's menu bar: Plans on This Computer, Cloud Plans, and Setup.

### Improvements

- On macOS the page toolbar is the window's title bar. The window buttons sit in it, and dragging it moves the window. In a browser the toolbar is unchanged.
- A plan with no `live-plan.config.json` beside it starts from the machine-wide theme file, which is where setup saves the accent and syntax theme.
- When the cloud host does not answer, the app says so and offers the plans on this computer. Local plans work offline as before.
- Signing in to a hosted Living Plan with GitHub stays in the app window.

### Notes

Google refuses sign-in from an embedded window, so in the app use email or GitHub. Cloud mode needs a connection; the installed web app still works offline. The macOS title bar and menu were compiled and unit-tested on Linux and still need a look on a Mac. No plan format changes. `SHELL_CACHE_VERSION` moves to 2.24.0. ADR 0038 records the design.

## 2.23.0

**PR:** [#183](https://github.com/marco-calderon/visual-living-plan/pull/183)

**Bump:** minor

### Summary

Living Plan is now a Mac app. It opens the dashboard and your plans in their own windows, starts the plan service by itself, and needs no Bun, npm, or CLI install. When it is installed, a plan an agent serves opens in it; without it, the plan opens in the installed web app, as in 2.22.0, or a new tab.

### New features

- A Mac app built with Tauri (`src-tauri/`), for macOS 13 or later on Apple silicon and Intel. It ships the CLI and the Bun runtime, starts the plan service when none is running, and opens the dashboard. Plans open in the same window, and a plan opened from the Plans menu gets its own window. Other links open in your browser.
- `serve`, `review`, `dashboard`, and the terminal dashboard open a local plan or the dashboard in the Mac app when it is installed, through `living-plan://plans/<id>` and `living-plan://dashboard`, before trying the installed web app and then a tab. The app focuses the window that already shows that plan, or opens one. `LIVE_PLAN_DESKTOP=0` skips the Mac app, and `LIVE_PLAN_OPEN=browser` still always uses a tab.
- The app uses a plan service that agents already started, whatever its version, and leaves it running when it quits.
- A Mac app icon on Apple's icon grid. `bun run desktop:icons` redraws it.
- `bun run desktop` opens a development window, and `bun run desktop:build` writes the `.app` and a `.dmg`. The Desktop workflow builds both architectures and attaches the `.dmg` files to each GitHub release.
- `live-plan dashboard --json` prints the dashboard and service address as one JSON line and opens nothing. `--any-version` uses a running service of another version instead of restarting it.

### Improvements

- The web manifest asks browsers with link capturing to open in-scope links in the installed web app's own window (`handle_links`, `launch_handler`), for links the CLI does not launch itself.

### Notes

The app is signed ad hoc, not notarized, so the first launch asks you to allow it in System Settings, Privacy & Security. Linux and Windows builds come later. A hosted plan (`--cloud`) still opens in the browser. Agents keep using `npx --yes visual-living-plan`. No plan format changes. `SHELL_CACHE_VERSION` moves to 2.23.0.

## 2.21.0

**PR:** [#181](https://github.com/marco-calderon/visual-living-plan/pull/181)

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
- After an approve verdict, or an approve gate answered yes, the agent's next edit that marks a phase `active` starts the run (Executing). The approval alone starts nothing, so the person can keep answering and commenting until then. Every workflow step done ends it (Completed), and a failed step ends it (Stopped). A phase set back to `active` starts it again, and `execution stop` turns this off until the next approval.

### Notes

The one behavior change for existing scripts is `serve` without `--detach`: it now returns after registering. Its submissions stay queued and print on the next `events`, or pass `--listen`. No plan format changes. The plan service restarts once when this version first connects, as with every version change, and attached listeners now reconnect through it. `SHELL_CACHE_VERSION` moves to 2.21.0.

## 2.22.0

**PR:** [#182](https://github.com/marco-calderon/visual-living-plan/pull/182)

**Bump:** minor

### Summary

When Living Plan is installed as an app, `serve`, `review`, `dashboard`, and the terminal dashboard open pages in that app window. Without an install they open a browser tab, as before.

### New features

- The CLI finds a Living Plan app installed in Chrome, Edge, Brave, or Chromium for the page's host, and opens the plan or dashboard there. It checks every browser profile and prefers `Default`.
- The terminal dashboard's Open control does the same.
- `LIVE_PLAN_OPEN=browser` always opens a browser tab.

### Notes

`account login` still opens a browser tab, because sign-in returns to a loopback callback. Firefox and Safari web apps are not detected, so those open a tab. `--no-open` and `--open` work as before. No registry restart needed beyond the usual version check. The shell cache name is 2.22.0.
