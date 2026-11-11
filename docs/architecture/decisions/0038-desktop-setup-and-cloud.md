# ADR 0038: The desktop app has a setup screen, opens local or hosted plans, and draws its own title bar

- Status: Accepted
- Date: 2026-11-11

## Context

The desktop app ([ADR 0036](0036-desktop-app.md)) was a window on the local plan service and nothing else. A hosted plan (`serve --cloud`) opened in the browser or the installed web app, beside an app that could show it ([ADR 0037](0037-plans-open-in-the-desktop-app.md)). A person who installed only the app had the CLI inside it but no `live-plan` command for their agents, and no skill in those agents. The window kept the system title bar above the page's own toolbar, so every page had two bars.

The local service and the hosted app serve the same pages: a dashboard, plan pages, and a toolbar with the class `titlebar`. One window can show either.

Plan pages run code an agent wrote, because the browser compiles the plan's MDX. That is why ADR 0036 gives service pages no Tauri API. This decision keeps that.

## Decision

- **A config file.** `desktop.json` in the config home, beside `cloud.json`, holds `setupDone`, `mode` (`local` or `cloud`), `cloudUrl`, `colorMode` (`system`, `light`, `dark`), and `appearance` (the accent and syntax theme chosen in setup, with the time of the choice). `src/desktopConfig.ts` reads, checks, and writes it. A cloud host is an `https` origin, or loopback `http` for a development host.
- **The app runs the CLI it ships for everything.** Rust keeps no settings logic. Its commands run:

  ```
  live-plan desktop state                 the config, and what setup can offer, as one JSON line
  live-plan desktop configure --json {}   change the config, then print the same line
  live-plan desktop install-cli           put live-plan on the PATH, running this install
  live-plan skills install [--harness id] copy the live-plan skill into agent harnesses
  ```

  `skills` is a public command. `desktop` is what the setup screen runs, and works from a terminal too.
- **A setup screen, once.** The app's own page (`desktop/index.html`) shows setup when `setupDone` is false, one step at a time in the middle of the window: where plans run, the look, the command line tool, and agent skills. A row of dots under the buttons marks the steps, and the dot of the step on screen is stretched. Every later launch goes straight to the saved mode. The same screen opens again from Settings on any page and from the Plans menu.
- **Local or cloud.** In local mode `connect` finds or starts the plan service, as before. In cloud mode it checks that the host answers on its port and loads its dashboard; when it does not answer, the page says so and offers the plans on this computer. A window can show pages of both hosts whatever the mode. The mode is where the app opens, and what the toolbar switch changes. Offline work is unchanged: the local service needs no network.
- **The cloud host** is the one set in setup, else the one `live-plan account login` signed in to. So a person who already uses `--cloud` gets hosted plans in the app with no setup step.
- **Hosted pages have links.** `living-plan://cloud/plans/<id>` and `living-plan://cloud/dashboard` open a page on that host. `openUrl` hands a hosted page to the app when its origin is that host, before it looks for the installed web app. A link still names a page by id, never by URL.
- **Pages talk to the app through links, not an API.** A page in an app window reaches the app by following a `living-plan://` link, which the app sees as a navigation and cancels:
  - `living-plan://switch/local` and `living-plan://switch/cloud` save the mode and open that side.
  - `living-plan://setup` and `living-plan://setup/<section>` open the setup screen.

  These work only from a page in an app window. The same links handed over by the system, from a website or a terminal, are ignored; only page links open that way. The toolbar's Local and Cloud switch and the buttons in Settings are plain anchors. Styles show them only under `html[data-desktop]`, so a browser never shows a link it cannot follow.
- **The bridge.** `desktop/bridge.js` runs in every page of an app window before the page's scripts. It sets `window.__LIVING_PLAN_DESKTOP__` (`platform`, `chrome`) and `data-desktop` on the root. It carries no Tauri API.
- **The page's toolbar is the title bar on macOS.** Windows use the overlay title bar style with a hidden title, and the window buttons sit over the toolbar's left end, level with its middle. The bridge pads `.titlebar` by 88px to clear them, gives the room back in full screen, and marks the toolbar as a drag region. A page with no toolbar, such as a sign-in provider's, gets a bare strip for the buttons. This lives in the app, not in the pages, so it also fits a page served by an older plan service. Linux and Windows keep their own title bar, and a browser is untouched.
- **One window permission for remote pages.** Moving a window needs Tauri's `start_dragging`. When the app learns a host's origin it adds a capability for that origin with `core:window:allow-start-dragging` and `core:window:allow-internal-toggle-maximize`, and nothing else. Remote pages cannot call the app's own commands: Tauri checks every command a remote origin sends against its capabilities, and none lists them.
- **The look chosen in setup.** The color mode is the app's: it sets the theme of every window, and pages follow `prefers-color-scheme` as they do in a browser. The accent and syntax theme are written to the machine-wide theme file, and a plan with no `live-plan.config.json` beside it now starts from that file. For the hosted app, the app hands the choice to a hosted page after it loads, and the page saves it to the signed-in account once, with the time of the choice, so an account look changed later is kept (`src/desktopBridge.ts`).
- **The command line tool.** `install-cli` writes a launcher script, under both program names, that runs the app's Bun with the app's `cli.js`. It goes into the first writable folder on the PATH among `~/.local/bin`, `~/bin`, `/usr/local/bin`, and `/opt/homebrew/bin`, else `~/.local/bin`, with the line to add to the shell profile. The PATH is asked of the login shell, because an app opened from the Finder has a short one. A `live-plan` that something else installed is never replaced.
- **Agent skills.** `skills install` copies `skills/live-plan` from the package into `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, and `~/.agents/skills`. With no harness named it installs into each one whose folder exists. It replaces only its own folder. The staged service now carries the skill.
- **Sign-in with a provider stays in the window.** A navigation to GitHub's or Google's OAuth address, while a cloud host is known, keeps that window in the app until it is back on the host. Otherwise the session would land in the browser.
- **A Plans menu** on macOS, added to the standard menu: Plans on This Computer, Cloud Plans, and Setup. It reaches all three from any page, including one an older service rendered with no switch.

## Consequences

A person can install only the app and end with `live-plan` on the PATH, the skill in their agents, and their hosted plans in the same window as their local ones.

A link inside a plan can switch the mode or open setup when a person follows it, because plan text is the agent's. Both are reversible and neither runs a command: setup still needs the person to press its buttons.

Google refuses sign-in from an embedded web view. In the app, sign in to a hosted Living Plan with email or GitHub. Signing in through the system browser needs a hand-off the host does not have yet.

The app's web view keeps no offline copy of hosted pages, so cloud mode needs a connection. The installed web app still works offline as in [ADR 0027](0027-offline-dashboard-and-owned-plans.md).

The launcher names the app's location. Moving the app breaks it, and setup then shows it as stale with an Update button.

The title bar, the menu, and the provider sign-in were compiled and unit-tested on Linux. The macOS-only window calls are checked only by the Desktop workflow's build, so they need a look on a Mac.
