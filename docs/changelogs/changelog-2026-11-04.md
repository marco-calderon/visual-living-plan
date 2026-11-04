# Changelog — 2026-11-04

## 1.14.3

**PR:** pending

**Bump:** patch

### Summary

Picking an older version from the versions menu, on the plan page or on the dashboard, opens that version as a rendered plan instead of its raw Markdown.

### Bugs fixed

- `/plans/<id>/versions/<n>` showed the raw `.plan.md` text. It now renders the saved version with the same plan renderer as the live plan. It is read-only: forms are locked, comments are off, and it does not follow the live plan.
- A hosted plan page no longer gets a 500 from `/api/execution`. The hosted plan now answers that read with the run state and the expected workflow, as the local service does, so the Workflow tab is current when the page opens.
- A hosted plan page no longer calls `/api/theme`, which only the local service has. It reads the owner's appearance from the new `GET /api/account/settings` instead.
- A route the hosted plan does not serve returns 404 instead of 500.

### Improvements

- The versions menu names the version you are on (for example "Version 2") and marks it as the current page.
- Saved versions are kept in the browser database (TanStack DB `versions` collection). The menu lists them offline, and a version you opened before can be opened again offline.
- `GET /api/account/settings` returns the account appearance on its own, the same settings the settings page saves. A hosted plan page you own reads it on load, keeps it in the browser database, and applies it, so a page opened from the device cache picks up appearance changes made elsewhere. A plan you only view keeps its own look.
- The raw file of a version is still available at `/plans/<id>/versions/<n>/document`.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.14.3.
