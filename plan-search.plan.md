---
cloudId: 153c44ff-cb9c-45f3-a62e-2225d9030109
title: Search a plan and its versions
summary: Add a search endpoint on the local service and the cloud host, and a `live-plan search` command that finds terms in the live plan or a saved version, block by block.
agent: claude-code
mode: watch
---
# Search a plan and its versions

An agent that resumes work, or a person who asks "when did we decide fail-open?", has no way to look inside a plan except reading the whole file or opening each saved version by hand. This change adds search. One endpoint answers on both hosts. One CLI command calls it. A query can hold several terms, and results point at the plan block (phase, callout, choice, and the rest) that matched, not just a raw line.

<workflow id="search-path" title="How the change lands">
```workflow
core | Search core | core
local | Local endpoint | local
cloud | Cloud endpoint | cloud
cli | CLI command | cli
decision | Decisions | decision
docs | Docs and skill | docs
release | Tests and release | done-when
--
decision -> core
core -> local
core -> cloud
local -> cli
cloud -> cli
cli -> docs
docs -> release
```
</workflow>

## What exists today

| Host | Live document | Saved versions | Where |
|---|---|---|---|
| Local service | The watched `.plan.md` on the session | Every change, no cap, in `plan_versions` (SQLite) | `src/planSnapshots.ts`, `src/planSession.ts` |
| Cloud host | The source the plan object holds | Latest 10, in `plan_versions` (D1) | `src/host/planVersions.ts`, `src/host/planObject.ts` |

Both tables share one schema: `plan_id`, `seq`, `title`, `body`, `created_at`. `parsePlan` in `src/parse.ts` already turns a body into typed blocks with ids, titles, and per-block `source`, and the plan object on the Worker already imports it. So search can reuse the parser on both hosts.

<phase id="core" title="Search core" status="done">
Add `src/planSearch.ts`, a pure module with no I/O, so the local service and the Worker run the same code.

**Query parsing.** `parseSearchQuery(input)` splits on whitespace, keeps a `"double quoted phrase"` as one term, lowercases, drops duplicates, and caps the query at 10 terms and 200 characters. An empty query is a 400.

**Body parsing.** `searchPlanSource(source, terms, options)` runs `parsePlan` and walks `blocks`. For each block it builds the searchable text from what a reader sees:

| Block | Text searched |
|---|---|
| `phase`, `callout`, `approve` | title or prompt, then body source |
| `choice` | prompt, each option label and description |
| `form` | prompt, field labels, select options |
| `questions`, `checklist` | prompt or title, each item |
| `workflow` | node labels and details |
| `markdown` | the markdown source, split at headings |

Component tags and attribute names are stripped first, so `status` or `phase` only match when a reader would see the word.

**Hits.** Each hit carries `blockId` (the same id a `<workflow>` ref or a comment `partId` uses), `type`, `title`, `line` (1-based, in the full file), a `snippet` of about 160 characters around the first match, and `matched` (the terms found in that block). Hits are ordered by the number of distinct terms matched, then by position.

**Fallback.** An old version that no longer parses (for example a legacy `{% tag %}` body) is searched line by line instead, and its result says `parsed: false`. A version is never dropped from the results because it fails to parse.

```ts
export type SearchHit = {
  blockId?: string
  type: PlanBlock['type'] | 'line'
  title?: string
  line: number
  snippet: string
  matched: string[]
}
export type VersionResult = {
  seq: number | 'live'
  title: string
  createdAt: number
  live: boolean
  parsed: boolean
  hits: SearchHit[]
}
```
</phase>

<phase id="local" title="Local endpoint" status="done">
Add `GET /plans/<id>/api/search` to `src/planRoutes.ts` (and `/api/search` on the `--no-registry` server, which shares those routes). The handler calls a new `search(query)` on the session in `src/planSession.ts`.

| Param | Values | Default |
|---|---|---|
| `q` | the query text | required |
| `version` | `live`, a version number, or `all` | `live` |
| `match` | `all` or `any` | `all` |

`live` searches the session's current source. A number reads that row through the snapshot store (`mdxStore`). `all` searches the live source plus every saved version, newest first; a saved version whose body equals the live source is folded into the live result so it is not listed twice. A version number that does not exist is a 404. The route is a read, so it follows the same loopback `Host` check as `/api/plan` in `src/requestGuard.ts`.

```json
{
  "planId": "abc12345",
  "query": "redis \"fail open\"",
  "terms": ["redis", "fail open"],
  "match": "all",
  "versions": [
    { "seq": "live", "title": "Rate limiting rollout", "live": true, "parsed": true,
      "hits": [{ "blockId": "fail-mode", "type": "choice", "line": 98, "snippet": "…Allow traffic if Redis is down…", "matched": ["redis", "fail open"] }] }
  ]
}
```
</phase>

<phase id="cloud" title="Cloud endpoint" status="done">
The same path on the host, `GET /plans/<id>/api/search`, is already forwarded by `forwardPlan` in `src/host/app.ts` to the plan's Durable Object. Handle it there, in `src/host/planObject.ts`:

- **Access.** Add a `search` action to `allows` in `src/host/access.ts`. Today `read` admits `account` and `viewer` but not `plan`, so the CLI's plan bearer would be refused. `search` admits `account` and `plan` for every version. A `viewer` may search `live` only, because saved versions are owner-only today (`planOwner` guards `/plans/<id>/versions/<seq>/document`).
- **Live.** The source the object holds now.
- **Versions.** Read `plan_versions` from `env.DB` with `readPlanVersion` and `listPlanVersions` from `src/host/planVersions.ts`. Only the latest 10 exist on the host, so `--version 3` on a plan at version 14 returns 404 with "This version is no longer saved. The host keeps the latest 10."
- **Cost.** At most 11 documents are parsed per request. Cap the response at 200 hits and set `truncated: true` past that.

The response shape is the same as the local one, so the CLI does not branch on the host.
</phase>

<phase id="cli" title="CLI command" status="done">
Add `live-plan search` in `src/cli.ts`, built like `reply`: it resolves the URL with `localServiceUrl`, adds `cloudRequestHeaders`, and calls `planApiUrl(url, '/api/search')`. It works on a local URL and a `--cloud` URL alike.

```bash
live-plan search --url <plan-url> --query redis --query "fail open"
live-plan search --url <plan-url> --query "429 retry" --version 3
live-plan search --url <plan-url> --query limiter --version all --any --json
```

| Flag | Meaning |
|---|---|
| `--url` | The printed plan URL. Required |
| `--query`, `-q` | Search terms. Repeat it for more terms; spaces inside one value also split terms, quotes keep a phrase. Required |
| `--version` | `live` (default), a version number, or `all` |
| `--any` | Match blocks with any term instead of every term |
| `--json` | Print the response JSON instead of the text listing |
| `--token` | Plan bearer, as on the other `--url` commands |

Text output, one line per hit, grouped by version:

```text
live  Rate limiting rollout
  choice  fail-mode  L98   …Allow traffic if Redis is down. Prefer availability…
v3    Rate limiting rollout
  callout redis-dependency  L71  …A Redis outage must not take down the API…
```

Exit `0` with hits, `2` with no hits, `1` on a usage or request error. `getFlag` in `src/cli.ts` returns only the first value, so add `getFlags` to collect every `--query` / `-q`.
</phase>

<callout id="decision" title="Decisions" kind="decision">
Approved on 2026-11-07 with one change.

- **Scope:** one plan, found by `--url`. Searching across all plans is left for a later change.
- **Live by default:** a search reads only the live plan. Saved versions are read only when the caller asks with `version` (`--version <n>` or `--version all` on the CLI). Without it, no saved version is loaded or parsed.
- **Matching:** every term must appear in the same block. `--any` (`match=any`) returns blocks with at least one term, ranked by how many matched.
</callout>

<phase id="docs" title="Docs and skill" status="done">
The CLI contract changes, so per `docs/context.md`:

- Add `search` to the Commands table and the Loop examples in `skills/live-plan/SKILL.md`, with one line on when an agent should use it (resuming a plan, checking an earlier decision before changing it).
- Same in `docs/agent-guidelines.md`.
- Add the route to `docs/architecture/README.md` next to the version routes.
- Leave `skills/live-plan/primitives.md` alone. The plan vocabulary does not change.
</phase>

<checklist id="done-when" title="Done when">
<item done="true">
`test/planSearch.test.ts` covers query parsing (phrases, duplicates, caps), each block type, tag stripping, `all` versus `any`, ranking, line numbers, and the unparsed fallback
</item>
<item done="true">
`test/planSearch.test.ts` covers `/api/search` on the local service for `live`, a number, `all`, a missing version (404), and an empty query (400)
</item>
<item done="true">
`test/planSearch.test.ts` covers the cloud handler with the account, the plan bearer, a viewer (live only, 403 on versions), neither (401), and a version older than the latest 10 (404). `test/hostApp.test.ts` checks the Worker forwards the query
</item>
<item done="true">
CLI test for repeated `--query`, `--version`, `--any`, `--json`, and the 0 / 2 / 1 exit codes
</item>
<item done="true">
`bun test ./test` and `bun run typecheck` pass (the 14 browser tests that fail here fail on main too: the installed Chromium is not the build Playwright expects)
</item>
<item done="true">
Minor bump to 2.13.0 with `docs/changelogs/changelog-2026-11-07.md`, per the version-bump skill
</item>
</checklist>

<callout id="risks" title="Risks" kind="risk">
- **Parse cost on the Worker.** `parsePlan` compiles MDX outlines. Eleven documents per request should be fine, but measure one request in `wrangler dev` and cache parsed results per `(planId, seq)` in the object if it is slow.
- **Old versions.** Bodies saved before the MDX switch may not parse. The line fallback keeps them searchable.
- **Snippets leak nothing new.** A hit only returns text from documents the caller can already read through `/plans/<id>/versions/<seq>/document`.
</callout>
