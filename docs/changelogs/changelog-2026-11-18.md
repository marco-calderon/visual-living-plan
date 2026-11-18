# Changelog — 2026-11-18

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
