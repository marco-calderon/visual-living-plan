# Architecture decisions

Decisions are numbered in the order they were made. Superseded decisions stay here so later changes are readable.

| ADR | Date | Status | Decision |
|---|---|---|---|
| [0001](0001-one-server-per-plan.md) | 2026-10-09 | Superseded by 0004 | One HTTP server per living plan |
| [0002](0002-shared-registry-catalog.md) | 2026-10-10 | Superseded by 0004 | A shared registry only catalogs plan processes |
| [0003](0003-agent-event-stream.md) | 2026-10-10 | Accepted | Push user submissions to the agent on an event stream |
| [0004](0004-one-plan-service.md) | 2026-10-10 | Accepted | One machine service hosts every plan |
| [0005](0005-private-server-escape-hatch.md) | 2026-10-10 | Accepted | `--no-registry` keeps a private one-plan server |
| [0006](0006-session-durability.md) | 2026-10-10 | Accepted | Persist sessions, idle them out, restart on version change |
| [0007](0007-serve-stays-a-client.md) | 2026-10-11 | Accepted | `serve` stays a client and hears that plan's submissions |
| [0008](0008-dashboard-window-query.md) | 2026-10-12 | Accepted | Dashboard period filters run inside the finished-run query |
| [0009](0009-plan-part-comments.md) | 2026-10-13 | Accepted | Comments on plan parts use the same agent event stream |
| [0010](0010-local-hostname.md) | 2026-10-15 | Superseded by 0016 | Loopback plans are published as living-plan.local |
| [0011](0011-live-session-mode.md) | 2026-10-15 | Accepted; review re-entry updated by 0034 | Session mode is live on the open tab, and review leaves the plan open |
| [0012](0012-submission-delivery.md) | 2026-10-17 | Accepted; `serve` default updated by 0035 | Submissions are stored with `delivered_at` and the CLI exits after printing them |
| [0013](0013-iterate-keeps-review.md) | 2026-10-18 | Accepted; review re-entry updated by 0034; delivered comments in progress by 0035 | Iterate leaves the session in review and comments record an outcome |
| [0014](0014-comment-replies.md) | 2026-10-19 | Accepted | An agent reply is stored on the comment and shown on its thread |
| [0015](0015-service-logs.md) | 2026-10-22 | Accepted | Diagnostic logs are files under the config home, by day and by plan |
| [0016](0016-loopback-address.md) | 2026-10-22 | Accepted | Loopback plans are published as 127.0.0.1 |
| [0017](0017-xdg-config-home.md) | 2026-10-27 | Accepted | Machine config, registry, and logs live under ~/.config/living-plan |
| [0018](0018-markdoc-plan-tags.md) | 2026-10-27 | Superseded by 0020 | Plan entries are Markdoc tags, rendered to the existing section HTML |
| [0019](0019-lan-publishing.md) | 2026-10-28 | Accepted | LAN publishing is opt-in and does not replace the loopback URL |
| [0020](0020-mdx-plan-page.md) | 2026-10-28 | Accepted; fence rewrite superseded by 0021 | The plan page is the MDX React app; Markdoc is not on the render path |
| [0021](0021-mdx-plan-entries.md) | 2026-10-28 | Accepted | Agents author MDX components; Markdoc tags and YAML entry fences are not parsed |
| [0022](0022-opt-in-cloud-host.md) | 2026-10-30 | Accepted; page host updated by 0023; viewer cookie superseded by 0028 | `--cloud` hosts a plan on a signed-in Worker; the local service stays the default |
| [0023](0023-tanstack-start-page.md) | 2026-10-30 | Accepted | TanStack Start is the web application; the browser still compiles MDX |
| [0024](0024-one-plan-store.md) | 2026-11-01 | Accepted; plan tables updated by 0025 | One SQLite store for local plans and D1 for hosted plans; Elysia on every HTTP route |
| [0025](0025-one-plan-schema.md) | 2026-11-01 | Accepted | One plan schema for the local registry and D1, with configuration in `meta` |
| [0026](0026-browser-offline-store.md) | 2026-11-02 | Accepted | The browser keeps a device copy of the open plan; the registry, D1, and the Durable Object stay the authority |
| [0027](0027-offline-dashboard-and-owned-plans.md) | 2026-11-02 | Accepted | The installed app opens the dashboard offline, and this device keeps the account's plans |
| [0028](0028-owner-only-hosted-plans.md) | 2026-11-03 | Accepted | Hosted plans open only for the owning account; the signed view link is retired |
| [0029](0029-page-stream-catches-up.md) | 2026-11-05 | Accepted | A plan page catches up from `hello` after a drop, and the host merges execution start, push, and stop |
| [0030](0030-agent-presence.md) | 2026-11-06 | Accepted | A plan is active only while an agent holds its agent stream open; the page and the dashboard follow each connect and drop |
| [0031](0031-agent-slots.md) | 2026-11-07 | Accepted | The tier caps plans with an agent listening, not open plans; the Worker checks it when an agent connects |
| [0032](0032-storage-limit.md) | 2026-11-07 | Accepted | Each account has a storage limit for saved versions; deleting a plan from the dashboard frees its storage |
| [0033](0033-page-editor.md) | 2026-11-07 | Accepted | A person edits a local or hosted plan on the page as a draft on their device, and Publish makes a new version; the agent hears an `edit` event |
| [0034](0034-listeners-reconnect-across-modes.md) | 2026-11-11 | Accepted | Waiting commands reconnect after drops and restarts; one `events --follow` prints every mode change; entering review keeps an unread verdict |
| [0035](0035-six-plan-commands.md) | 2026-11-11 | Accepted | Six commands drive a plan, named by its file; `serve` returns; `reply` answers and closes a comment; after approval the run follows the file |
| [0036](0036-desktop-app.md) | 2026-11-11 | Accepted; plans open in it by 0037 | The desktop app is a Tauri window on the local plan service; it ships the bundled CLI and Bun, and uses a running service of any version |
| [0037](0037-plans-open-in-the-desktop-app.md) | 2026-11-11 | Accepted | A plan opens in the desktop app through `living-plan://plans/<id>` when it is installed; otherwise the browser, where the installed web app claims the link |

Add the next decision as `0038-short-name.md` and link it in this table. Record the date, the status, what was decided, and what it replaced.
