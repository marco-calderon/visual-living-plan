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
