# Tools as the way an agent waits on a plan

- Status: Research. Nothing here is built. A decision would go in [docs/architecture/decisions](../architecture/decisions/README.md).
- Date: 2026-11-17
- Question: can tools (MCP tools, served by `live-plan` itself) replace or sit beside `events` as the way an agent waits for a person on the plan page and reacts? Which actions can be tools? Where do harnesses and models limit it? Is it better overall, locally and in the cloud?

## Short answer

Yes, it is feasible locally and in the cloud, with no change to the plan service. A spike (below) ran a stdio MCP server against the real local service. A blocking tool call returned a click on the page in about 40 ms. A cancelled call lost nothing. The CLI and the tool shared one delivery queue without double delivery.

It is better than `events` as the **primary** interface where MCP is set up. It is not a full replacement:

- A tool result is the one wake-up every tool-using model and harness handles the same way. Today's loop depends on the harness re-invoking the agent when a background process exits, and most harnesses other than Claude Code do not.
- Tools take typed input and return typed output. There is no shell quoting of `reply --text`, no stdout and stderr parsing, and one permission rule (`mcp__living-plan__*`) instead of a prompt per command.
- MCP servers run outside the shell sandbox in harnesses whose default sandbox turns network off for commands, such as Codex `workspace-write` (reported, see below). `bunx visual-living-plan events` cannot reach the service there. An MCP server can.
- A remote MCP server on the hosted app reaches places with no shell at all: claude.ai, Claude Desktop chat, ChatGPT, mobile, and cloud sessions through an account connector.

What holds it back:

- **Tool-call timeouts differ by harness.** Clients built on the MCP TypeScript SDK time out a request at 60 seconds unless they change it; the spike measured that. Codex defaults to 60 seconds and claude.ai connectors allow 240 seconds. Claude Code allows about 27.8 hours and moves a call longer than 2 minutes to the background. A wait has to be a long poll with a bounded window, and the window has to suit the client.
- **The current MCP spec (2026-07-28) is stateless.** On HTTP a dropped stream cancels the call. Long waits only work because the queue is already durable on the server.
- **A blocking call blocks the turn** in most harnesses. The agent cannot work while it waits, except in Claude Code (auto-background, MCP Tasks) and where MCP Tasks are supported.
- **Long polls cost model turns.** Each window that ends with nothing costs one model round trip and a little context. That is fine for minutes. It is wasteful for hours, and some harnesses cap tool calls per request.
- **Setup.** `bunx` needs nothing installed. A tool needs the harness's MCP config (stdio) or a connector with sign-in (remote).

So the recommendation is to ship tools as a second adapter on the same queue: `live-plan mcp`. Keep `events` as the fallback and as the zero-setup path. Add push mechanisms (MCP Tasks, Claude Code channels) where a harness supports them. The [recommendation](#recommendation) section has the order.

## How the agent waits today

The baseline the tools are measured against ([ADR 0012](../architecture/decisions/0012-submission-delivery.md), [ADR 0034](../architecture/decisions/0034-listeners-reconnect-across-modes.md), [ADR 0035](../architecture/decisions/0035-six-plan-commands.md)):

- Every submission is a `plan_events` row. `delivered_at` is set when a client acks it (`POST /api/agent-events/ack`).
- `events <file>` holds the agent stream (SSE locally, a WebSocket on the host), prints the pending rows, acks them, and exits. The agent starts it again. `events --follow` stays running for agents that read output line by line.
- `followAgentEvents` reconnects through drops, restarts, and token changes.
- Presence ([ADR 0030](../architecture/decisions/0030-agent-presence.md)) and hosted slots ([ADR 0031](../architecture/decisions/0031-agent-slots.md)) count open agent streams.

This works best where the harness runs a command in the background and wakes the model when it exits (Claude Code `run_in_background`). Elsewhere the agent runs `events` in the foreground, under the shell tool's own timeout, which is already a long poll, only untyped.

## Mechanisms a tool layer can use

| Mechanism | How the agent hears the person | Where it works | Limits |
|---|---|---|---|
| Blocking call | `plan_wait` returns when a submission arrives | Every MCP client | The client's tool timeout. Blocks the turn |
| Long poll | `plan_wait` returns `timedOut` after a window, and the agent calls it again | Every MCP client | One model turn per empty window. Tool-call caps per request |
| Progress heartbeat | `notifications/progress` during the wait | Clients that reset an idle timer on progress: Claude Code's idle timeout, SDK clients that pass `resetTimeoutOnProgress` | Does not extend Claude Code's hard per-call limit. Most clients ignore it |
| Auto-background | The harness moves a long call off the turn and wakes the model when it returns | Claude Code (after 2 minutes) | Claude Code only. Off in non-interactive `-p` runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set |
| MCP Tasks (`io.modelcontextprotocol/tasks` extension, SEP-2663) | `tools/call` returns `resultType: "task"`; the host polls `tasks/get` until the task ends, and the agent keeps working | Claude Code (public beta since 2.1.304: "if Claude is idle when the result arrives, Claude starts on it unprompted"), MCPJam, Glean; Claude web per the client matrix, unverified | The 2025-11-25 experimental tasks are not wire-compatible with the extension. No progress notifications on a task. The server must store the task durably |
| Push into the session | The server sends `notifications/claude/channel` and the idle session wakes with the event | Claude Code channels | Research preview. Stdio only, interactive only. Gated, see Claude Code below |
| Push by webhook | The server POSTs a signed event to the host, and the conversation wakes | ChatGPT MCP Events (`events/list`, `events/subscribe`); the spec's Events extension (SEP-3415, accepted 2026-11-11, no reference implementation yet) | Needs durable subscriptions and outbound HTTPS from the server. Only the hosted app can do it |
| Elicitation | The server asks the person in the harness's own UI, beside the page | Clients with elicitation (see table) | It is a question to the person, not a wake-up. Flat form schemas only |
| MCP Apps (`io.modelcontextprotocol/ui`, stable 2026-01-26) | The plan renders inside the chat. A click calls a tool (`tools/call`) or puts a message in the conversation (`ui/message`) | Claude web and Desktop, ChatGPT, VS Code Copilot, M365 Copilot, Goose, Cursor, Postman, others | Claude Code hides UI resources. In Claude, `sendMessage` needs the person's consent, is capped at 8,000 characters, and must not run on a timer; app-only tools have a 45 s limit and need a remote connector. The plan page has to run in a sandboxed iframe |
| Resource subscription | Change notifications on `plan://<id>` (`resources/subscribe`, replaced by `subscriptions/listen` in 2026-07-28) | No host found that passes them to the model. Claude's hosted apps do not support them | Good for reading state, not for waking |

Not tools, but they fill the same gap in Claude Code: a Stop hook that blocks stopping while submissions are pending, and an `asyncRewake` hook, which runs in the background and wakes the model when it exits `2`.

## Every action that can be a tool

All of these map to routes the service and the hosted app already have. The stdio server is a thin adapter over the CLI's own code (`followAgentEvents`, `ackPlanEvents`, `planTarget`, `pullPageEdit`).

### Waiting

| Tool | Does | Today | Notes |
|---|---|---|---|
| `plan_wait` | Block until any submission (answer, verdict, comment, page edit) or the window ends. Returns the batch and acks it | `events` | The core tool. Window from the client (see design rules). Returns mode changes too, like `--follow` |
| `plan_wait_for` | Block until one interaction id is answered | `wait <id>` | Leaves other rows queued |
| `plan_review` | Enter review round N and block for the verdict | `review` | Returns `approve`, `deny`, or `iterate` with the comments that came with it |
| `plan_ask` | Add one choice, form, questions, or approve block to the plan and block for its answer | none | The page version of a harness's "ask the user" tool. Optionally also asks by elicitation, and the first answer wins |

### Reacting

| Tool | Does | Today |
|---|---|---|
| `plan_reply` | Answer a comment, with `outcome` or `keepOpen` | `reply` |
| `plan_mode` | Watch, comment, or review with `iteration` | `mode` |
| `plan_execution` | Start, push a live graph, or stop a run | `execution` |
| `plan_set_status` | Set a phase or checklist line's status | edit the file |

`plan_set_status` is only needed where the agent has no file to edit (remote MCP). Locally the file stays the document, as the invariants require.

### The plan itself

| Tool | Does | Today |
|---|---|---|
| `plan_check` | Validate a plan and return its blocks, ids, and workflow nodes, or the errors | `check` |
| `plan_serve` | Register (local) or publish (`cloud: true`) and return the URL | `serve` |
| `plan_status` | Mode, round, run state, presence, pending count, stored answers | `/api/plan` |
| `plan_read` / `plan_write` | Read the source and its version; replace it against a base version (409 on a stale base) | the file, `serve --cloud` uploads |
| `plan_edit_block` | Change one block by id | `src/planMdx/blockEdit.ts` |
| `plan_search` | Search one plan or every plan | `search` |
| `plan_list` / `plan_close` | The plans on this machine or account; drop one | `processes`, `close` |
| `account_status` / `account_login` | Signed in? Sign in by a link (URL elicitation, or the `/cli-token` page) | `account login` |

`plan_read`, `plan_write`, and `plan_edit_block` are what a remote MCP server needs, because it cannot see the agent's files. A stdio server does not need them.

### Resources and prompts

- `living-plan://guide/primitives` and `living-plan://guide/skill`: the authoring docs as resources, so a harness with no skill installed can still write a valid plan.
- `plan://<id>/source` and `plan://<id>/state` for reading.
- A `start-plan` prompt that writes the skeleton and serves it.

## Harnesses

HARNESS_TABLE_PLACEHOLDER

### Claude Code, read from the 2.1.327 binary

Read from the binary in this cloud container, not from the docs:

- **Hard timeout.** `MCP_TOOL_TIMEOUT`, or a per-server `"timeout"` in milliseconds, defaults to `1e8` ms (about 27.8 hours) and is capped at 2³¹−1 ms. The binary's own help text says "progress notifications do not extend it".
- **Idle timeout.** A call is aborted after "no response or progress notification" for 30 minutes on a stdio server, or 5 minutes on a remote one. `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` changes it (`0` turns it off), and so does a per-server `timeout`. **A remote `plan_wait` must send progress at least every few minutes**, or Claude Code drops it at 5 minutes.
- **Auto-background.** A tool call that runs past 120 seconds moves to the background (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, flag `tengu_mcp_auto_background`, on by default). It comes back as a task notification ("The tool call …, which ran in the background"). In an interactive session a blocking `plan_wait` therefore behaves like `events` with `run_in_background` today. It is off in non-interactive runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set.
- **MCP Tasks.** Claude Code polls a server's task and waits for `mcp_tasks_changed`. In cloud sessions a polling service follows the task ("the polling service polls it; this client polls once, then waits for mcp_tasks_changed or a person's message").
- **Channels.** A server that declares the `claude/channel` capability can send `notifications/claude/channel`, and the message reaches the session. The gates are all in the binary:
  - first-party Anthropic models only, not Bedrock, Vertex, or Foundry;
  - org policy `channelsEnabled: true`, with `allowedChannelPlugins` replacing Anthropic's default allowlist;
  - the server must be a marketplace plugin named in `--channels`, or loaded with `--dangerously-load-development-channels`;
  - a connection that negotiated the newer stateless protocol revision has "no unsolicited notification path".
- **Output cap.** `MAX_MCP_OUTPUT_TOKENS` limits a result, so a `plan_wait` result must not carry a page edit's whole source. The CLI already strips it.

## Models

- **Reacting to a tool result is universal.** Every tool-using model continues from a result. Reacting to a background process exiting depends on the harness, not the model.
- **Polling discipline varies.** Strong models call `plan_wait` again after `timedOut`. Smaller and local models sometimes end the turn ("nothing yet, I will wait") or loop without doing the work. Mitigations:
  - make the empty result say what to do: `{"timedOut":true,"next":"Call plan_wait again"}`;
  - keep the tool description explicit;
  - prefer one long window to many short ones.
- **Parallel calls.** A model that calls `plan_wait` beside other tools holds the whole turn until the wait returns, in most harnesses. The description should say to call it alone.
- **Context.** Each empty window adds roughly 100–200 tokens. A four-hour wait in 50-second windows is about 290 calls: about 40k tokens of context, and 290 full-context round trips, mostly cache reads. One long window, auto-background, or a task costs one round trip.
- **Prompt cache.** After any wait longer than the cache lifetime, the next turn reads the context uncached. That is the same cost as today's background `events`.
- **Tool count.** About ten tools is fine. Claude Code defers MCP tools behind tool search when there are many, so names and descriptions must be clear enough to be found.

## Local and cloud

| | Stdio server (`live-plan mcp`) | Remote server on the hosted app (`/mcp`) |
|---|---|---|
| Local plans (`127.0.0.1:9477`) | Yes. Reads `registry.json` for the token, maps the file to its id, revives a crashed service | No. The Worker cannot reach the agent's loopback |
| Hosted plans | Yes, through `cloud.json`, the same as the CLI | Yes, natively |
| Harnesses with a shell and MCP config | Yes | Yes |
| Chat surfaces with no shell (claude.ai, Claude Desktop chat, ChatGPT, mobile) | No | Yes, as a connector with OAuth |
| Cloud agent containers (Claude Code on the web and others) | Yes, if the repo's MCP config starts it and the container can reach the host. It needs `account login --headless` in each new container | Yes, as an account connector. No login per container, because the connector's sign-in lives with the account |
| Plan document | The agent's file | Sent with `plan_write` / `plan_edit_block`, because the server has no file |

This container reaches `https://plan.logspace.qzz.io` (it answered `307`), and `/mcp` does not exist yet (`404`).

### Cloud surfaces

| Surface | MCP | Tool-call limit | Can the person act mid-task? | Notes |
|---|---|---|---|---|
| Claude Code on the web | Repo `.mcp.json` (stdio runs in the VM), plus the account's claude.ai connectors | As Claude Code: about 28 h, idle 5 min remote and 30 min stdio, auto-background at 2 min | Yes: web, mobile, elicitation cards | Default network is Limited, so `plan.logspace.qzz.io` must be an allowed domain for a stdio server. Connector traffic goes through Anthropic and skips that allowlist. The VM pauses after a few idle minutes; whether a pending MCP call counts as activity is unverified |
| claude.ai, Claude Desktop, mobile | Remote connector (Streamable HTTP), OAuth by CIMD or DCR | **240 s per call**, about 150k characters per result | Yes, in the chat, and through MCP Apps | Requests come from `160.79.104.0/21`. Mobile limits unverified |
| ChatGPT (developer mode, apps) | Remote MCP, OAuth | Not documented | Yes, in the chat, MCP Apps, and MCP Events | MCP Events can wake a conversation from a webhook |
| Codex cloud | MCP inside cloud tasks is not documented | — | Follow-ups in the same chat | Codex CLI: `tool_timeout_sec` defaults to 60 |
| Cursor cloud agents | HTTP or stdio, set on cursor.com/agents | Not documented; a 300 s headers timeout is reported for remote calls | Follow-ups | Send response headers at once; per-MCP network policy |
| GitHub Copilot cloud agent | Repo settings, tools only | Not documented | PR comments, steering | No remote OAuth servers. Actions-based sessions stop at 59 minutes. The firewall reportedly does not apply to MCP servers |
| Devin | stdio, SSE, or HTTP; OAuth | Not documented | Chat | The server must be on the public internet |
| Google Jules | Six curated partner servers only | — | — | Read-only since 2026-11-11, shutting down 2026-12-31 |

What this means for the cloud:

- The person can only reach a hosted plan. A local service inside a cloud VM is on that VM's loopback. That is true today too.
- The **remote connector is the cloud path that needs no setup per container**: no `account login --headless`, and no allowlist entry.
- **Windows must be short on remote hosts**: 240 s on claude.ai, 60 s in Codex, about 300 s in Cursor. A remote `plan_wait` should default to a window of 200 s or less, and always send keepalives.
- The spec moved. **MCP 2026-07-28 is stateless**: no `Mcp-Session-Id`, no resumable GET stream, and on Streamable HTTP a closed response stream means the request was cancelled. An hours-long call cannot survive a dropped connection. That suits this design: the queue is already durable in `plan_events`, so a window that drops loses nothing.

### The hosted app as an MCP server

- **Duration.** An HTTP-triggered Worker has no hard duration limit while the client stays connected. Waiting on I/O is not CPU time. A runtime update gives open connections up to 20 minutes, so long streams drop anyway, which is another reason for bounded windows.
- **Where the wait lives.** A Durable Object cannot hibernate while a response stream is in flight. A waiter held in the object costs about $0.0056 an hour. Hold the MCP response in the Worker, which has no duration charge on the Standard plan. Have the Worker listen to the plan object over the hibernatable agent WebSocket the CLI already uses, so the object is idle between events.
- **SDK.** The Cloudflare Agents SDK's `McpAgent` is deprecated. `createMcpHandler` is stateless and speaks 2026-07-28 and older stateless clients. Elicitation goes through MRTR.
- **Auth.** Better Auth 1.7 ships an MCP plugin (`@better-auth/mcp`) with protected-resource metadata and CIMD (`@better-auth/cimd`). The project is on `better-auth ^1.4.0`, so this needs an upgrade. On Workers, CIMD needs a fetch transport of its own. Claude uses CIMD only when the server advertises `client_id_metadata_document_supported: true` and the `none` auth method, and otherwise falls back to DCR. `@cloudflare/workers-oauth-provider` 1.2.4 is the alternative.

## Spike

A stdio server in the session scratchpad (not committed) imported the repo's own `followAgentEvents` and `ackPlanEvents`. It exposed `wait_for_events`, `reply`, and `set_mode`. An MCP SDK client (1.32.2) drove it over stdio against a local service started with `serve examples/rate-limit.plan.md` under its own `LIVE_PLAN_HOME`, and plain HTTP posts played the person.

| Check | Result |
|---|---|
| Nothing pending, 2 s window | `{"timedOut":true,"waitedMs":2000}` |
| Presence between calls | `agentConnected: true`, because the server holds the stream between calls |
| Person picks a choice while the call blocks | Returned 41 ms after the post, with the `interaction` row |
| Harness cancels the call, then the person comments | Cancel rejected the call. The next call returned the comment. Nothing lost, nothing acked early |
| `reply` through the tool | The page API shows the comment answered with one reply |
| SDK default timeout, 90 s wait, no progress | Rejected at 60 s: `MCP error -32001: Request timed out` |
| 5 s client timeout, `resetTimeoutOnProgress`, heartbeat every 2 s, 12 s wait | Completed at 12 s after 5 progress notes |
| CLI `events` after the tool acked | Nothing pending. The next approval went to the CLI. One queue, no double delivery |

## Design rules if this is built

1. **One stream per plan, owned by the server process.** Open it on the first wait. Keep it through a grace period after each return (about two minutes, to cover the model's reaction), then close it. A stream held all session would keep a plan Active and keep a Free account's one slot while the agent does unrelated work. That would change [ADR 0030](../architecture/decisions/0030-agent-presence.md) and [ADR 0031](../architecture/decisions/0031-agent-slots.md).
2. **Ack on return over stdio, by cursor over HTTP.**
   - Over stdio, a row returned is acked and a cancelled call leaves it pending. That is the spike's rule and the CLI's. A pipe does not lose a written result.
   - Over Streamable HTTP, a result can be written to a stream that has already closed, and under 2026-07-28 the close is the cancel. So the remote `plan_wait` returns a `cursor`. The next call passes it back, and the server acks through it. A row returned but never confirmed comes back on the next call.
   - In both cases the row is marked in progress (Addressing) when it is returned, so [ADR 0035](../architecture/decisions/0035-six-plan-commands.md)'s page state stays immediate.
3. **Drop rows another client acked.** When a CLI listener and the server both hold a stream, re-check before returning: re-read `hello.pending` on reconnect, or have the ack response say which ids were newly delivered.
4. **Pick the window from the client.** The client names itself (`clientInfo`, in `initialize` or in each request's `_meta` under 2026-07-28) and lists its capabilities. Use the largest safe window per client, and accept `timeoutSeconds` to override it. With no knowledge, stay under 55 s locally and under 200 s remotely.
5. **Always send a heartbeat.** Send `notifications/progress` every 15–30 s when the client sent a progress token, and an SSE `:` comment over HTTP. That resets Claude Code's idle timer and keeps proxies and readers with a 300 s read timeout from closing a quiet connection. Send the response headers at once.
6. **Offer a task form of `plan_wait`** to clients that declare the Tasks extension, so the call returns at once and the agent keeps working. Store the task in the plan's queue, not in memory, because the extension requires it to be durable.
7. **Pull page edits into the file before returning an `edit`**, as `events` does (`pullPageEdit`), and strip the source from the result.
8. **Keep results small and explicit.** Each event is `{event, id, seq, data}` as today, plus `next` on an empty window.
9. **Ship it in the CLI.** `live-plan mcp` is a mode of the same binary, so versions never drift. `live-plan skills install` can also write the harness's MCP config, since it already knows each harness's paths.

## Is it better overall?

| Criterion | `events` CLI | Stdio MCP tools | Remote MCP on the host |
|---|---|---|---|
| Wakes the model in any harness | Only where a background exit wakes it | Yes, by returning | Yes, by returning |
| Long waits without burning turns | Claude Code background | Claude Code (auto-background, tasks); elsewhere long polls | Windows of 240 s or less on claude.ai; tasks in Claude Code; webhook wake in ChatGPT |
| Agent keeps working while waiting | Claude Code background | Claude Code, task-capable clients | Same |
| Typed input and output | No | Yes | Yes |
| Shell sandbox with network off | Blocked | Works (server outside the sandbox) | Works |
| Permission prompts | One per command | One rule for the server | One rule |
| Setup | None (`bunx`) | MCP config per harness | Connector and sign-in once per account |
| Chat surfaces with no shell | No | No | Yes |
| Cloud containers | Login per container | Login per container | Account connector |
| Local plans | Yes | Yes | No |

Tools win on reach, structure, sandboxes, and permissions. The CLI wins on zero setup. Long waits are a draw except in Claude Code, where tools are at least as good. So tools become the better primary mechanism where MCP is configured. The CLI stays, because it is the zero-setup path and the stdio server is built from it.

## Recommendation

1. **`live-plan mcp` (stdio).** The waiting and reacting tools above, over the same queue. Long-poll `plan_wait` with a per-client window, a heartbeat, and the grace-period stream. `skills install` writes the MCP config. The skill teaches tools first and `events` second. This gives local plans and hosted plans from any MCP harness.
2. **Task form of `plan_wait`** for clients that declare MCP Tasks.
3. **Remote MCP at `https://plan.logspace.qzz.io/mcp`.** Stateless (`createMcpHandler`), OAuth on Better Auth 1.7's MCP plugin, the document tools (`plan_write`, `plan_edit_block`), cursor acks, windows of 200 s or less, and a heartbeat on every wait. This gives chat surfaces and cloud sessions without a login per container.
4. **Optional push.** Each is narrow, and none is needed for the first three:
   - A Claude Code channel plugin that sends a submission into an idle session. Stdio only, interactive only, on an older protocol revision, and behind `--channels`.
   - ChatGPT MCP Events from the hosted app, and the spec's Events extension when it has an implementation.
   - An MCP App view of the plan for chat hosts.

Record the choice as an ADR when step 1 starts. It changes how agents are notified and what presence means.

## Sources

SOURCES_PLACEHOLDER
