# Changelog — 2026-10-31

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
