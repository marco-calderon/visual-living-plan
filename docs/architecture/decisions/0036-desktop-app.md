# ADR 0036: The desktop app is a Tauri window on the local plan service

- Status: Accepted
- Date: 2026-11-11

## Context

A person reads plans in a browser tab. The tab shares the browser with everything else, and the plan service has to be started by a CLI first. The installable web app ([ADR 0027](0027-offline-dashboard-and-owned-plans.md)) needs a browser that offers installation, and still needs the CLI, and with it Bun, on the machine.

The plan service is the page host. It renders the dashboard and plan pages, serves the client build from `dist/client`, and reads its icons, styles, `package.json`, and changelogs from beside its own module. A window only has to load those pages.

## Decision

- **A Tauri 2 app in `src-tauri/`.** Its first window shows `desktop/index.html`, a splash page that calls the `connect` command and then loads the URL it returns. `connect` runs the CLI shipped in the app:

  ```
  living-plan-bun <resources>/service/dist/cli.js dashboard --json --any-version
  ```

  It returns the dashboard URL on the loopback bind address, and the splash page shows the error with a retry button when the service does not start.
- **The app uses whatever service is running.** `--any-version` makes `ensureRegistry` return a healthy service of any version. It starts the app's own copy only when none is running. The CLI restarts a service of another version because it speaks the service's protocol. The window does not: it loads pages the running service renders itself, so they always match. The app never restarts a service that agents started with another CLI version.
- **The service outlives the window.** The app's copy starts detached, as any CLI start does. Quitting the app leaves it running for agents, and the next CLI of another version replaces it as usual.
- **The app ships the service and the runtime.** `bun run desktop:stage` (`scripts/build-desktop.ts`) bundles `src/cli.ts` into one `dist/cli.js` and copies the files it reads at the same relative paths: the client build, icons, `planPage.css`, `shellWorker.js`, `package.json`, the changelogs, and elk's worker. Tauri ships that folder as the `service/` resource. The Bun binary is the sidecar `living-plan-bun`, so a Linux package does not install a second `bun` onto the PATH. `bun build --compile` was not used: the compiled binary's module path is virtual, and every one of those lookups would break.
- **Links.** A page on the service's origin stays in the window. `target="_blank"` to that origin, which the Plans menu uses, opens another app window. Other `http`, `https`, and `mailto` links open in the default browser or mail app. Other schemes are dropped, because plan text is written by agents. Service pages are a remote origin with no capability, so they get no Tauri API. For that reason the opener plugin's link script is off: it would send `_blank` clicks over IPC, which those pages cannot use, and swallow them.
- **The window follows the page.** The title is the page's title. A second launch focuses the open window. The main window's size and position are restored. A download goes to the Downloads folder and is shown in its folder.
- **Packages.** `.deb`, `.rpm`, `.app`, `.dmg`, NSIS, and MSI. Not AppImage: its mount goes away when the app exits, and the detached service runs from it. The app version is `package.json`'s, read by `tauri.conf.json`.

## Consequences

People get a Living Plan app that starts the service by itself, with no Bun, npm, or CLI install. Most of its size is the Bun runtime.

Agents are unchanged. They still run `npx --yes visual-living-plan`, and `serve` still opens the default browser the first time. Opening those plans in the app is a later change.

Builds are unsigned. macOS Gatekeeper and Windows SmartScreen warn on first launch until signing and notarization are set up. A build for another architecture needs a Bun binary for it (`--bun`).
