# Changelog — 2026-10-31

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
