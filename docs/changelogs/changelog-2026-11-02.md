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

## 1.10.0

**PR:** [#123](https://github.com/marco-calderon/visual-living-plan/pull/123)

**Bump:** minor

### Summary

The plan page keeps a copy of the open plan on this device. Answers, comments, and reviews queue while the network is down and send once when it returns. The hosted app and the local plan page both do this.

### New features

- A browser database stores the open plan, comments, hosted dashboard summaries, and appearance. The title bar shows when the page is offline, how many writes are waiting, or that one write failed.
- Submissions are sent once. Repeating the same write does not add a second event. An edit from the agent replaces the on-device plan.

### Notes

No registry restart needed beyond the usual version check. A plan opened over plain HTTP on the local network stays on the network. The registry, the hosted database, and the plan room remain the source of truth.

## 1.10.1

**PR:** [#124](https://github.com/marco-calderon/visual-living-plan/pull/124)

**Bump:** patch

### Summary

Offline answers, comments, and the title bar status work as 1.10.0 intended on the local plan page and the hosted app.

### Bugs fixed

- The first answer made with no network is queued. It no longer fails with "Could not send" because a script was missing from the offline cache.
- A comment on a plan section is accepted. Before, every such comment was refused as "The plan part is gone", even online.
- A write that reaches the host is no longer counted as failed in the title bar, and the page no longer throws an error after each submission.
- A write queued before an agent edit is refused as a conflict. It no longer depends on whether the page saw the edit before the queue sent it.
- With no network, the page keeps comments on or off as last set on this device.
- The local plan service serves the browser database file as `application/wasm`.

### Notes

The new service version replaces the running registry through the usual version check. The new shell cache name replaces the 1.10.0 cache.

## 1.11.0

**PR:** pending

**Bump:** minor

### Summary

Living Plan can be installed as an app from the browser's install prompt. The hosted app and the local plan service both offer it.

### New features

- Both hosts serve a web app manifest. Every page links it, so Chrome, Edge, and other browsers show the install option on HTTPS or loopback. The installed app opens the dashboard in its own window, uses the Living Plan mark, and matches the light or dark title bar color.

### Notes

The new service version replaces the running registry through the usual version check. The new shell cache name replaces the 1.10.1 cache. A plan opened over plain HTTP on the local network is not installable.
