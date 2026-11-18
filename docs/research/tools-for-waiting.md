# Tools as the way an agent waits on a plan

- Status: Research. Nothing here is built. A decision would go in [docs/architecture/decisions](../architecture/decisions/README.md).
- Date: 2026-11-17
- Question: can tools (MCP tools, served by `live-plan` itself) replace or sit beside `events` as the way an agent waits for a person on the plan page and reacts? Which actions can be tools? Where do harnesses and models limit it? Is it better overall, locally and in the cloud?

## Short answer

Yes, it is feasible locally and in the cloud, with no change to the plan service. A spike (below) ran a stdio MCP server against the real local service. A blocking tool call returned a click on the page in about 40 ms. A cancelled call lost nothing. The CLI and the tool shared one delivery queue without double delivery.

It is better than `events` as the **primary** interface where MCP is set up. It is not a full replacement:

- A tool result is the one wake-up every tool-using model and harness handles the same way. Today's loop depends on the harness re-invoking the agent when a background process exits, and most harnesses other than Claude Code do not.
- Tools take typed input and return typed output. There is no shell quoting of `reply --text`, no stdout and stderr parsing, and one permission rule (`mcp__living-plan__*`) instead of a prompt per command.
- Shell sandboxes can block the CLI. Codex's default `workspace-write` sandbox turns network off for commands, so `bunx visual-living-plan events` cannot reach the service there. MCP servers are separate processes that Codex starts, and third-party write-ups say the sandbox does not contain them. That is unverified in OpenAI's docs.
- A remote MCP server on the hosted app reaches places with no shell at all: claude.ai, Claude Desktop chat, ChatGPT, mobile, and cloud sessions through an account connector.

What holds it back:

- **Tool-call timeouts differ by harness.** Clients built on the MCP TypeScript SDK time out a request at 60 seconds unless they change it; the spike measured that. Codex defaults to 60 seconds and claude.ai connectors allow 240 seconds. Claude Code allows about 27.8 hours and moves a call longer than 2 minutes to the background. A wait has to be a long poll with a bounded window, and the window has to suit the client.
- **The current MCP spec (2026-07-28) is stateless.** On HTTP a dropped stream cancels the call. Long waits only work because the queue is already durable on the server.
- **A blocking call blocks the turn** in most harnesses. The agent cannot work while it waits, except in Claude Code (auto-background, MCP Tasks) and where MCP Tasks are supported.
- **Long polls cost model turns.** Each window that ends with nothing costs one model round trip and a little context. That is fine for minutes and wasteful for hours. It is the same cost as the foreground `events` loop that every harness but Claude Code already runs.
- **Setup.** `bunx` needs nothing installed. A tool needs the harness's MCP config (stdio) or a connector with sign-in (remote).

So the recommendation is to ship tools as a second adapter on the same queue: `live-plan mcp`. Keep `events` as the fallback and as the zero-setup path. Add the asynchronous forms (MCP Tasks, Claude Code channels, MCP Events) where a harness supports them. The [recommendation](#recommendation) section has the order.

## How the agent waits today

The baseline the tools are measured against ([ADR 0012](../architecture/decisions/0012-submission-delivery.md), [ADR 0034](../architecture/decisions/0034-listeners-reconnect-across-modes.md), [ADR 0035](../architecture/decisions/0035-six-plan-commands.md)):

- Every submission is a `plan_events` row. `delivered_at` is set when a client acks it (`POST /api/agent-events/ack`).
- `events <file>` holds the agent stream (SSE locally, a WebSocket on the host), prints the pending rows, acks them, and exits. The agent starts it again. `events --follow` stays running for agents that read output line by line.
- `followAgentEvents` reconnects through drops, restarts, and token changes.
- Presence ([ADR 0030](../architecture/decisions/0030-agent-presence.md)) and hosted slots ([ADR 0031](../architecture/decisions/0031-agent-slots.md)) count open agent streams.

This works best where the harness runs a command in the background and wakes the model when it exits. Only Claude Code does that reliably (`run_in_background`); see the harness table. Even there, unattended and cloud sessions stop a background command at 30 minutes by default and 2 hours at most. A cloud VM also pauses after a few idle minutes, and background shells do not keep the session running. Elsewhere the agent runs `events` in the foreground, under the shell tool's own timeout, which is already a long poll, only untyped.

## Mechanisms a tool layer can use

| Mechanism | How the agent hears the person | Where it works | Limits |
|---|---|---|---|
| Blocking call | `plan_wait` returns when a submission arrives | Every MCP client | The client's tool timeout. Blocks the turn |
| Long poll | `plan_wait` returns `timedOut` after a window, and the agent calls it again | Every MCP client | One model turn and a little context per empty window |
| Progress heartbeat | `notifications/progress` during the wait | Claude Code's idle timer. No surveyed client passes the SDK's `resetTimeoutOnProgress` | Lengthens no hard limit anywhere. Still worth sending: it keeps quiet connections open |
| Auto-background | The harness moves a long call off the turn and wakes the model when it returns | Claude Code (after 2 minutes) | Claude Code only. Off in non-interactive `-p` runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set |
| MCP Tasks (`io.modelcontextprotocol/tasks` extension, SEP-2663) | `tools/call` returns `resultType: "task"`; the host polls `tasks/get` until the task ends, and the agent keeps working | Claude Code (public beta since 2.1.304: "if Claude is idle when the result arrives, Claude starts on it unprompted"), MCPJam, Glean; Claude web per the client matrix, unverified | The 2025-11-25 experimental tasks are not wire-compatible with the extension. No progress notifications on a task. The server must store the task durably |
| Push into the session | The server sends `notifications/claude/channel` and the idle session wakes with the event | Claude Code channels | Research preview. Stdio only, interactive only. Gated, see Claude Code below |
| MCP Events | The server offers an event stream or webhook, and the host wakes the conversation when an event arrives | ChatGPT MCP Events (webhooks); OpenCode 2.3 (event-stream watch, flag `mcp_events`); the spec's Events extension (SEP-3415, accepted 2026-11-11, not merged) | Webhooks need durable subscriptions and outbound HTTPS, which only the hosted app can do. Early: two hosts, both new |
| Elicitation | The server asks the person in the harness's own UI, beside the page | Clients with elicitation (see table) | It is a question to the person, not a wake-up. Flat form schemas only |
| MCP Apps (`io.modelcontextprotocol/ui`, stable 2026-01-26) | The plan renders inside the chat. A click calls a tool (`tools/call`) or puts a message in the conversation (`ui/message`) | Claude web and Desktop, ChatGPT, VS Code Copilot, M365 Copilot, Goose, Cursor, Postman, others | Claude Code hides UI resources. In Claude, `sendMessage` needs the person's consent, is capped at 8,000 characters, and must not run on a timer; app-only tools have a 45 s limit and need a remote connector. The plan page has to run in a sandboxed iframe |
| Resource subscription | Change notifications on `plan://<id>` (`resources/subscribe`, replaced by `subscriptions/listen` in 2026-07-28) | No host found that passes them to the model. Claude's hosted apps do not support them | Good for reading state, not for waking |

Not tools, but they fill the same gap:

- Claude Code:
  - an `asyncRewake` hook runs in the background and wakes the model, even an idle one, when it exits `2`;
  - Bash commands and hooks get `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN`, through which a running process can post into its own session, more than once. They are exported in this cloud session. Their wire format is undocumented.
- Stop hooks that keep the turn going (`decision: block` in Claude Code and VS Code, `followup_message` in Cursor, AfterAgent `deny` in Gemini CLI). These only act at the end of a turn.

A future `events --notify` could use the inbox socket to post each submission while it keeps running. That would be push for the CLI, in Claude Code only.

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

Checked against official docs and main-branch source on 2026-11-17 and 18. "Unverified" means the docs and source did not settle it.

| Harness | Tool-call timeout | A long call | Push or wake | Today's loop (background `events`, wake on exit) |
|---|---|---|---|---|
| Claude Code 2.1.3xx | About 28 h hard. Idle 30 min stdio, 5 min HTTP, reset by progress. Per-server `timeout` | Moves to the background at 2 min. MCP Tasks (beta since 2.1.304; CLI and Agent SDK only; needs revision 2026-07-28) | Channels (gated), `asyncRewake` hooks, the session inbox socket | Works. Unattended and cloud sessions cap background commands at 30 min by default, 2 h at most |
| Cursor 3.x | About 60 min in the IDE, 60 s in the CLI, 300 s for remote HTTP (forum staff, not documented). No setting | Blocks. Cancel does not abort the HTTP request | Stop hook `followup_message` (loop limit 5 by default) | Shells persist across turns. "Task has finished" turns are reported since 3.18.9, unverified as stable |
| Codex CLI | Docs say 60 s; `main` source says 300 s. `tool_timeout_sec` | Blocks. Released ≤ 0.163 sends no `notifications/cancelled` | `codex queue --thread`, Stop-hook continuation | **No wake on exit** (openai/codex#32188, open). Default sandbox turns network off for commands |
| Gemini CLI | 600 s. Per-server `timeout` | Blocks. Esc sends no cancel | AfterAgent `deny` forces a retry | Only with `backgroundCompletionBehavior` and `experimental.modelSteering` |
| VS Code Copilot | About 180 s in the Copilot harness (default since 1.142). `timeout` honored only in `~/.copilot/mcp-config.json` | Blocks | Stop hook `decision: block`. Elicitation only during an active turn. An MCP App's message fills the input, no auto-send | Unverified |
| Cline | 60 s. `timeout` 1–3600 s | Blocks. Sends no progress token | — | Unverified |
| OpenCode 2.3 | 12 h. `mcp.timeout.execution` | Unverified | **MCP Events watch wakes the session** (flag `mcp_events`). HTTP `prompt_async` | Unverified |
| Goose | 300 s per extension | Blocks | MCP Apps | Unverified |
| Zed | 60 s, capped at 600 s | Blocks. Cancels on stop, not on timeout | None | No background terminal |
| JetBrains Junie | 60 s, settable 1 s–1 h | Unverified | Unverified | Unverified |
| Windsurf (Devin Desktop) | Unverified | Unverified | A Stop hook exists; continuation not documented | Unverified |

Across them:

- **No client passes the SDK's `resetTimeoutOnProgress`.** Claude Code's idle timer is the only timer that progress resets. A heartbeat keeps a call alive there and keeps connections from going quiet. It does not lengthen anyone's hard limit.
- **A 55 s window works everywhere.** Larger windows are safe per client: Gemini CLI about 9 min, Goose 4.5 min, VS Code about 170 s, and long ones in Claude Code (with a heartbeat) and OpenCode.
- **Today's loop wakes the agent reliably only in Claude Code.** In every other harness, the agent already runs `events` in the foreground and starts it again: a long poll through the shell. A tool runs the same loop at the same cost, typed, outside the sandbox, and with one permission rule.
- **Elicitation:** form and URL in Claude Code, Codex, and OpenCode; form in Cursor and Goose; none in Gemini CLI, Cline, and Zed. VS Code allows it only during an active turn.
- **Tasks:** only Claude Code among local harnesses.
- **One conflict in Claude Code.** Tasks need revision 2026-07-28, and a channel server must negotiate an older one. They would be two server entries, not one.

### Claude Code, read from the 2.1.327 binary

Read from the binary in this cloud container, not from the docs:

- **Hard timeout.** `MCP_TOOL_TIMEOUT`, or a per-server `"timeout"` in milliseconds, defaults to `1e8` ms (about 27.8 hours) and is capped at 2³¹−1 ms. The binary's own help text says "progress notifications do not extend it".
- **Idle timeout.** A call is aborted after "no response or progress notification" for 30 minutes on a stdio server, or 5 minutes on a remote one. `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` changes it (`0` turns it off), and so does a per-server `timeout`. **A remote `plan_wait` must send progress at least every few minutes**, or Claude Code drops it at 5 minutes.
- **Auto-background.** A tool call that runs past 120 seconds moves to the background (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, flag `tengu_mcp_auto_background`, on by default). It comes back as a task notification ("The tool call …, which ran in the background"). In an interactive session a blocking `plan_wait` therefore behaves like `events` with `run_in_background` today. It is off in non-interactive runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set.
- **MCP Tasks.** Claude Code polls a server's task and waits for `mcp_tasks_changed`. In cloud sessions a polling service follows the task ("the polling service polls it; this client polls once, then waits for mcp_tasks_changed or a person's message"). The docs add three points: tasks are a public beta in the CLI and Agent SDK, not in the VS Code extension or the desktop app; they need revision 2026-07-28; and an idle Claude starts on a finished task unprompted.
- **Channels.** A server that declares the `claude/channel` capability can send `notifications/claude/channel`, and the message reaches the session. The gates are all in the binary:
  - first-party Anthropic models only, not Bedrock, Vertex, or Foundry;
  - org policy `channelsEnabled: true`, with `allowedChannelPlugins` replacing Anthropic's default allowlist;
  - the server must be a marketplace plugin named in `--channels`, or loaded with `--dangerously-load-development-channels`;
  - a connection that negotiated the newer stateless protocol revision has "no unsolicited notification path". The docs say to use `MCP_PROTOCOL_NEGOTIATION=legacy` or SDK 1.x;
  - the docs add: stdio only, interactive sessions only (`--dangerously-load-development-channels` is ignored in `-p` and the Agent SDK), and nothing documents channels in cloud sessions.
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

[`spike/server.ts`](spike/server.ts) is a stdio server that imports the repo's own `followAgentEvents` and `ackPlanEvents` and exposes `wait_for_events`, `reply`, and `set_mode`. [`spike/client.ts`](spike/client.ts) drives it with the MCP SDK client (1.32.2), as a harness would, and plays the person with plain HTTP posts. It is not product code, and the typecheck and tests do not include it.

To run it, serve a copy of the fixture under a throwaway home on a free port, which leaves a running service alone. Then pass the printed URL to the client:

```bash
export LIVE_PLAN_HOME=$(mktemp -d)
cp examples/rate-limit.plan.md "$LIVE_PLAN_HOME/"
bun src/cli.ts serve "$LIVE_PLAN_HOME/rate-limit.plan.md" --no-open --port 0
cd docs/research/spike && bun install
bun client.ts <printed plan URL>
```

`serve` leaves that throwaway service running. Stop it by the pid in its lock file:

```bash
kill "$(bun -e 'console.log((await Bun.file(process.env.LIVE_PLAN_HOME + "/registry.json").json()).pid)')"
```

It answers `fail-mode` and comments on `design`, so use a fresh copy of the plan for each run. Two runs on 2026-11-17 and 18 gave the same results:

| Check | Result |
|---|---|
| Nothing pending, 2 s window | `{"timedOut":true,"waitedMs":2000}` |
| Presence between calls | `agentConnected: true`, because the server holds the stream between calls |
| Person picks a choice while the call blocks | Returned 40–41 ms after the post, with the `interaction` row |
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
| Wakes the model in any harness | Only Claude Code wakes on a background exit | Yes, by returning | Yes, by returning |
| Long waits without burning turns | Claude Code background | Claude Code (auto-background, tasks); elsewhere long polls | Windows of 240 s or less on claude.ai; tasks in Claude Code; webhook wake in ChatGPT |
| Agent keeps working while waiting | Claude Code background | Claude Code, task-capable clients | Same |
| Typed input and output | No | Yes | Yes |
| Shell sandbox with network off | Blocked | Reported to work (server outside the sandbox) | Works |
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

First-hand, in this session:

- The Claude Code 2.1.327 binary at `/opt/claude-code/bin/claude`: timeout constants, idle timeout, auto-background, task polling, channel gates, hooks.
- `@modelcontextprotocol/sdk` 1.32.2: `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000`, latest protocol `2025-11-25`.
- The spike against this repo's local service, described above.

Spec and SDKs:

- [MCP versioning](https://modelcontextprotocol.io/specification/versioning), [2026-07-28 release post](https://blog.modelcontextprotocol.io/posts/2026-07-28/), [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Streamable HTTP, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [transports, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation), [subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions), [elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview), [SEP-2663](https://modelcontextprotocol.io/seps/2663-tasks-extension), [Events extension, SEP-3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415), [client matrix](https://modelcontextprotocol.io/extensions/client-matrix), [roadmap](https://modelcontextprotocol.io/development/roadmap)
- [MCP Apps spec, 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)

Harnesses:

- Claude Code: [MCP](https://code.claude.com/docs/en/mcp), [environment variables](https://code.claude.com/docs/en/env-vars), [channels](https://code.claude.com/docs/en/channels), [channels reference](https://code.claude.com/docs/en/channels-reference), [hooks](https://code.claude.com/docs/en/hooks), [tools reference](https://code.claude.com/docs/en/tools-reference), [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging), [on the web](https://code.claude.com/docs/en/claude-code-on-the-web), [cloud environments](https://code.claude.com/docs/en/cloud-environments)
- Claude connectors: [building](https://claude.com/docs/connectors/building), [authentication](https://claude.com/docs/connectors/building/authentication), [MCP Apps: sending messages](https://claude.com/docs/connectors/building/mcp-apps/send-messages), [MCP Apps: app tools](https://claude.com/docs/connectors/building/mcp-apps/app-tools)
- OpenAI:
  - Codex: [MCP in Codex](https://learn.chatgpt.com/docs/extend/mcp), [hooks](https://learn.chatgpt.com/docs/hooks), [agent approvals and security](https://developers.openai.com/codex/agent-approvals-security), [openai/codex#32188](https://github.com/openai/codex/issues/32188) (no wake on exit), [openai/codex#26956](https://github.com/openai/codex/issues/26956) (no cancel)
  - ChatGPT: [developer mode](https://developers.openai.com/api/docs/guides/developer-mode), [MCP Events](https://developers.openai.com/plugins/build/mcp-events), [MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt)
  - Third party, on MCP servers and the Codex sandbox: [Codex sandbox, explained](https://www.agent37.com/blog/codex-sandbox)
- Cursor: [MCP](https://cursor.com/docs/mcp.md), [hooks](https://cursor.com/docs/hooks.md), [remote MCP 300 s timeout](https://forum.cursor.com/t/166437), [timeouts thread](https://forum.cursor.com/t/163925), [cloud agent capabilities](https://cursor.com/docs/cloud-agent/capabilities)
- Gemini CLI: [hooks reference](https://geminicli.com/docs/hooks/reference/), and `packages/core/src/tools/mcp-client.ts` and `docs/reference/configuration.md` on `main`
- VS Code: [MCP developer guide](https://code.visualstudio.com/docs/copilot/guides/mcp-developer-guide), [microsoft/vscode#343135](https://github.com/microsoft/vscode/issues/343135) (Copilot harness timeout)
- GitHub Copilot cloud agent: [extending it with MCP](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp), [about it](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent), [hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- Others:
  - [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/), [OpenCode server](https://opencode.ai/docs/server/)
  - [Goose elicitation](https://goose-docs.ai/docs/guides/mcp-elicitation/)
  - [Junie MCP configuration](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html)
  - [Devin MCP](https://docs.devin.ai/work-with-devin/mcp), [Devin hooks](https://docs.devin.ai/cli/extensibility/hooks/overview)
  - [Jules changelog](https://jules.google/docs/changelog/)
  - Cline (`McpHub.ts`) and Zed (`crates/context_server`) source on `main`

Cloudflare and auth:

- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [error 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524), [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Agents SDK: [v0.20.0 changelog](https://developers.cloudflare.com/changelog/post/2026-07-27-agents-sdk-v0.20.0-mcp-sdk-v2/), [MCP v2 post](https://blog.cloudflare.com/mcp-v2)
- [Better Auth MCP plugin](https://www.better-auth.com/docs/plugins/mcp)
