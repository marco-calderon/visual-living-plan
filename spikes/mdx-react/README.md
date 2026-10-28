# MDX React plan page

The plan column people open. The service mounts this app (`client/planMdx.tsx`) and stores source history with the snapshot tables below. Markdoc is not on the render path.

The folders here are the React entries, the MDX compile, and the snapshot shape. `bun spikes/mdx-react/server/index.ts` still runs the sample host by itself.

| Path | What it is |
|---|---|
| `app/` | Vite host page. One shared `EventSource`, snapshot list, restore, and the rendered plan. |
| `server/` | Bun server. SQLite stores plan documents and append-only snapshots. |
| `ui/` | Plan entry components. The host uses this map for phase, choice, form, and the other entries. |
| `mdx/` | Sample plan, Pele mermaid, TanStack charts, and the ELK workflow. |
| `server/protocol.ts` | Event names, row shapes, and `PlanHostProps`. |

## Run

From the repo root, in one terminal:

```bash
bun spikes/mdx-react/server/index.ts
```

In another:

```bash
cd spikes/mdx-react/mdx && bun install
cd ../app && bun install && bun run dev
```

Open `http://127.0.0.1:5199/`. The server listens on `127.0.0.1:9488`. Vite proxies `/events` and `/api` to it.

`MDX_SPIKE_PORT` changes the server port (default `9488`). `MDX_SPIKE_DB` changes the SQLite file (default `spikes/mdx-react/server/data/plans.sqlite`). An empty database stores `mdx/sample-plan.mdx` as plan `plan_sample`.

```bash
bun test spikes/mdx-react/server/server.test.ts spikes/mdx-react/app/src/reducePlanStream.test.ts
```

## One shared event stream

The page opens a single `EventSource` on `GET /events` and keeps it for the life of the page. Listeners subscribe through `app/src/planStream.ts`. React effect cleanup removes a listener. It does not open a second stream. The browser closes the stream on `pagehide` / `beforeunload`.

App events go to the server with `POST /events`:

```json
{ "event": "edit", "data": { "planId": "plan_sample", "body": "# Sample plan\n" } }
```

The server writes SQLite, then publishes that same event name on the shared stream, followed by `snapshot` and `plan`. Every open client, including the sender, updates from those events. A snapshot or a remote edit replaces the open plan in memory. The page does not reload.

`GET /events` sends `hello` on every connection, including a reconnect. `hello` is the full document list and every snapshot. Later events update that store in place.

```bash
curl -N http://127.0.0.1:9488/events
curl -X POST http://127.0.0.1:9488/events \
  -H 'content-type: application/json' \
  -d '{"event":"edit","data":{"planId":"plan_sample","body":"# Sample plan\n\nEdited.\n"}}'
```

### Server → app (`GET /events`)

| Event | Data | When |
|---|---|---|
| `hello` | `{ plans: PlanDocument[], snapshots: SnapshotRecord[] }` | Once per connection. Replace local state. |
| `create` | `{ plan, snapshot }` | A document was created. |
| `edit` | `{ plan, snapshot }` | The head document changed. |
| `restore` | `{ plan, snapshot }` | A new head was appended from an older snapshot. `snapshot.restoredFromId` is that older id. |
| `snapshot` | `{ snapshot }` | The same snapshot row, for a listener that only watches history. |
| `plan` | `{ plan }` | The same document, for a listener that only watches the open plan. |

Publish order for a change is `create` or `edit` or `restore`, then `snapshot`, then `plan`. Applying all three is idempotent. The first event already contains the new document and the new snapshot.

Comments shaped like `: ping` are keepalives. They are not events.

### App → server (`POST /events`)

| Event | Data | Result |
|---|---|---|
| `create` | `{ title, body }` | New document, snapshot `seq` 1, `reason: "create"`. |
| `edit` | `{ planId, body, title? }` | Updates the document and appends `reason: "edit"`. Omitted `title` keeps the current title. |
| `restore` | `{ planId, snapshotId }` | Copies that snapshot's title and body onto the document and appends `reason: "restore"`. |

The response is `{ ok, changed, plan, snapshot }`. `snapshot` is `null` and nothing is published when the edit matches the head, or when restore targets the head snapshot.

| Status | Meaning |
|---|---|
| 200 | Applied, or no change was needed. |
| 400 | Unknown event, or a field is missing or the wrong type. |
| 404 | Unknown plan, or a snapshot that is not on that plan. |
| 413 | JSON body over 1,000,000 bytes. |
| 415 | `Content-Type` is not JSON. |

Title is trimmed, must be non-empty, and must be at most 200 characters. Body is kept as given, including an empty string, and must be at most 500,000 characters.

### Read API

| Method | Path | Body |
|---|---|---|
| `GET` | `/health` | `{ ok: true }` |
| `GET` | `/api/plans` | `{ plans }` |
| `GET` | `/api/plans/:id` | `{ plan, snapshots }` |
| `GET` | `/api/plans/:id/snapshots` | `{ snapshots }` |

Writes go through `POST /events` only.

## Snapshot tables

SQLite file, `user_version` 1. `bun:sqlite` with foreign keys on. History is append-only: restore does not delete later snapshots.

### `plan_documents`

The current plan. One row per document.

| Column | JSON | |
|---|---|---|
| `id` | `id` | Text primary key. Sample row: `plan_sample`. |
| `title` | `title` | |
| `body` | `body` | MDX source. The shell stores it as text. |
| `created_at` | `createdAt` | Unix milliseconds. |
| `updated_at` | `updatedAt` | Unix milliseconds. Moves on each change. |
| `head_snapshot_id` | `headSnapshotId` | Snapshot the document shows now. |

### `plan_snapshots`

One row per server change.

| Column | JSON | |
|---|---|---|
| `id` | `id` | Text primary key. Sample row: `snap_sample`. |
| `document_id` | `documentId` | Plan this snapshot belongs to. |
| `seq` | `seq` | `1…n` per document. Unique with `document_id`. |
| `parent_id` | `parentId` | Previous head. Null on the first snapshot. |
| `title` | `title` | Title at this version. |
| `body` | `body` | Source at this version. |
| `reason` | `reason` | `create`, `edit`, or `restore`. |
| `restored_from_id` | `restoredFromId` | Snapshot whose source was copied. Null unless `reason` is `restore`. |
| `created_at` | `createdAt` | Unix milliseconds. |

`parent_id` is the head chain. Restoring snapshot 1 while the head is snapshot 3 appends snapshot 4 with `parent_id` 3, `restored_from_id` 1, and the same title and body as snapshot 1. The document's `head_snapshot_id` becomes 4.

## Host page

`app/` renders the connection, the plan switcher, the snapshot list, restore, and the raw source sender. Those controls post `create`, `edit`, and `restore`.

The open document is compiled as MDX and rendered inside:

```html
<div data-plan-root data-plan-id="…" data-snapshot-id="…"></div>
```

`data-snapshot-id` is the head snapshot. A `plan` event replaces `body`, the host compiles that source again, and the slot updates without a reload.

The component map is `ui`'s `components`. `workflow` is the ELK layout from `mdx/Workflow`. `Mermaid` is Pele. `BarChart` and `LineChart` are TanStack charts. `Stack` and `Row` come from `mdx` because the sample uses those layout tags.

`window.__MDX_PLAN_HOST__` exposes the open plan: `plan`, `snapshots`, `edit`, `restore`, `create`, `open`.
