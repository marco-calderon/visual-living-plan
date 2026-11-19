# Changelog — 2026-11-18

## 2.32.0

**PR:** [#203](https://github.com/marco-calderon/visual-living-plan/pull/203)

**Bump:** minor

### Summary

The Mac app shows its updates in the window. A notice at the top right follows the download with a progress bar, then offers **Restart now**. After an update to a new minor version, the app opens **What's new** once, in the same frame as Settings, with what the release added, improved, and fixed.

### New features

- The update notice stays in the window while an update needs it: *Downloading* with a progress bar and the size so far, *Installing*, then *Ready* with **Restart now** and **Later**. Later keeps the new version for the next launch, and **Hide** puts the download out of sight until it is ready. The notice shows over the dashboard, plans, the hosted app, and setup, and a page that opens meanwhile shows it too.
- **What's new** opens once after the app moves to a new minor version, such as 2.32. It lists each release since the notes you last saw, newest first, with its summary and cards for new features, improvements, and bugs fixed, as Settings shows the changelog. Continue, the close button, or Escape closes it for good. A new install and a patch release open no notes.
- Settings has **Check for updates** in its Desktop app section, on plans on this computer and on the hosted app. It answers in the same notice: checking, up to date, or why it could not check, with **Try again**.

### Improvements

- Living Plan > Check for Updates… answers in the window instead of a dialog.
- The update notice has its own place at the top right, so a plan's own messages, at the top left, no longer cover it, and Escape on the page leaves it open.
- A download that fails after it started says why in the notice, in place of its progress.

### Notes

The app no longer ships the dialog plugin. `desktop.json` gains `notesSeen`. `cargo build` needs `bun run desktop:stage` first, which now also writes `src-tauri/web/notices.js`. `SHELL_CACHE_VERSION` moves to 2.32.0. No registry restart needed.

## 2.31.1

**PR:** [#202](https://github.com/marco-calderon/visual-living-plan/pull/202)

**Bump:** patch

### Summary

A double click on text in a plan now selects the word, and a triple click selects the line, ready to type over. The *After phase* + bar, which the pointer could not reach, is gone: the + under a phase does the same.

### Bugs fixed

- A double or triple click on text opened its editor with the caret where the first click landed, and selected nothing. Sometimes the second click closed the editor instead. A double click now opens the text with the word selected, and a triple click with its line: the paragraph, heading, list item, quote, or table cell. This works at any speed, inside phases and cards too. Typing replaces the selection.
- A triple click in open text selected into the start of the next line, so typing over a list item joined it to the next one. It now selects that line alone.
- Right after a click on text, the + bar under it could move over the text for a moment, so a quick second click pressed + instead. Text that is opening shows no + bar.

### Improvements

- Text inside a phase no longer shows a second + bar labelled *After phase* under the whole phase. The pointer could not reach it, because the phase's own + took its place on the way down. That + shows under the phase while the pointer is on the phase's title row or in the gap below the phase, and adds after it, as the grip's *Add below* and the A key do.

### Notes

No registry restart needed.

## 2.31.0

**PR:** [#200](https://github.com/marco-calderon/visual-living-plan/pull/200)

**Bump:** minor

### Summary

The Mac app updates itself from GitHub releases. It checks shortly after it opens and every few hours, installs a newer version in the background, and asks to restart. Living Plan > Check for Updates… checks now.

### New features

- The Mac app installs newer releases by itself. After the download it asks to restart, and Later keeps the new version for the next launch. Updates are signed, and the app checks each one against the public key it ships with and the version in its signature before it replaces itself. macOS does not ask you to allow the app again after an update.
- Living Plan > Check for Updates… in the menu bar checks right away, and says when the app is current or why it could not check.
- Each release carries signed update packages for Apple silicon and Intel (`Living.Plan_<version>_<arch>.app.tar.gz` and `.sig`) and the `latest.json` that names them, beside the `.dmg` files.

### Notes

Install this version from its `.dmg` once; later versions arrive in the app. A release has update packages only when the updater key is set up (README, Desktop app). The plan service keeps running through the app's restart, so agents are not interrupted. No registry restart needed.
