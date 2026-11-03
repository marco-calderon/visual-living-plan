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

**PR:** not opened yet

**Bump:** patch

### Summary

Settings work offline and sync when the network returns, and submitting a form in a plan no longer flickers or jumps to the top.

### Bugs fixed

- Submitting a form, choice, questions, or approval in a plan updates it in place. The page no longer hides and rebuilds the plan, so it does not flicker and keeps its scroll position.
- The settings page opens offline from the account and settings saved on this device, instead of failing to load.
- A settings change made offline is kept on the device and sent to the host when the network returns. Before, it was lost.
- A page fetched through a redirect, such as a sign-in redirect, is no longer cached under the page that was asked for.

### Improvements

- A signed-in device keeps a copy of the settings page in the installed app, so it opens without a network.
- Saving a setting applies it on the page without reloading.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.13.1.


## 1.13.2

**PR:** not opened yet

**Bump:** patch

### Summary

A signed-in device keeps its plans ready for offline reading from any page, and the dashboard shows its saved copy before the network answers.

### Improvements

- Plans are saved to the device from any signed-in page, not only the dashboard. This also runs every minute, when the network returns, and when the app's service worker takes over the page.
- Plan pages are saved only after the service worker controls the page, so the first visit no longer fetches pages that are never cached.
- A catalog change that arrives while plans are being saved is picked up when that run ends, instead of being skipped.
- The dashboard paints the copy saved on this device first, then replaces it with the fresh one.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.13.2.

- New example: `examples/cloud-showcase.plan.md`, a tour of a plan published on the hosted service.

## 1.13.3

**PR:** not opened yet

**Bump:** patch

### Summary

Settings ends with a Version card on both the loopback plan page and the hosted site, showing the version and the latest changelog.

### Improvements

- The changelog moved from the top of Settings to a **Version** card at the bottom, under the appearance settings.
- The Version card shows the installed Living Plan version above the changelog.
- On narrow screens the changelog cards stack their count above the list so lines no longer run past the card.
- Changelog entries are plain bullets. The version pill in front of each line is gone.

### New features

- The hosted Settings page has the same Version card. A local plan reads the version and newest changelog from disk each time the page loads. The hosted site builds them in when it is deployed and loads only the newest changelog.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.13.3.

## 1.13.4

**PR:** not opened yet

**Bump:** patch

### Summary

Plans on the hosted dashboard no longer disappear and come back between refreshes. Every request made from the app's pages now goes through React Query, and polling stops while a tab is hidden.

### Bugs fixed

- The device store no longer loses rows when two saves happen close together. Each save rewrote the whole list from what was already shown, so a row that was still saving was erased.
- When one hosted dashboard refresh fails, the rows on screen stay and the status line says the refresh failed. Before, the table was emptied until the next refresh.
- Plans saved for offline keep the time they were last fetched, so they are not fetched again on every dashboard refresh.
- Log out in the hosted account menu works again. The request had no JSON body and the server answered 415.
- A local plan page no longer polls the running plans list twice when the React menu mounts after the fallback script starts.

### Improvements

- Dashboard rows, running plans, plan versions, the Settings version card, and the workflow canvas are React Query queries. Sign-in, sign-up, account linking, log out, settings saves, and plan answers, comments, reviews, and mode changes are React Query mutations. Plan changes still queue in the device outbox when offline.
- The hosted dashboard and the running plans menu refresh every 4 seconds only while the tab is visible, and refresh right away when it is shown again. The local dashboard, the local service page, and the once-a-minute background plan sync also skip hidden tabs.

### Notes

Adds `@tanstack/react-query`. No registry restart needed beyond the usual version check. The shell cache name is 1.13.4.

## 1.14.0

**PR:** not opened yet

**Bump:** minor

### Summary

Every hosted plan is behind its owner's account. Signed view links no longer open a plan without signing in.

### Bugs fixed

- A signed view link (`/plans/<id>/view/<signature>`) let anyone who had it read a plan and submit on it with no account, for as long as the plan existed. It now clears its cookie and sends the visitor to sign in.

### Improvements

- Only the account that owns a plan can open it, submit on it, or connect to it. A signed-out visitor is sent to sign in. A different signed-in account gets "This plan belongs to another account."
- `serve --cloud` opens the plain plan URL. Sign in once in that browser.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.14.0. Links shared before this release stop working. Sharing with other accounts is a follow-up ([ADR 0028](../architecture/decisions/0028-owner-only-hosted-plans.md)).
