# Changelog — 2026-11-04

## 1.14.3

**PR:** pending

**Bump:** patch

### Summary

Picking an older version from the versions menu, on the plan page or on the dashboard, opens that version as a rendered plan instead of its raw Markdown.

### Bugs fixed

- `/plans/<id>/versions/<n>` showed the raw `.plan.md` text. It now renders the saved version with the same plan renderer as the live plan. It is read-only: forms are locked, comments are off, and it does not follow the live plan.

### Improvements

- The versions menu names the version you are on (for example "Version 2") and marks it as the current page.
- Saved versions are kept in the browser database (TanStack DB `versions` collection). The menu lists them offline, and a version you opened before can be opened again offline.
- The raw file of a version is still available at `/plans/<id>/versions/<n>/document`.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.14.3.
