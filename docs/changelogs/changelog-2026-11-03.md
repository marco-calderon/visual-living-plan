# Changelog — 2026-11-03

## 1.12.2

**PR:** not opened yet

**Bump:** patch

### Summary

The installed app has proper icons on Android, iOS, Windows, macOS, and ChromeOS, all made from the Living Plan logo.

### Improvements

- The manifest lists 64, 192, and 512px icons, plus maskable 192 and 512px icons so Android launchers crop the mark cleanly into their shape.
- iOS and iPadOS home screens use a 180px Apple touch icon with a white background instead of the 1024px tab icon.
- Browser tabs get 16, 32, and 48px icons, and `/favicon.ico` answers on both hosts.
- `npm run icons` regenerates every icon from the logo.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.12.2. Reinstall the app to pick up the new icons where the system keeps the old one.

## 1.13.0

**PR:** none (merged directly to main)

**Bump:** minor

### Summary

A hosted plan's versions are a menu in the plan title bar instead of a separate page.

### Improvements

- The plan title bar has a **Live** menu listing the live plan and every published version, newest first, with when each was published.
- The dashboard's **Versions** action opens the same menu in place.
- Old `/plans/:id/history` links land on the live plan.

### Notes

No registry restart needed beyond the usual version check. The new shell cache name replaces the 1.12.1 cache (1.12.2 shipped without updating it).

## 1.13.1

**PR:** [#131](https://github.com/marco-calderon/visual-living-plan/pull/131)

**Bump:** patch

### Summary

Plans this account owns are saved on the device from any hosted page and again whenever the app comes back to the front, and a plan that was never published reads as not found instead of an error page.

### Bugs fixed

- Opening the dashboard stores each owned plan's page in the shell cache. A plan is marked saved only after that copy is stored, and a new app version saves it again.
- One missing build file no longer keeps the rest of the app shell from being cached. The browser's request for `/favicon.ico` is served and no longer fails the service worker while offline.
- A plan whose hosted copy is empty reads as not found, with a link back to the dashboard.
- Every hosted page keeps the account's plans on the device, not only the dashboard. Bringing the tab or installed app back to the front, or reconnecting, re-reads the plan list so plans made elsewhere are saved too.

### Notes

No registry restart needed beyond the usual version check. The new shell cache name replaces the 1.13.0 cache.
