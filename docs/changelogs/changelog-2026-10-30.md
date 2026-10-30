# Changelog — 2026-10-30

## 1.5.11

**PR:** [#87](https://github.com/marco-calderon/visual-living-plan/pull/87)

**Bump:** patch

### Summary

Contents icons sit in a small rounded square. Each square keeps the color that entry already uses.

### Improvements

- Each known contents icon is a 12px glyph in an 18px square with a 6px corner. The square is a light wash of that icon’s color, with a stronger edge. Pending, notes, checklists, and Workflow use a hairline square on the canvas. A heading has no square, and its text lines up with the labeled rows.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.12

**PR:** [#88](https://github.com/marco-calderon/visual-living-plan/pull/88)

**Bump:** patch

### Summary

The live-plan skill describes the primitives and page controls a plan author can use now. `npm run skills:install` copies this repo's skills into `~/.agents/skills`.

### Improvements

- The live-plan skill and `skills/live-plan/primitives.md` cover the data table, Chip, Pill, checkbox fields, autosubmit forms, choice cards, markdown tables, checklist state icons, Default / Wide / Full page widths, the file version on the description card, the sticky contents list, and the code-wrap setting.
- `npm run skills:install` copies `skills/live-plan`, `skills/living-plan`, and `.cursor/skills/version-bump` into `~/.agents/skills`. Running it again replaces those copies and leaves any other skills in that folder in place.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.13

**PR:** [#89](https://github.com/marco-calderon/visual-living-plan/pull/89)

**Bump:** patch

### Summary

The Plan, Workflow, and Settings switch is the same height as the Plans button.

### Improvements

- The page switch matches the Plans button height in light and dark. The icons stay the same size, and the Plans button is unchanged.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.14

**PR:** [#90](https://github.com/marco-calderon/visual-living-plan/pull/90)

**Bump:** patch

### Summary

Plan, Workflow, and Settings all sit inside the page switch, and choosing one is a Back and Forward step.

### Bugs fixed

- The settings tab was clipped, and the workflow icon sat outside the page switch. The switch wraps Plan, Workflow, and Settings again, at the same height as the Plans button.

### Improvements

- Choosing Plan, Workflow, or Settings adds a history step. Back and Forward return to the previous tab and scroll position, the same way a plan jump does.

### Notes

No registry restart needed beyond the usual version check.

## 1.5.15

**PR:** [#91](https://github.com/marco-calderon/visual-living-plan/pull/91)

**Bump:** patch

### Summary

A data-table cell can wrap onto more than one line, or wrap inside a percentage of the table. Cells without that stay on one line.

### New features

- `<Cell wrap>` breaks that cell onto more than one line. `<Cell wrap="40%">` or `<Cell wrap={40}>` wraps it inside 40% of the table, and the column header wraps inside that share. A cell without `wrap` stays on one line, and the table still scrolls sideways when those columns do not fit.

### Notes

No registry restart needed beyond the usual version check.

## 1.6.0

**PR:** [#93](https://github.com/marco-calderon/visual-living-plan/pull/93)

**Bump:** minor

### Summary

`serve` and `review` can host a plan on a signed-in Worker. The local machine service stays the default.

### New features

- `live-plan account login --url https://host` stores an account session in `~/.config/living-plan/cloud.json`. `LIVE_PLAN_CLOUD_URL` supplies the host when `--url` is omitted.
- `serve --cloud` and `review --cloud` register the plan, write `cloudId` into the frontmatter, and print an https URL. They do not start the local registry. `events`, `wait`, `watch`, `mode`, `execution`, `addressing`, `reply`, `address`, and `close` use that URL. `dashboard`, `tui`, `logs`, and `lan` stay on this machine.

### Notes

No registry restart needed beyond the usual version check. Deploying the Worker is a separate step, described in `cloud/README.md`.

## 1.6.2

**PR:** [#94](https://github.com/marco-calderon/visual-living-plan/pull/94)

**Bump:** patch

### Summary

After you sign in on the hosted service, the browser lands on a signed-in page instead of a missing `/review` page.

### Bugs fixed

- Signing in sent the browser to `/`, and a saved redirect from the previous site on that hostname continued to `/review`. Both addresses now show that the account is signed in and that the plan URL comes from `serve --cloud`.

### Notes

Redeploy the Worker from `cloud/` for this page to show on the host. No registry restart needed beyond the usual version check.

## 1.6.3

**PR:** [#92](https://github.com/marco-calderon/visual-living-plan/pull/92)

**Bump:** patch

### Summary

Search and sort on a data table stay off until a column turns them on. The search field and the row count share one line. Cells, wrap, the state filter, and sideways scroll are unchanged.

### Bugs fixed

- The search field and the row count are centered on the same line.

### New features

- `<Column search>` includes that column in the search field. The field is hidden when no column sets `search`. `<Column sort>` adds a header button for that column. Other headers stay plain.

### Notes

No registry restart needed beyond the usual version check.

## 1.6.4

**PR:** [#95](https://github.com/marco-calderon/visual-living-plan/pull/95)

**Bump:** patch

### Summary

The hosted sign-in page, the page after sign-in, and the hosted plan shell use the document design system.

### Improvements

- Sign-in and signed-in pages use the canvas, surface card, hairline, ink, and pill buttons from the design system, including dark mode.
- The hosted plan page uses the same white canvas and DM Sans stack as the local plan page.

### Notes

Redeploy the Worker from `cloud/` for these pages to show on the host. No registry restart needed beyond the usual version check.

## 1.6.5

**PR:** [#96](https://github.com/marco-calderon/visual-living-plan/pull/96)

**Bump:** patch

### Summary

The live-plan skill tells an author that loopback stays the default host, and that `live-plan account login` plus `serve --cloud` is the opt-in cloud host.

### Improvements

- `skills/live-plan` states that `serve` and `review` stay on loopback unless `--cloud` is passed, and shows `live-plan account login --url https://<host>` and `live-plan serve path/to/work.plan.md --cloud`.
- `skills/living-plan` points at that same default and those commands.

### Notes

No registry restart needed beyond the usual version check.

## 1.6.6

**PR:** link once known

**Bump:** patch

### Summary

A signed-in cloud account has a dashboard. Appearance settings are stored on the host, and a hosted plan page is different from a loopback plan page.

### New features

- `/`, `/review`, and `/dashboard` on the cloud host show the account, its tier, open hosted plans, and appearance settings. Saving writes those settings to D1 for that account.
- A hosted plan page shows an account settings panel for the owner, and a hosted-plan note for everyone else. A loopback plan keeps the local theme file and does not ask for an account.

### Notes

Redeploy the Worker from `cloud/` and apply D1 migrations so the `user_settings` table exists. No registry restart needed beyond the usual version check.
