# ADR 0042: Update notices and What's new show in the window

- Status: Accepted
- Date: 2026-11-18
- Amends: [ADR 0041](0041-desktop-app-updates.md) (how the app shows an update)

## Context

ADR 0041 made the desktop app update itself. It told the person with native dialogs: nothing while it downloaded, then Restart Now or Later, and on a check from the menu a dialog for "up to date" or the reason a check failed. A dialog is a separate macOS window. It shows no progress, and it does not look like the rest of the app, which is the pages in its windows.

The pages have a toast library, Ding (`@yusufceng1z/ding-react`), and Settings is a modal over the page (`src/settings/SettingsDialog.tsx`). A notice in the page can show progress and stay until the update is done.

Three things make "in the page" harder than it sounds:

- **Whose page.** A window shows the app's own setup page, the local plan service's dashboard and plans, or the hosted app. The app uses a running service of any version (ADR 0036) and the hosted app is deployed on its own, so their pages can be older than the app. The local dashboard is server HTML with no React at all.
- **No API.** Pages get no Tauri API and reach the app only by following `living-plan://` links (ADR 0038). Plan pages run code an agent wrote.
- **One toast at a time.** Ding morphs the open toast into the next one, and Escape dismisses it. A plan page's own "Saved" toast would replace an update notice, and the page's Escape would close it.

People also want to know what changed after a release that adds something. The changelog (`docs/changelogs/`) has a summary, new features, improvements, and bugs fixed for each version, and the app ships those files with its bundled service.

## Decision

- **The app owns its notices.** `src/desktopNotices.ts` is bundled by `bun run desktop:stage` into `src-tauri/web/notices.js` and compiled into the app. Every window runs it as an initialization script beside `desktop/bridge.js`, so it is the app's version on every page, whichever service or hosted build served the page. It draws nothing until the app calls `window.__LIVING_PLAN_NOTICES__.update(notice)` or `.whatsNew(notes)` with `eval`. The global is not writable.
- **A shadow root, a toaster of its own.** The notices live in a shadow root on a `living-plan-notices` element. Page styles do not reach them and theirs do not reach the page, which matters because the hosted Settings modal uses the same class names. The bundle has its own copy of Ding's toaster, mounted at the top right below the title bar, so the page's toasts (top left) neither replace nor dismiss the update notice. The page's Escape stays the page's.
- **The update notice.** `update.rs` keeps the updater's state as a `Notice`: `checking`, `downloading` (bytes received and the total), `installing`, `ready`, `current`, or `failed`. Downloading, installing, and ready last: every window that shows an app page gets them, and a page that loads meanwhile gets them again. Download progress moves the toast's bar at most every 150 ms. Ready offers **Restart now** and **Later**. Hide (while downloading) and Later hide that step in every window until the next step. A check from the menu or from Settings answers in the window it came from: checking, up to date, or why it failed, with Try again when trying again can help. A timed check that fails before a download starts stays quiet, as before. A sign-in provider's page never gets a notice.
- **Buttons are links.** The notice's buttons follow `living-plan://update/restart`, `update/later`, `update/hide`, and `update/check`. The app acts on one only when its state agrees: restart needs an installed update, and later and hide hide only the step they name. A page that follows them, or calls the notices itself, can show a notice in its own window but cannot make the app download, install, or restart anything it would not have. Settings has **Check for updates** in its desktop-only section on both hosts.
- **No dialog plugin.** The app no longer uses `tauri-plugin-dialog`. The updater plugin is still used from Rust only, and no capability grants its commands to a page.
- **What's new for each newer minor version.** `desktop.json` records `notesSeen`, the app version whose notes were last closed. `live-plan desktop state` returns `whatsNew` when setup is done and the running version's `major.minor` is past that one: every release after it, up to the running version, newest first, at most eight (`src/releaseNotes.ts`). Without a record, the notes start at this minor's `.0`. Finishing setup the first time records the running version, so a new install opens no notes. A patch release opens none.
- **Shown as the Settings modal.** The app hands the notes to the first window once it shows a page of the plan service or the hosted app. The modal is the Settings frame (`src/settings/dialogFrame.css`, which Settings now imports too): its backdrop, panel, header, and close button, with each release's summary and the release cards of Settings' About section, new features first. Continue, the close button, the backdrop, and Escape close it and follow `living-plan://notes/seen`, and the app saves `notesSeen` through `live-plan desktop configure`. Until then the notes stay due, and a page that loads in that window shows them again.

## Consequences

The update shows where the person is looking, with its progress, and the restart is a button in the page. It looks the same over the dashboard, a plan, the hosted app, and setup.

Every page in an app window parses the notices script (about 50 KB, most of it the stylesheet) whether or not it shows anything. It only defines a function until the app calls it.

The notices script is the app's code in the page's world. A plan page can read or imitate it, as it could draw any toast of its own. What it cannot do is reach the updater: the links are the only way in, and they are checked against the app's own state.

`cargo build` and `cargo test` need `src-tauri/web/notices.js`, so they need `bun run desktop:stage` first, as they already did for the staged service and Bun.

What's new reads the changelog files the app ships, so a release's notes are whatever its `### Summary`, `### New features`, `### Improvements`, and `### Bugs fixed` say. The version-bump skill already asks for those.
