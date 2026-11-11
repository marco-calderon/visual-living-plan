# ADR 0037: A plan opens in the desktop app through `living-plan://`

- Status: Accepted. [ADR 0038](0038-desktop-setup-and-cloud.md) adds links to hosted pages, and links a page in an app window follows to reach the app.
- Date: 2026-11-11

## Context

`serve` and `review` open a plan page the first time this machine serves it, and `dashboard` opens the dashboard. Since 2.22.0 `src/openUrl.ts` opens them in the installed Living Plan web app when Chrome, Edge, Brave, or Chromium has one for that origin, and in a browser tab otherwise. The desktop app ([ADR 0036](0036-desktop-app.md)) was not in that list, so a person with it installed still got the plan in a browser window beside an app that could show it.

## Decision

- **A URL scheme.** The desktop app registers `living-plan` (the deep-link plugin; on macOS the bundler writes it into `Info.plist`). A link names a page by id, never by URL:
  - `living-plan://plans/<id>` is that plan on the plan service.
  - `living-plan://dashboard` is the dashboard.
- **The CLI tries the Mac app first.** `openUrl` asks `src/desktopApp.ts` before it looks for the web app, so `serve`, `review`, `dashboard`, and the terminal dashboard all follow one order: the Mac app, the installed web app, a browser tab. Only a page on the local service has a link: a loopback `http` URL whose path is `/plans/<id>/` or `/dashboard`. On macOS the CLI runs `open <link>`, which exits non-zero, without a dialog, when no app claims the scheme, and the CLI moves on to the web app. The app ships for macOS only, so other platforms skip it. `LIVE_PLAN_DESKTOP=0` skips the Mac app, and `LIVE_PLAN_OPEN=browser` still always uses a tab. `--no-open`, `--open`, and opening a plan only once are unchanged. `dashboard` opens the loopback address, which both apps know.
- **The app opens the page.** A link that launches the app waits until the app has found the service, then opens in the first window instead of the dashboard. A link that arrives later focuses the window that already shows that page, or opens a new window. On macOS links arrive as an `Opened` event; on Linux and Windows, as the argument of a second launch, which the single-instance plugin hands to the running app.
- **Ids, not URLs.** Any website can open a `living-plan://` link. Because a link carries only an id, it can open nothing but a page on the service the app is connected to. Anything else in the scheme is ignored.
- **The web app also claims links it is handed.** The CLI launches an installed web app itself. For links it does not launch, such as a link followed in a browser, the manifest sets `handle_links: "preferred"` and `launch_handler.client_mode: ["navigate-new", "auto"]`, so a browser with link capturing opens the page in the web app's own window. The hosted and the local manifests are the same.

## Consequences

On a Mac with the app, an agent's `serve` puts the plan in a Living Plan window. Agents do nothing different. A hosted plan (`serve --cloud`) and a private `--no-registry` server never open in the Mac app, because it is a window on the local service; they go to the web app or a tab.

Whether a browser routes a link it is handed into the installed web app is the browser's choice, and the person can turn it off there.
