# ADR 0037: A plan opens in the desktop app through `living-plan://`

- Status: Accepted
- Date: 2026-11-11

## Context

`serve` and `review` open a plan page the first time this machine serves it, and `dashboard` opens the dashboard. Both went to the default browser, even with the desktop app ([ADR 0036](0036-desktop-app.md)) installed, so the person ended up with the plan in a tab beside an app that could show it. A person without the desktop app who installed the web app from the browser got a tab too, not that app's window.

## Decision

- **A URL scheme.** The desktop app registers `living-plan` (the deep-link plugin; on macOS the bundler writes it into `Info.plist`). A link names a page by id, never by URL:
  - `living-plan://plans/<id>` is that plan on the plan service.
  - `living-plan://dashboard` is the dashboard.
- **The CLI tries the app first** (`src/desktopApp.ts`). Only a page on the local service has a link: a loopback `http` URL whose path is `/plans/<id>/` or `/dashboard`. On macOS the CLI runs `open <link>`, which exits non-zero, without a dialog, when no app claims the scheme. Then, and for every other page, it opens the browser as before. The app ships for macOS only, so other platforms go to the browser. `LIVE_PLAN_DESKTOP=0` keeps every page in the browser. `--no-open`, `--open`, and opening a plan only once are unchanged.
- **The app opens the page.** A link that launches the app waits until the app has found the service, then opens in the first window instead of the dashboard. A link that arrives later focuses the window that already shows that page, or opens a new window. On macOS links arrive as an `Opened` event; on Linux and Windows, as the argument of a second launch, which the single-instance plugin hands to the running app.
- **Ids, not URLs.** Any website can open a `living-plan://` link. Because a link carries only an id, it can open nothing but a page on the service the app is connected to. Anything else in the scheme is ignored.
- **The web app claims the browser fallback.** The manifest sets `handle_links: "preferred"` and `launch_handler.client_mode: ["navigate-new", "auto"]`. In a browser with link capturing, such as Chrome or Edge, a plan link opens in the installed web app's own window. Without the web app installed, or in a browser that does not capture links, it opens in a new tab as before. The hosted and the local manifests are the same.

## Consequences

On a Mac with the app, an agent's `serve` puts the plan in a Living Plan window. Agents do nothing different. A hosted plan (`serve --cloud`) and a private `--no-registry` server still open in the browser, because the app is a window on the local service.

Whether the browser routes a link into the installed web app is the browser's choice, and the person can turn it off there.
