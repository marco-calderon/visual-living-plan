# Changelog — 2026-10-31

## 1.7.7

**PR:** [#107](https://github.com/marco-calderon/visual-living-plan/pull/107)

**Bump:** patch

### Summary

Settings has a back button above the page content. It returns to the previous page.

### Improvements

- The settings page shows a back button with a left arrow above the settings content. It follows the previous history entry.

### Notes

No registry restart needed beyond the usual version check.

## 1.7.6

**PR:** [#108](https://github.com/marco-calderon/visual-living-plan/pull/108)

**Bump:** patch

### Summary

The title bar shows the Living Plan mark again.

### Bugs fixed

- The hosted title bar logo is the circle mark. A request for `/favicon.png` no longer returns the page HTML, which the browser drew as a broken image.

### Notes

No registry restart needed. The local plan page uses the same `/favicon.png` mark.

## 1.7.5

**PR:** [#106](https://github.com/marco-calderon/visual-living-plan/pull/106)

**Bump:** patch

### Summary

Code fences and diff hunks on a rendered plan are syntax highlighted.

### Bugs fixed

- A fenced code block and a diff hunk on the local plan page and the hosted plan page use Pierre token colors. Keywords, strings, and names are no longer one plain monospace color.

### Notes

No registry restart needed beyond the usual version check.

## 1.7.4

**PR:** [#105](https://github.com/marco-calderon/visual-living-plan/pull/105)

**Bump:** patch

### Summary

Action buttons use one shared pill with 8px by 12px padding.

### Improvements

- Submit, Send answers, Approve, Deny, Edit, Open workflow diagram, and table paging use the button component.
- Sign-in, Create account, Refresh, the account control, comment send, and the review Deny button use that same padding.
- The design system records 8px 12px on the primary, secondary, tertiary, and danger pills.

### Notes

Icon controls keep their own size: the logo, the page icons, the stepper, and the send arrow. No registry restart needed.

## 1.7.3

**PR:** [#104](https://github.com/marco-calderon/visual-living-plan/pull/104)

**Bump:** patch

### Summary

Agents working in this repo can use Hallmark, the design skill that keeps new pages from looking generated.

### Improvements

- Hallmark from [nutlope/hallmark](https://github.com/nutlope/hallmark) is installed at `.agents/skills/hallmark`, beside the other third-party skills. `npm run skills:install` still copies only this repo's own skills and leaves Hallmark in place.

### Notes

No registry restart needed. The plan page is unchanged.

## 1.7.2

**PR:** [#103](https://github.com/marco-calderon/visual-living-plan/pull/103)

**Bump:** patch

### Summary

The account dashboard lists a hosted plan that was saved before its document history existed.

### Bugs fixed

- The account dashboard lists a hosted plan when its saved document was not in the versions table. Opening the dashboard stores that document, so the plan file link works.

### Notes

No registry restart needed beyond the usual version check. The hosted dashboard shows that plan after this worker is deployed.

## 1.7.1

**PR:** [#102](https://github.com/marco-calderon/visual-living-plan/pull/102)

**Bump:** patch

### Summary

A hosted plan uses the same shell as the local plan page.

### Bugs fixed

- A hosted plan shows the title bar, Plan and Workflow, and the contents list. Dark mode themes the diagrams and phase cards with the page.

### Notes

No registry restart needed beyond the usual version check.
