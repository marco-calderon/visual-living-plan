# Changelog — 2026-11-02

## 1.7.17

**PR:** [#119](https://github.com/marco-calderon/visual-living-plan/pull/119)

**Bump:** patch

### Summary

The Plan and Workflow controls on the plan title bar use Lucide icons.

### Improvements

- Plan uses the Lucide FileText icon. Workflow uses the Lucide Workflow icon. Both stay 16px and use the title bar color.

### Notes

No registry restart needed beyond the usual version check.

## 1.8.0

**PR:** [#120](https://github.com/marco-calderon/visual-living-plan/pull/120)

**Bump:** minor

### Summary

A signed-in hosted email account can link GitHub and Google from Settings. The provider email has to match the account.

### New features

- Settings shows Link GitHub and Link Google. A provider that is already linked stays disabled. A different provider email is not attached. A loopback plan does not show this section.

### Notes

No registry restart needed beyond the usual version check.

## 1.8.1

**PR:** [#122](https://github.com/marco-calderon/visual-living-plan/pull/122)

**Bump:** patch

### Summary

Other websites can no longer submit to a plan through your browser, and the cloud host closes the right plans for the right people. `npm run typecheck` passes again, so publishing works.

### Bugs fixed

- The local plan service refuses a request whose `Host` is not this machine, which blocks DNS rebinding.
- The local plan service refuses a write whose `Origin` is another site, so a web page cannot approve a review or answer a form.
- The cloud host no longer marks a plan as executed when the close request had no valid credential.
- The cloud host no longer forwards outside requests to the plan's internal setup route.
- The plan owner can close a hosted plan from the account, and that now closes the live plan as well as the catalog row.
- `npm run typecheck` passes again. The publish workflow runs it.

### Notes

No registry restart needed beyond the usual version check.

## 1.9.0

**PR:** [#121](https://github.com/marco-calderon/visual-living-plan/pull/121)

**Bump:** minor

### Summary

The hosted app and the local plan page keep a versioned copy of the app shell. HTML, JavaScript, CSS, and other static assets load from that cache. Plan APIs, auth, and account JSON stay on the network.

### New features

- A service worker caches the app shell for the hosted app and the local plan page. The cache name is the package version, so the next deploy drops the previous cache. One account's cached page is not reused for another.

### Notes

No registry restart needed beyond the usual version check.
