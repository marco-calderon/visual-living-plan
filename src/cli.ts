#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { planNotReadyReason } from './planReady'
import { writeSync } from 'node:fs'
import { access, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClientAssets } from './assets'
import { parsePlan } from './parse'
import { formatSearchResponse, type DashboardSearchResponse, type SearchResponse } from './planSearch'
import { formatDashboardSearch } from './dashboardSearchView'
import { pullPageEdit } from './pageEditPull'
import {
  ackPlanEvents,
  AgentStreamRefused,
  pendingFromHello,
  planApiUrl,
  planIdFromPlanUrl,
  submissionEvent,
} from './agentEvents'
import { followAgentEvents, type StreamNotices, type StreamToken } from './agentStream'
import type { PlanSubmissionEvent } from './types'
import { startLivingPlanServer } from './server'
import { applyExecutionChange, type ExecutionAction, type ExecutionGraph, type ExecutionPatch, type ExecutionState } from './execution'
import { cwdThemeConfigPath, globalThemeConfigPath } from './configHome'
import {
  configPathBesidePlan,
  DEFAULT_ACCENT,
  loadThemeConfig,
  normalizeAccent,
  saveThemeConfig,
  themePayload,
} from './theme'
import { planToExpectedGraph, workflowRequirementError } from './workflow'
import {
  closeHostedPlan,
  defaultRegistryHome,
  ensureRegistry,
  listProcesses,
  localServiceUrl,
  readPackageVersion,
  readRegistryLock,
  registerHostedPlan,
  registryBindUrl,
  registryHealthy,
  reviveRegistry,
  rewriteToBindUrl,
  type RegistryLock,
} from './registryClient'
import { isPidAlive } from './pid'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT } from './registryConstants'
import { formatServiceLogLines, isLogDay, listLogs, recordLog, type LogLevel } from './serviceLog'
import { closeCloudPlan } from './cloudClient'
import {
  cloudFlagConflict,
  prepareCloudPlan,
  requireCloudAccount,
  runCloudWatch,
  signInToCloud,
  signInWithToken,
  spawnCloudWatch,
  stopCloudWatch,
  syncCloudUrl,
} from './cloudCommand'
import { cloudCredential, normalizeBase, planRecordForUrl, readCloudFile, writeCloudFile } from './cloudStore'
import { CLI_TOKEN_PATH } from './cliToken'
import { choosePlanOpen, rememberPageOpened } from './openedPages'
import { openInBrowser, openUrl } from './openUrl'
import { readIteration } from './reviewRound'
import { resolvePlanUrl } from './planTarget'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (process.env.LIVE_PLAN_DAEMON === '1' && process.platform !== 'win32') {
  process.on('SIGHUP', () => {
    // Started detached. The process stays up when the client's terminal closes.
  })
  process.on('SIGPIPE', () => {
    // The parent CLI closes its pipes when it exits after Iterate.
  })
}

function printHelp(): void {
  console.log(`live-plan — agent-authored plans humans can interact with

Usage (a plan command takes the plan file, or --url <plan-url>):
  live-plan check <file.plan.md>
  live-plan serve <file.plan.md> [--cloud] [--port N] [--host HOST] [--config file] [--no-open|--open] [--listen]
  live-plan events <file.plan.md> [--follow] [--token TOKEN]
  live-plan mode <watch|comment|review> <file.plan.md> [--iteration N]
  live-plan reply <comment-id> <file.plan.md> --text "..." [--outcome implemented|errored|issues] [--keep-open]
  live-plan close <file.plan.md>

  live-plan execution start|push|stop <file.plan.md> [--step TEXT] [--detail TEXT] [--graph file.json] [--scene file.json]
  live-plan search --query TERMS [--query TERMS] [--version live|all] [--any] [--fuzzy] [--json] [--cloud]
  live-plan search <file.plan.md> --query TERMS [--query TERMS] [--version live|N|all] [--any] [--fuzzy] [--json] [--token TOKEN]
  live-plan theme get|set [--accent #hex] [--url <plan-url>] [--config file] [--plan file.plan.md]
  live-plan dump <file.plan.md>
  live-plan processes
  live-plan logs [--level error|warn|log] [--url <plan-url>] [--day YYYY-MM-DD] [--limit N]
  live-plan dashboard [--no-open] [--json] [--any-version]
  live-plan tui [--period day|week|month] [--registry-port N] [--registry-host HOST]
  live-plan registry [--port N] [--host HOST]
  live-plan lan on|off|status
  live-plan account login --url https://host [--headless | --token <token>]
  live-plan --version

Shortcuts, kept for agents and scripts that use them:
  live-plan review <file.plan.md> [--cloud] [--iteration N] [--timeout 30m] [--out file]
  live-plan watch <file.plan.md>
  live-plan wait <id> <file.plan.md> [--timeout 30m]
  live-plan addressing <comment-id> <file.plan.md>
  live-plan address <comment-id> <file.plan.md> [--outcome implemented|errored|issues]

Requires Bun (https://bun.sh). Invoke with \`bunx visual-living-plan <command>\` when the \`live-plan\` command is not installed. \`living-plan\` is the same binary.

Plan commands:
  check       Print plan summary. Exits 1 when the required workflow block is missing.
  serve       Register the plan (on this machine, or the signed-in host with --cloud), print its URL, and return. The page stays up. --listen also waits for the next submissions, as events does.
  events      The one listener. Print undelivered submissions as JSON lines, ack them, then exit; start it again after it exits. --follow stays running instead, and also prints a mode line on every mode change, so one process serves the whole plan.
  mode        Switch the open session between watch, comment, and review. The open tab follows. --iteration N sets the review round. A verdict then arrives on events as a review line. Review is refused while the person's last verdict has not reached an agent.
  reply       Answer a comment and mark it answered. The page already shows the comment in progress once events printed it. --outcome errored or issues records the result. --keep-open leaves it open.
  close       Drop a plan from the service.
  execution   Optional. After an approval the run follows the plan file: a phase marked active starts it, every step done or one failed ends it. start, push, and stop are for a plan without a review, a custom graph, or ending a run by hand.

Shortcuts:
  review      serve, mode review, and wait for the verdict in one command. Exits 0 approve, 1 deny, 2 iterate, 3 timeout, 4 the stream was refused or never connected.
  watch       mode watch, then events --follow.
  wait        Block until one interaction id is answered. Exits 3 on timeout, 4 when the stream was refused or never connected.
  addressing  Mark one comment in progress by hand.
  address     Mark one comment answered without a reply.

Other commands:
  search      Find terms across every plan on this machine's service, or every plan on the hosted account with --cloud. A plan file or --url searches one plan instead. Live text only unless --version all (or --version N for one plan). Every term must be in one block unless --any. Across plans the plan title counts toward every block. --fuzzy also matches word starts and small typos. Exits 0 with hits, 2 with none.
  account     Sign in to the hosted service. \`account login --url https://host\`. On a machine with no browser, \`--headless\` prints a page that shows a token, then \`--token <token>\` saves it.
  theme       Read or write the accent color in live-plan.config.json (or via a running server).
  processes   List plans hosted by the service. \`ps\` is the same command.
  logs        Print the development log saved under ~/.config/living-plan/logs. Not shown on the page. --day reads one registry day (today when omitted). --url reads one plan.
  dashboard   Open the control dashboard (running and executed plans, by day, week, or month). --json prints {"url","service","version"} on one line and opens nothing. --any-version uses a running service of another version instead of restarting it; the desktop app passes both.
  tui         The registry in the terminal: running plans, and the day, week, and month dashboard. Starts the plan service when it is not already running. Quitting leaves that service up. Active plans are listed first. Click a control, or use Tab, arrows, p, d, and the number keys.
  registry    Run the plan service in the foreground. serve and review start it on their own.
  lan         Publish this machine's plan service on the local network. Off until \`lan on\`.

A plan file names the plan for every plan command: its hosted URL when this machine served it with --cloud, otherwise its URL on this machine's service. --url <plan-url> still works, and is needed for a plan served from another machine.
Every plan includes a \`workflow\` block. That block is the execution path the Workflow tab draws.
Per-plan accent color is saved in live-plan.config.json beside the plan (override with --config).
Without --plan or --config, theme get/set uses ~/.config/living-plan/live-plan.config.json.
Service state and diagnostic logs live under ~/.config/living-plan (LIVE_PLAN_HOME / LIVE_PLAN_LOG_HOME override).
--no-open skips launching a browser.
Pages open in the Living Plan Mac app when it is installed and the page is a plan or the dashboard on this machine's service (living-plan://plans/<id>). Otherwise they open in the installed Living Plan web app (Chrome, Edge, Brave, or Chromium) for that host, and in a browser tab when there is none. LIVE_PLAN_DESKTOP=0 skips the Mac app. LIVE_PLAN_OPEN=browser always uses a tab.
serve and review open a plan page only the first time on this machine. Resuming the same plan leaves the open tab alone. --open opens it again.
--version prints the package version and exits. -v is the short flag.
--detach is accepted and does nothing: serve returns by default.
events prints a submission that arrived while it was stopped immediately, then exits. Start it again after every comment, denial, or approval so a pending event is not left on the server.
serve --listen, events, watch, wait, and review reconnect by themselves after a dropped stream, a service restart, or a network change. Submissions sent meanwhile wait on the server and print after the reconnect. A local service that crashed is started again. They stop only on a refusal a retry cannot fix, their own --timeout, or when they never connected.
The machine service keeps running after serve, events, wait, review, dashboard, and tui exit.
--no-registry serves this plan in its own process instead of the machine service.
--port sets that private process port. With the service, --port is used only when the service is not already running.
--registry-port and --registry-host choose the service (default ${DEFAULT_REGISTRY_HOST}:${DEFAULT_REGISTRY_PORT}).
The printed URL uses that address. On loopback it is http://127.0.0.1:${DEFAULT_REGISTRY_PORT}/plans/<id>/. --host other than loopback is the address a cloud agent shares.
LAN publishing is off on a fresh install. \`lan on\` listens on all interfaces, advertises living-plan.local, and prints a LAN URL for other devices. \`serve\` and \`review\` still print the loopback plan URL. The CLI dials 127.0.0.1 and does not resolve *.local.
--token authorizes the agent event stream. Omitted, the local service token is used.
--cloud hosts the plan on the signed-in service. It does not start the local registry, and it does not fall back to loopback.
account login stores the session in ~/.config/living-plan/cloud.json. --token - reads the token from stdin, so it stays out of shell history. LIVE_PLAN_CLOUD_URL sets the host when --url is omitted.
`)
}

function parseTimeout(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/)
  if (!match) {
    throw new Error(`Invalid timeout: ${raw}`)
  }
  const amount = Number(match[1])
  const unit = match[2] ?? 'ms'
  const factor = unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : unit === 's' ? 1_000 : 1
  return Math.round(amount * factor)
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8').trim()
}

/** Every value given for a flag that may repeat, under any of its names. */
function getFlags(args: string[], ...names: string[]): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length - 1; index += 1) {
    if (names.includes(args[index] ?? '')) values.push(args[index + 1] ?? '')
  }
  return values
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

/** Open `url` in the Living Plan Mac app or the installed web app when there is one, else a browser tab. */
async function openBrowser(url: string): Promise<void> {
  if (hasFlag(process.argv.slice(2), '--no-open')) return
  await openUrl(url)
}

/**
 * Open a plan page only the first time. A resumed `serve` or `review` reuses
 * the tab the person already has. `--open` forces it, `--no-open` skips it.
 */
async function openPlanPage(url: string): Promise<void> {
  const argv = process.argv.slice(2)
  const choice = await choosePlanOpen(url, {
    noOpen: hasFlag(argv, '--no-open'),
    forceOpen: hasFlag(argv, '--open'),
  }).catch(() => 'open' as const)
  if (choice === 'skip') {
    if (!hasFlag(argv, '--no-open')) console.log('Page already opened before. Not opening it again (pass --open to reopen).')
    return
  }
  await openBrowser(url)
  await rememberPageOpened(url).catch(() => undefined)
}

async function ensureClientBuild(): Promise<void> {
  const assets = await loadClientAssets()
  if (assets?.mermaidHref && assets.highlightHref && assets.selectorHref && assets.planMdxHref) return
  console.log('Building execution client (vite)...')
  await new Promise<void>((resolveBuild, reject) => {
    const child = spawn(process.execPath, ['x', 'vite', 'build', '--config', 'vite.client.config.ts'], {
      cwd: packageRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('exit', (code) => {
      if (code === 0) resolveBuild()
      else reject(new Error(`vite build failed with code ${code}`))
    })
  })
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T
}

async function resolveAgentToken(args: string[], planUrl?: string): Promise<string | undefined> {
  const explicit = getFlag(args, '--token')
  if (explicit) return explicit
  if (planUrl) {
    const credential = cloudCredential(await readCloudFile(), planUrl)
    if (credential?.kind === 'plan') return credential.token
    if (credential?.kind === 'account') return undefined
  }
  const lock = await readRegistryLock(defaultRegistryHome())
  return lock?.token
}

/** Write one JSON line to stdout without waiting for a block buffer. Agents read this pipe live. */
function printJsonLine(value: unknown): void {
  writeSync(1, `${JSON.stringify(value)}\n`)
}

/**
 * Record that the CLI printed these submissions. A short outage is retried. A failed ack leaves them
 * pending on the server: a running listener acks them on its next connect, and the next start prints them.
 */
async function acknowledgeSubmissions(url: string, token: string | undefined, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  let last: unknown
  for (let attempt = 0; attempt < ACK_TRIES; attempt += 1) {
    if (attempt > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** (attempt - 1)))
    try {
      await ackPlanEvents(url, token, ids)
      return true
    } catch (error) {
      last = error
    }
  }
  console.error(`Could not mark ${ids.length === 1 ? 'a submission' : `${ids.length} submissions`} delivered: ${last instanceof Error ? last.message : last}. It stays pending on the server.`)
  return false
}

const ACK_TRIES = 3

/** True for a URL on this machine's plan service. Only that service can be started again by a client. */
function onLocalService(url: string): boolean {
  try {
    const parsed = new URL(url)
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    return loopback && planIdFromPlanUrl(url) !== null
  } catch {
    return false
  }
}

/**
 * What a listening command tells the agent while its stream is down, and how it recovers: a local
 * service that crashed is started again, and a 401 after a service restart re-reads the service token.
 * stdout stays JSON lines. These notes go to stderr.
 */
function streamNotices(url: string, args: string[]): StreamNotices {
  return {
    lost(reason, delayMs, wasConnected) {
      const wait = Math.max(1, Math.round(delayMs / 1000))
      console.error(
        wasConnected
          ? `Lost the plan stream (${reason}). Reconnecting in ${wait}s, and retrying until it is back. Submissions wait on the server meanwhile.`
          : `Could not reach the plan stream (${reason}). Trying again in ${wait}s.`,
      )
    },
    restored() {
      console.error('Reconnected to the plan stream.')
    },
    revive: onLocalService(url)
      ? async () => {
          if (cloudCredential(await readCloudFile(), url)) return
          if (await reviveRegistry({ entryFile: fileURLToPath(import.meta.url) })) {
            console.error('The plan service had stopped without shutting down. Started it again.')
          }
        }
      : undefined,
    retoken: () => resolveAgentToken(args, url),
  }
}

/** The session moved to another mode. Printed by a listener that stays running; it has no id and needs no ack. */
function modeLine(data: unknown): { mode: PlanModeName; iteration?: number } | null {
  if (!data || typeof data !== 'object') return null
  const { mode, iteration } = data as { mode?: unknown; iteration?: unknown }
  if (mode !== 'watch' && mode !== 'comment' && mode !== 'review') return null
  return typeof iteration === 'number' && Number.isFinite(iteration) ? { mode, iteration } : { mode }
}

type PlanModeName = 'watch' | 'comment' | 'review'

/**
 * Print submissions the server has not marked delivered.
 * With `once`, a waiting batch is printed immediately and the process exits; otherwise this waits for the next one and then exits.
 * Without `once`, each batch is printed and the process stays up until it is stopped. It also prints a
 * `mode` line each time the session moves to another mode, so one process can follow watch, comment, and review.
 *
 * Either way the stream is reconnected after a drop, a service restart, or a network change. The hello
 * on each connect carries what was submitted meanwhile, so nothing is skipped.
 */
async function listenForSubmissions(url: string, token: string | undefined, once = true, args: string[] = []): Promise<number> {
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const bearer: StreamToken = { current: token }
  const printed = new Set<string>()
  const acked = new Set<string>()
  let ackFailed = false
  let connected = false
  let seen: { mode: PlanModeName; iteration?: number } | null = null
  let ackChain = Promise.resolve()
  const later = (work: () => void | Promise<void>) => {
    ackChain = ackChain.then(work)
  }

  const take = (incoming: PlanSubmissionEvent[]) => {
    const waiting = incoming
      .filter((submission) => submission.deliveredAt == null)
      .sort((left, right) => left.seq - right.seq)
    const fresh = waiting.filter((submission) => !printed.has(submission.id))
    // Printed before, but the ack never landed. Ack it again without printing it twice.
    const unacked = waiting.filter((submission) => printed.has(submission.id) && !acked.has(submission.id))
    if (fresh.length === 0 && unacked.length === 0) return
    for (const submission of fresh) printed.add(submission.id)
    const ids = [...unacked, ...fresh].map((submission) => submission.id)
    later(async () => {
      for (const submission of fresh) {
        // A page edit on a hosted plan lands in the plan file before the agent reads the line.
        if (submission.event === 'edit') {
          const written = await pullPageEdit(url, submission.data).catch((error: unknown) => {
            console.error(`Could not write the page edit into the plan file: ${error instanceof Error ? error.message : error}`)
            return null
          })
          if (written) console.error(`Wrote the page edit into ${written}`)
        }
        printJsonLine({ event: submission.event, id: submission.id, seq: submission.seq, data: printableData(submission) })
      }
      if (await acknowledgeSubmissions(url, bearer.current, ids)) for (const id of ids) acked.add(id)
      else ackFailed = true
    })
    if (once && fresh.length > 0) controller.abort()
  }

  // The first hello sets the mode. A later change, or one missed while reconnecting, prints a line.
  const followMode = (data: unknown) => {
    const line = modeLine(data)
    if (!line) return
    const iteration = line.iteration ?? seen?.iteration
    const next = iteration === undefined ? { mode: line.mode } : { mode: line.mode, iteration }
    const changed = !seen || seen.mode !== next.mode || seen.iteration !== next.iteration
    const first = seen === null
    seen = next
    if (changed && !first && !once) later(() => printJsonLine({ event: 'mode', data: next }))
  }

  let code = 0
  try {
    await followAgentEvents(
      url,
      bearer,
      (event) => {
        if (event.event === 'hello') {
          connected = true
          take(pendingFromHello(event.data))
          followMode(event.data)
          return
        }
        if (event.event === 'mode') {
          followMode(event.data)
          return
        }
        if (event.event !== 'notice') return
        const submission = submissionEvent(event.data)
        if (submission) take([submission])
      },
      controller.signal,
      streamNotices(url, args),
    )
  } catch (error) {
    if (!once && connected && error instanceof AgentStreamRefused && error.status === 404) {
      console.error('The plan is no longer on the service. It was closed. Stopping.')
    } else {
      console.error(error instanceof Error ? error.message : error)
      code = 1
    }
  }
  process.off('SIGINT', stop)
  process.off('SIGTERM', stop)
  await ackChain
  if (code) return code
  if (once && ackFailed) return 1
  return 0
}

/** The source in a hosted `edit` is already in the plan file. The printed line stays short. */
function printableData(submission: PlanSubmissionEvent): unknown {
  if (submission.event !== 'edit' || !submission.data || typeof submission.data !== 'object') return submission.data
  const { source: _source, ...rest } = submission.data as Record<string, unknown>
  return rest
}

/** Print the next undelivered submissions for one hosted plan, then exit. The page stays up. */
async function followPlan(url: string, token: string, args: string[]): Promise<number> {
  console.log('Listening for submissions. This command prints them and exits. The page stays up.')
  return listenForSubmissions(url, token, true, args)
}

async function cloudRequestHeaders(url: string, args: string[]): Promise<Record<string, string>> {
  const credential = cloudCredential(await readCloudFile(), url)
  if (!credential) return {}
  const token = await resolveAgentToken(args, url)
  if (!token) throw new Error('No plan token for that hosted URL. Pass --token, or serve the plan from this machine.')
  return { authorization: `Bearer ${token}` }
}

async function executionRequest(
  url: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  const planId = planIdFromPlanUrl(url) ?? undefined
  try {
    const headers = {
      'content-type': 'application/json',
      ...(await cloudRequestHeaders(url, process.argv.slice(2))),
    }
    return await fetch(planApiUrl(url, path), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution request failed'
    await recordLog({
      level: 'error',
      message: `Execution request failed: ${message}`,
      source: 'execution',
      planId,
      echo: false,
    }).catch(() => undefined)
    throw error
  }
}

async function executionFailure(url: string, response: Response): Promise<Error> {
  const text = await response.text()
  await recordLog({
    level: 'error',
    message: `Execution request failed: ${text || response.status}`,
    source: 'execution',
    planId: planIdFromPlanUrl(url) ?? undefined,
    echo: false,
  }).catch(() => undefined)
  return new Error(text || `Execution request failed (${response.status})`)
}

async function readExecution(url: string): Promise<ExecutionState> {
  const response = await executionRequest(url, '/api/execution', { method: 'GET' })
  if (!response.ok) throw await executionFailure(url, response)
  return (await response.json()) as ExecutionState
}

async function putExecution(url: string, body: ExecutionState): Promise<ExecutionState> {
  const response = await executionRequest(url, '/api/execution', { method: 'PUT', body })
  if (!response.ok) throw await executionFailure(url, response)
  const payload = (await response.json()) as { execution: ExecutionState }
  return payload.execution
}

/**
 * Start, push, or stop the run. The host merges the fields it is sent into the run it has,
 * so the agent never has to read the run first. A host without that route gets the older
 * read and replace.
 */
async function changeExecution(url: string, action: ExecutionAction, patch: ExecutionPatch): Promise<ExecutionState> {
  const response = await executionRequest(url, `/api/execution/${action}`, { method: 'POST', body: patch })
  if (response.ok) {
    const payload = (await response.json()) as { execution: ExecutionState }
    return payload.execution
  }
  if (response.status !== 404 && response.status !== 405) throw await executionFailure(url, response)
  await response.body?.cancel().catch(() => undefined)
  const current = action === 'start' ? null : await readExecution(url)
  return putExecution(url, applyExecutionChange(current, action, patch))
}

async function cmdCheck(file: string): Promise<number> {
  const source = await readFile(resolve(file), 'utf8')
  const plan = parsePlan(source, file)
  // The same check the watchers run before a change reaches the page: it must compile as MDX.
  const workflowError = workflowRequirementError(plan) ?? (await planNotReadyReason(source))
  const workflow = workflowError ? undefined : planToExpectedGraph(plan)
  console.log(
    JSON.stringify(
      {
        title: plan.title,
        summary: plan.summary,
        agent: plan.agent,
        blocks: plan.blocks.map((block) => block.type),
        interactionIds: plan.interactionIds,
        workflow: workflow
          ? {
              title: workflow.title,
              nodes: workflow.nodes.map((node) => ({
                id: node.id,
                planRef: node.planRef,
                status: node.status,
              })),
            }
          : null,
        ...(workflowError ? { error: workflowError } : {}),
      },
      null,
      2,
    ),
  )
  if (workflowError) {
    await recordLog({
      level: 'error',
      message: workflowError,
      source: 'parse',
      echo: false,
    }).catch(() => undefined)
    console.error(workflowError)
    return 1
  }
  return 0
}

async function cmdDump(file: string): Promise<number> {
  const source = await readFile(resolve(file), 'utf8')
  const plan = parsePlan(source, file)
  console.log(JSON.stringify(plan, null, 2))
  return 0
}

async function openRegistry(args: string[], options?: { anyVersion?: boolean }): Promise<RegistryLock | null> {
  if (hasFlag(args, '--no-registry')) return null
  const portFlag = getFlag(args, '--registry-port') ?? getFlag(args, '--port')
  const port = portFlag ? Number(portFlag) : undefined
  const host = getFlag(args, '--registry-host') ?? getFlag(args, '--host')
  try {
    return await ensureRegistry({
      entryFile: fileURLToPath(import.meta.url),
      port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
      host,
      anyVersion: options?.anyVersion,
    })
  } catch (error) {
    console.error(`Registry unavailable: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function cmdCloudServe(file: string, args: string[], mode: 'watch' | 'review'): Promise<number> {
  const conflict = cloudFlagConflict(true, hasFlag(args, '--no-registry'))
  if (conflict) {
    console.error(conflict)
    return 1
  }
  try {
    const round = mode === 'review' ? readIterationFlag(args) : undefined
    const record = await prepareCloudPlan({
      planPath: resolve(file),
      mode,
      iteration: round === 'invalid' ? undefined : round,
    })
    console.log(`Living Plan (${mode}): ${record.url}`)
    console.log(`Plan file: ${resolve(file)}`)
    console.log('Hosted plan. The local registry was not started.')
    await openPlanPage(record.url)
    // `serve` registers and returns. `--listen` also waits for the next submissions, as `events` does.
    if (mode === 'watch' && !hasFlag(args, '--listen')) {
      const pid = spawnCloudWatch(fileURLToPath(import.meta.url), record)
      const stored = await readCloudFile()
      const current = stored.plans[record.id]
      if (current) {
        stored.plans[record.id] = { ...current, watchPid: pid }
        await writeCloudFile(stored)
      }
      printListenHint(file)
      return 0
    }
    const stop = await syncCloudUrl(record.url)
    try {
      if (mode === 'review') {
        const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
        let held: Awaited<ReturnType<typeof readReviewEvent>>
        try {
          held = await readReviewEvent(record.url, record.token, timeoutMs, args)
        } catch (error) {
          return reviewFailure(error)
        }
        await writeReviewOutput(args, held.review)
        await acknowledgeSubmissions(record.url, held.token, held.eventIds)
        return reviewExitCode(held.review.decision)
      }
      return await followPlan(record.url, record.token, args)
    } finally {
      stop()
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

/** What to run next. The plan file names the plan for every later command. */
function printListenHint(file: string): void {
  const quoted = /\s/.test(file) ? JSON.stringify(file) : file
  console.log(`Listen: live-plan events ${quoted}   (--follow keeps it running)`)
}

async function cmdServe(file: string, args: string[]): Promise<number> {
  if (hasFlag(args, '--cloud')) return cmdCloudServe(file, args, 'watch')
  await ensureClientBuild()
  const planPath = resolve(file)
  const configPath = getFlag(args, '--config')
  const registry = await openRegistry(args)
  if (registry) {
    const hosted = await registerHostedPlan(registryBindUrl(registry), registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
      configPath,
    })
    console.log(`Living Plan (watch): ${hosted.url}`)
    console.log(`Plan file: ${planPath}`)
    console.log(`Service: ${registry.url}`)
    console.log('Tabs: Plan (status/forms), Workflow (expected plan, then live React Flow canvas), and Settings (accent, page width).')
    await openPlanPage(hosted.url)
    // `serve` registers and returns. `--listen` also waits for the next submissions, as `events` does.
    if (!hasFlag(args, '--listen')) {
      printListenHint(file)
      return 0
    }
    return followPlan(rewriteToBindUrl(registry, hosted.url), hosted.token, args)
  }

  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const server = await startLivingPlanServer({
    planPath,
    mode: 'watch',
    port: Number.isFinite(port) ? port : 0,
    host,
    configPath,
  })
  console.log(`Living Plan (watch): ${server.url}`)
  console.log(`Plan file: ${planPath}`)
  console.log(`Theme config: ${server.getState().theme.configPath}`)
  console.log('Tabs: Plan (status/forms), Workflow (expected plan, then live React Flow canvas), and Settings (accent, page width).')
  await openPlanPage(server.url)
  console.log('Listening for the next submission. This command exits when one arrives.')
  const code = await listenForSubmissions(server.url, undefined, true, args)
  await server.close()
  return code
}

type ReviewPayload = {
  decision: 'approve' | 'deny' | 'iterate'
  note?: string
  iteration?: number
}

function reviewExitCode(decision: ReviewPayload['decision']): number {
  if (decision === 'approve') return 0
  if (decision === 'deny') return 1
  return 2
}

async function writeReviewOutput(args: string[], review: ReviewPayload): Promise<void> {
  const payload = JSON.stringify(review, null, 2)
  const outPath = getFlag(args, '--out')
  if (outPath) {
    const absolute = resolve(outPath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, `${payload}\n`, 'utf8')
  }
  console.log(payload)
}

/** The command's own `--timeout` ran out. Every other failure of a waiting command is the stream being refused or unreachable. */
class WaitTimedOut extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WaitTimedOut'
  }
}

/** `review` exits 3 when its timeout runs out and 4 when the plan stream could not be reached or was refused. */
function reviewFailure(error: unknown): number {
  console.error(error instanceof Error ? error.message : error)
  return error instanceof WaitTimedOut ? 3 : 4
}

/**
 * Wait for the review verdict. The stream is reconnected until `timeoutMs` runs out, so a service
 * restart or a dropped connection does not end the review. A verdict sent while it was down arrives
 * in the next hello.
 */
async function readReviewEvent(
  url: string,
  token: string | undefined,
  timeoutMs: number,
  args: string[] = [],
): Promise<{ review: ReviewPayload; eventIds: string[]; token: string | undefined }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const bearer: StreamToken = { current: token }
  let review: ReviewPayload | undefined
  let eventIds: string[] = []
  try {
    await followAgentEvents(
      url,
      bearer,
      ({ event, data }) => {
        if (review) return
        if (event === 'hello') {
          const hello = data as { review?: ReviewPayload | null }
          if (hello.review?.decision) {
            review = hello.review
            eventIds = pendingFromHello(data)
              .filter((submission) => submission.event === 'review')
              .map((submission) => submission.id)
            controller.abort()
          }
        }
        if (event === 'notice') {
          const submission = submissionEvent(data)
          if (submission?.event === 'review') {
            review = submission.data as ReviewPayload
            eventIds = [submission.id]
            controller.abort()
          }
        }
      },
      controller.signal,
      streamNotices(url, args),
    )
  } finally {
    clearTimeout(timer)
  }
  if (!review) throw new WaitTimedOut('Timed out waiting for review decision')
  return { review, eventIds, token: bearer.current }
}

async function readHeldUrl(child: ReturnType<typeof spawn>): Promise<string> {
  const stdout = child.stdout
  if (!stdout) throw new Error('Review server did not report its URL')
  return await new Promise<string>((resolveUrl, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for the review server'))
    }, 15_000)
    const onData = (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const match = buffer.match(/LIVING_PLAN_URL (\S+)/)
      const url = match?.[1]
      if (!url) return
      cleanup()
      resolveUrl(url)
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`Review server exited before it was ready (${code ?? 'unknown'})`))
    }
    const cleanup = () => {
      clearTimeout(timer)
      stdout.off('data', onData)
      child.off('exit', onExit)
    }
    stdout.on('data', onData)
    child.on('exit', onExit)
    child.on('error', (error) => {
      cleanup()
      reject(error)
    })
  })
}

async function holdPrivateReview(file: string, args: string[]): Promise<number> {
  const iteration = Number(getFlag(args, '--iteration') ?? 1)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const planPath = resolve(file)
  const configPath = getFlag(args, '--config')
  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const server = await startLivingPlanServer({
    planPath,
    mode: 'review',
    port: Number.isFinite(port) ? port : 0,
    host,
    iteration: Number.isFinite(iteration) ? iteration : 1,
    configPath,
  })
  writeSync(1, `LIVING_PLAN_URL ${server.url}\n`)
  try {
    const review = await server.waitForReview(timeoutMs)
    if (review.decision === 'iterate') {
      await new Promise<void>(() => {})
    }
    return reviewExitCode(review.decision)
  } finally {
    await server.close()
  }
}

async function privateReview(file: string, args: string[]): Promise<number> {
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const planPath = resolve(file)
  const entry = fileURLToPath(import.meta.url)
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, LIVE_PLAN_REVIEW_HOLD: '1', LIVE_PLAN_DAEMON: '1' },
  })
  try {
    const url = await readHeldUrl(child)
    child.unref()
    const stdout = child.stdout
    if (stdout && 'unref' in stdout) (stdout as { unref: () => void }).unref()
    console.log(`Living Plan (review): ${url}`)
    console.log(`Plan file: ${planPath}`)
    await openPlanPage(url)
    const held = await readReviewEvent(url, undefined, timeoutMs, args)
    await writeReviewOutput(args, held.review)
    await acknowledgeSubmissions(url, held.token, held.eventIds)
    return reviewExitCode(held.review.decision)
  } catch (error) {
    if (child.exitCode == null && !child.killed) child.kill()
    return reviewFailure(error)
  }
}

async function cmdReview(file: string, args: string[]): Promise<number> {
  if (process.env.LIVE_PLAN_REVIEW_HOLD === '1') return holdPrivateReview(file, args)
  if (hasFlag(args, '--cloud')) return cmdCloudServe(file, args, 'review')
  await ensureClientBuild()
  const iteration = Number(getFlag(args, '--iteration') ?? 1)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const planPath = resolve(file)
  const configPath = getFlag(args, '--config')
  const registry = await openRegistry(args)
  if (registry) {
    const hosted = await registerHostedPlan(registryBindUrl(registry), registry.token, {
      planPath,
      mode: 'review',
      iteration: Number.isFinite(iteration) ? iteration : 1,
      cwd: process.cwd(),
      configPath,
    })
    console.log(`Living Plan (review): ${hosted.url}`)
    console.log(`Plan file: ${planPath}`)
    console.log(`Service: ${registry.url}`)
    await openPlanPage(hosted.url)
    try {
      const apiUrl = rewriteToBindUrl(registry, hosted.url)
      const held = await readReviewEvent(apiUrl, hosted.token, timeoutMs, args)
      await writeReviewOutput(args, held.review)
      await acknowledgeSubmissions(apiUrl, held.token, held.eventIds)
      return reviewExitCode(held.review.decision)
    } catch (error) {
      return reviewFailure(error)
    }
  }

  return privateReview(file, args)
}

async function cmdWait(id: string, args: string[]): Promise<number> {
  const published = await planUrlArg(args, 'Usage: live-plan wait <id> <plan-file|--url plan-url> [--timeout 30m]')
  if (!published) return 1
  const url = await localServiceUrl(published)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const bearer: StreamToken = { current: await resolveAgentToken(args, url) }
  const stop = await syncCloudUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let printed = false
  let eventIds: string[] = []
  try {
    // Reconnects until the timeout, so a service restart while the person answers does not end the wait.
    await followAgentEvents(
      url,
      bearer,
      ({ event, data }) => {
        if (printed) return
        if (event === 'hello') {
          const responses = (data as { responses?: Record<string, unknown> }).responses
          const found = responses?.[id]
          if (found) {
            console.log(JSON.stringify(found, null, 2))
            printed = true
            eventIds = pendingFromHello(data)
              .filter((submission) => submission.event === 'interaction' && (submission.data as { id?: string }).id === id)
              .map((submission) => submission.id)
            controller.abort()
          }
        }
        if (event === 'notice') {
          const submission = submissionEvent(data)
          const response = submission?.data as { id?: string } | undefined
          if (submission?.event === 'interaction' && response?.id === id) {
            console.log(JSON.stringify(submission.data, null, 2))
            printed = true
            eventIds = [submission.id]
            controller.abort()
          }
        }
      },
      controller.signal,
      streamNotices(url, args),
    )
  } catch (error) {
    if (!printed) {
      console.error(error instanceof Error ? error.message : error)
      return 4
    }
  } finally {
    clearTimeout(timer)
    stop()
  }
  if (!printed) {
    console.error(`Timed out waiting for interaction: ${id}`)
    return 3
  }
  await acknowledgeSubmissions(url, bearer.current, eventIds)
  return 0
}

async function cmdEvents(args: string[]): Promise<number> {
  const published = await planUrlArg(args, 'Usage: live-plan events <plan-file|--url plan-url> [--follow]')
  if (!published) return 1
  const url = await localServiceUrl(published)
  const token = await resolveAgentToken(args, url)
  const follow = args.includes('--follow')
  console.error(
    follow
      ? 'Listening for submissions. Each one prints as it arrives. This command stays running until it is stopped.'
      : 'Listening for the next submission.',
  )
  const stop = await syncCloudUrl(url)
  try {
    return await listenForSubmissions(url, token, !follow, args)
  } finally {
    stop()
  }
}

async function cmdWatch(args: string[]): Promise<number> {
  const published = await planUrlArg(args, 'Usage: live-plan watch <plan-file|--url plan-url>')
  if (!published) return 1
  const url = await localServiceUrl(published)
  const token = await resolveAgentToken(args, url)
  const headers = {
    'content-type': 'application/json',
    ...(await cloudRequestHeaders(url, args)),
  }
  const response = await fetch(planApiUrl(url, '/api/mode'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'watch' }),
  })
  if (!response.ok) {
    console.error(await response.text())
    return 1
  }
  console.error('Watching plan execution. This command stays running. Stop it when execution is finished.')
  const stop = await syncCloudUrl(url)
  try {
    return await listenForSubmissions(url, token, false, args)
  } finally {
    stop()
  }
}

/** `--iteration N` as a review round. Omitted keeps the round. */
function readIterationFlag(args: string[]): number | undefined | 'invalid' {
  if (!hasFlag(args, '--iteration')) return undefined
  return readIteration(getFlag(args, '--iteration') ?? '')
}

async function cmdMode(args: string[]): Promise<number> {
  const mode = args[0]
  if (mode !== 'watch' && mode !== 'comment' && mode !== 'review') {
    console.error('Usage: live-plan mode <watch|comment|review> <plan-file|--url plan-url> [--iteration N]')
    return 1
  }
  const published = await planUrlArg(args, 'Usage: live-plan mode <watch|comment|review> <plan-file|--url plan-url> [--iteration N]')
  if (!published) return 1
  const iteration = readIterationFlag(args)
  if (iteration === 'invalid') {
    console.error('--iteration takes a whole number of 1 or more')
    return 1
  }
  const url = await localServiceUrl(published)
  const headers = {
    'content-type': 'application/json',
    ...(await cloudRequestHeaders(url, args)),
  }
  const response = await fetch(planApiUrl(url, '/api/mode'), {
    method: 'POST',
    headers,
    body: JSON.stringify(iteration === undefined ? { mode } : { mode, iteration }),
  })
  if (!response.ok) {
    console.error(await response.text())
    return 1
  }
  console.log(JSON.stringify(await response.json(), null, 2))
  return 0
}

/** The plan URL from `--url`, or from the plan file. Prints `usage` when the command was given neither. */
async function planUrlArg(args: string[], usage: string): Promise<string | null> {
  try {
    const url = await resolvePlanUrl(args)
    if (!url) console.error(usage)
    return url
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return null
  }
}

async function postPlan(published: string, apiPath: string, body?: unknown, options: { quiet?: boolean } = {}): Promise<number> {
  const url = await localServiceUrl(published)
  const headers: Record<string, string> = {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(await cloudRequestHeaders(url, process.argv.slice(2))),
  }
  const response = await fetch(planApiUrl(url, apiPath), {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    console.error(await response.text())
    return 1
  }
  const payload = await response.json()
  if (!options.quiet) console.log(JSON.stringify(payload, null, 2))
  return 0
}

function commentIdFrom(args: string[]): string | undefined {
  const commentId = args[0]
  if (!commentId || commentId.startsWith('--')) return undefined
  return commentId
}

/**
 * Answer a comment in one command: write the reply and mark it answered. The page already shows the
 * comment in progress once a listener printed it. `--keep-open` writes the reply and leaves it open.
 */
async function cmdReply(args: string[]): Promise<number> {
  const usage = 'Usage: live-plan reply <comment-id> <plan-file|--url plan-url> --text "..." [--outcome implemented|errored|issues] [--keep-open]'
  const commentId = commentIdFrom(args)
  const text = getFlag(args, '--text')
  const outcome = getFlag(args, '--outcome')
  if (!commentId || text == null) {
    console.error(usage)
    return 1
  }
  if (hasFlag(args, '--outcome') && outcome !== 'implemented' && outcome !== 'errored' && outcome !== 'issues') {
    console.error(usage)
    return 1
  }
  if (hasFlag(args, '--outcome') && hasFlag(args, '--keep-open')) {
    console.error('--outcome closes the comment. Leave it out with --keep-open.')
    return 1
  }
  const published = await planUrlArg(args, usage)
  if (!published) return 1
  const path = `/api/comments/${encodeURIComponent(commentId)}`
  if (hasFlag(args, '--keep-open')) return postPlan(published, `${path}/reply`, { text })
  const replied = await postPlan(published, `${path}/reply`, { text }, { quiet: true })
  if (replied !== 0) return replied
  return postPlan(published, `${path}/address`, outcome ? { outcome } : undefined)
}

/** Optional: mark a comment in progress before a listener printed it. */
async function cmdAddressing(args: string[]): Promise<number> {
  const usage = 'Usage: live-plan addressing <comment-id> <plan-file|--url plan-url>'
  const commentId = commentIdFrom(args)
  if (!commentId) {
    console.error(usage)
    return 1
  }
  const published = await planUrlArg(args, usage)
  if (!published) return 1
  return postPlan(published, `/api/comments/${encodeURIComponent(commentId)}/addressing`)
}

/** Mark a comment answered without a reply. `reply` does this too. */
async function cmdAddress(args: string[]): Promise<number> {
  const usage = 'Usage: live-plan address <comment-id> <plan-file|--url plan-url> [--outcome implemented|errored|issues]'
  const commentId = commentIdFrom(args)
  const outcome = getFlag(args, '--outcome')
  if (!commentId) {
    console.error(usage)
    return 1
  }
  if (hasFlag(args, '--outcome') && outcome !== 'implemented' && outcome !== 'errored' && outcome !== 'issues') {
    console.error(usage)
    return 1
  }
  const published = await planUrlArg(args, usage)
  if (!published) return 1
  return postPlan(
    published,
    `/api/comments/${encodeURIComponent(commentId)}/address`,
    outcome ? { outcome } : undefined,
  )
}

async function cmdSearch(args: string[]): Promise<number> {
  const usage = [
    'Usage: live-plan search --query TERMS [--query TERMS] [--version live|all] [--any] [--fuzzy] [--json] [--cloud]',
    '       live-plan search <plan-file|--url plan-url> --query TERMS [--version live|N|all] [--any] [--fuzzy] [--json] [--token TOKEN]',
  ].join('\n')
  let published: string | null
  try {
    published = await resolvePlanUrl(args)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
  const queries = getFlags(args, '--query', '-q').filter((value) => value.trim())
  const version = getFlag(args, '--version')
  if (queries.length === 0 || (hasFlag(args, '--version') && !version) || (hasFlag(args, '--url') && !published)) {
    console.error(usage)
    return 1
  }
  if (published && hasFlag(args, '--cloud')) {
    console.error('--cloud searches all plans on the account. Leave it out with --url: the URL already names the host.')
    return 1
  }
  const params = new URLSearchParams({ q: queries.join(' ') })
  if (version && version !== 'live') params.set('version', version)
  if (hasFlag(args, '--any')) params.set('match', 'any')
  if (hasFlag(args, '--fuzzy')) params.set('fuzzy', 'on')
  if (!published) return searchAllPlans(args, params)
  const url = await localServiceUrl(published)
  const response = await fetch(planApiUrl(url, `/api/search?${params}`), {
    headers: await cloudRequestHeaders(url, args),
  })
  if (!response.ok) {
    console.error((await response.text()) || `Search failed with HTTP ${response.status}`)
    return 1
  }
  const result = (await response.json()) as SearchResponse
  if (hasFlag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else console.log(formatSearchResponse(result))
  return result.versions.some((entry) => entry.hits.length > 0) ? 0 : 2
}

/** `search` without `--url`: every plan on this machine's service, or with `--cloud` every plan on the account. */
async function searchAllPlans(args: string[], params: URLSearchParams): Promise<number> {
  if (/^\d+$/.test(params.get('version') ?? '')) {
    console.error('A version number applies to one plan. Pass --url <plan-url> with it, or use --version all.')
    return 1
  }
  let endpoint: string
  let base: string
  const headers: Record<string, string> = {}
  if (hasFlag(args, '--cloud')) {
    const account = (await readCloudFile()).account
    if (!account) {
      console.error('No hosted account. Run live-plan account login --url https://your-host')
      return 1
    }
    base = account.baseUrl
    endpoint = new URL(`/api/account/search?${params}`, base).href
    headers.authorization = `Bearer ${account.token}`
  } else {
    const registry = await openRegistry(args)
    if (!registry) {
      console.error('The plan service on this machine is not available.')
      return 1
    }
    base = registry.url
    endpoint = new URL(`/api/dashboard/search?${params}`, registryBindUrl(registry)).href
  }
  let response: Response
  try {
    response = await fetch(endpoint, { headers, cache: 'no-store' })
  } catch (error) {
    console.error(`Search failed: ${error instanceof Error ? error.message : error}`)
    return 1
  }
  if (!response.ok) {
    const body = await response.text()
    let message = body
    try {
      message = (JSON.parse(body) as { error?: string }).error ?? body
    } catch {
      // Plain text from the host.
    }
    if (response.status === 401) message = 'Sign in required. Run live-plan account login --url ' + base
    if (response.status === 404 && hasFlag(args, '--cloud')) message = `${base} does not offer plan search yet. It needs a host deployed with this version.`
    console.error(message || `Search failed with HTTP ${response.status}`)
    return 1
  }
  const result = (await response.json()) as DashboardSearchResponse
  if (hasFlag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else console.log(formatDashboardSearch(result, base))
  return result.plans.length > 0 ? 0 : 2
}

async function cmdClose(args: string[]): Promise<number> {
  const url = await planUrlArg(args, 'Usage: live-plan close <plan-file|--url plan-url>')
  if (!url) return 1
  const stored = await readCloudFile()
  const hosted = planRecordForUrl(stored, url)
  if (hosted || cloudCredential(stored, url)) {
    if (!hosted) {
      console.error('No plan token for that hosted URL. Pass --token, or serve the plan from this machine.')
      return 1
    }
    const token = (await resolveAgentToken(args, url)) ?? hosted.token
    await closeCloudPlan(hosted.url, token)
    stopCloudWatch(hosted.watchPid)
    delete stored.plans[hosted.id]
    await writeCloudFile(stored)
    console.log(`Closed ${url}`)
    return 0
  }
  const id = planIdFromPlanUrl(url)
  if (!id) {
    console.error('That URL is not a plan hosted by the service.')
    return 1
  }
  const token = await resolveAgentToken(args, url)
  if (!token) {
    console.error('No service token found. Pass --token.')
    return 1
  }
  const origin = new URL(await localServiceUrl(url)).origin
  await closeHostedPlan(origin, token, id)
  console.log(`Closed ${url}`)
  return 0
}

async function buildExecutionPatch(args: string[]): Promise<ExecutionPatch> {
  const graphPath = getFlag(args, '--graph')
  const scenePath = getFlag(args, '--scene')
  const patch: ExecutionPatch = {}
  const step = getFlag(args, '--step')
  const detail = getFlag(args, '--detail')
  if (step) patch.step = step
  if (detail) patch.detail = detail
  if (graphPath) patch.graph = await readJsonFile<ExecutionGraph>(graphPath)
  if (scenePath) patch.scene = await readJsonFile<Record<string, unknown>>(scenePath)
  return patch
}

async function cmdExecution(args: string[]): Promise<number> {
  const action = args[0]
  const rest = args.slice(1)
  const published = await planUrlArg(rest, 'Usage: live-plan execution start|push|stop <plan-file|--url plan-url> [--step TEXT] [--detail TEXT] [--graph file.json]')
  if (!published) return 1
  const url = await localServiceUrl(published)

  if (action === 'start' || action === 'push' || action === 'stop') {
    const execution = await changeExecution(url, action, await buildExecutionPatch(rest))
    console.log(JSON.stringify(execution, null, 2))
    return 0
  }

  console.error('Usage: live-plan execution <start|push|stop> --url <server-url>')
  return 1
}

async function cmdProcesses(): Promise<number> {
  const home = defaultRegistryHome()
  const lock = await readRegistryLock(home)
  if (!lock || !isPidAlive(lock.pid) || !(await registryHealthy(registryBindUrl(lock)))) {
    console.log('No live-plan registry is running.')
    return 0
  }
  const processes = await listProcesses(registryBindUrl(lock))
  const noun = processes.length === 1 ? 'plan' : 'plans'
  console.log(`${processes.length} running ${noun} · ${lock.url}`)
  console.log(`Dashboard: ${new URL('/dashboard', lock.url).href}`)
  for (const entry of processes) {
    console.log('')
    console.log(entry.title)
    console.log(`  ${entry.mode}  ${entry.url}`)
    console.log(`  ${entry.directory}`)
    console.log(`  ${entry.git.summary}`)
    if (entry.executionActive) {
      console.log(`  executing: ${entry.executionStep ?? 'live'}`)
    }
  }
  return 0
}

async function cmdLogs(args: string[]): Promise<number> {
  const level = getFlag(args, '--level')
  if (hasFlag(args, '--level') && !level) {
    console.error('level must be error, warn, or log')
    return 1
  }
  if (level && level !== 'error' && level !== 'warn' && level !== 'log') {
    console.error('level must be error, warn, or log')
    return 1
  }
  const limitFlag = getFlag(args, '--limit')
  if (hasFlag(args, '--limit') && !limitFlag) {
    console.error('limit must be from 1 to 500')
    return 1
  }
  const limit = limitFlag ? Number(limitFlag) : undefined
  if (limitFlag && (!Number.isInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
    console.error('limit must be from 1 to 500')
    return 1
  }

  const urlFlag = getFlag(args, '--url')
  if (hasFlag(args, '--url') && !urlFlag) {
    console.error('live-plan logs --url needs a plan URL')
    return 1
  }
  let planId: string | undefined
  if (urlFlag) {
    const parsed = planIdFromPlanUrl(urlFlag)
    if (!parsed) {
      console.error("That URL has no plan id. Omit --url to read today's registry log.")
      return 1
    }
    planId = parsed
  } else {
    const day = getFlag(args, '--day')
    if (hasFlag(args, '--day') && (!day || !isLogDay(day))) {
      console.error('day must be YYYY-MM-DD')
      return 1
    }
    const logs = await listLogs({
      level: level as LogLevel | undefined,
      limit,
      day,
    })
    console.log(formatServiceLogLines(logs))
    return 0
  }

  const logs = await listLogs({
    level: level as LogLevel | undefined,
    planId,
    limit,
  })
  console.log(formatServiceLogLines(logs))
  return 0
}

async function cmdDashboard(args: string[]): Promise<number> {
  const registry = await openRegistry(args, { anyVersion: hasFlag(args, '--any-version') })
  if (!registry) {
    console.error('Registry unavailable.')
    return 1
  }
  if (hasFlag(args, '--json')) {
    // One line for a program such as the desktop app. Both URLs are the address this machine dials.
    const service = registryBindUrl(registry)
    console.log(JSON.stringify({ url: new URL('/dashboard', service).href, service, version: registry.version }))
    return 0
  }
  const url = new URL('/dashboard', registry.url).href
  console.log(`Plan dashboard: ${url}`)
  // Open the address this machine dials: a LAN name would need the LAN secret, and the apps know the loopback one.
  await openBrowser(new URL('/dashboard', registryBindUrl(registry)).href)
  return 0
}

async function cmdRegistry(args: string[]): Promise<number> {
  const { startRegistryServer } = await import('./registryService')
  const home = defaultRegistryHome()
  const portFlag = getFlag(args, '--port')
  const port = portFlag ? Number(portFlag) : DEFAULT_REGISTRY_PORT
  const { chooseBindHost, readLanEnabled } = await import('./lanConfig')
  const host = chooseBindHost(getFlag(args, '--host'), await readLanEnabled(home))
  const version = await readPackageVersion(fileURLToPath(import.meta.url))
  const existing = await readRegistryLock(home)
  if (existing && existing.version === version && isPidAlive(existing.pid) && (await registryHealthy(registryBindUrl(existing)))) {
    console.log(`Living Plan service already running: ${existing.url}`)
    return 0
  }
  if (existing && isPidAlive(existing.pid) && (await registryHealthy(registryBindUrl(existing)))) {
    try {
      process.kill(existing.pid, 'SIGTERM')
    } catch {
      // The previous service already exited.
    }
    const started = Date.now()
    while (isPidAlive(existing.pid) && Date.now() - started < 1_500) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    }
  }
  const registryPort = Number.isFinite(port) ? port : DEFAULT_REGISTRY_PORT
  const server = await startRegistryServer({
    home,
    host,
    port: registryPort,
    version,
  })
  console.log(`Living Plan service: ${server.url}`)
  await new Promise<void>((resolveWait) => {
    const stop = () => resolveWait()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  await server.close()
  return 0
}

async function resolveThemeConfigPath(args: string[], options?: { forWrite?: boolean }): Promise<string> {
  const explicit = getFlag(args, '--config')
  if (explicit) return resolve(explicit)
  const plan = getFlag(args, '--plan')
  if (plan) return configPathBesidePlan(plan)
  const preferred = globalThemeConfigPath()
  if (options?.forWrite) return preferred
  try {
    await access(preferred)
    return preferred
  } catch {
    // Older installs wrote a CWD live-plan.config.json when theme ran without --plan.
    const cwdPath = cwdThemeConfigPath()
    try {
      await access(cwdPath)
      return cwdPath
    } catch {
      return preferred
    }
  }
}

async function cmdTheme(args: string[]): Promise<number> {
  const action = args[0]
  const rest = args.slice(1)
  const published = getFlag(rest, '--url')
  const url = published ? await localServiceUrl(published) : undefined

  if (action === 'get') {
    if (url) {
      const response = await fetch(planApiUrl(url, '/api/theme'))
      if (!response.ok) {
        console.error(await response.text())
        return 1
      }
      console.log(JSON.stringify(await response.json(), null, 2))
      return 0
    }
    const configPath = await resolveThemeConfigPath(rest)
    const config = await loadThemeConfig(configPath)
    console.log(JSON.stringify(themePayload(config, configPath), null, 2))
    return 0
  }

  if (action === 'set') {
    const accentRaw = getFlag(rest, '--accent') ?? rest.find((arg) => arg.startsWith('#'))
    const accent = normalizeAccent(accentRaw)
    if (!accent) {
      console.error(
        `Usage: live-plan theme set --accent ${DEFAULT_ACCENT} [--url <server-url>] [--config file] [--plan file.plan.md]`,
      )
      return 1
    }

    if (url) {
      const response = await fetch(planApiUrl(url, '/api/theme'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accent }),
      })
      if (!response.ok) {
        console.error(await response.text())
        return 1
      }
      console.log(JSON.stringify(await response.json(), null, 2))
      return 0
    }

    const readPath = await resolveThemeConfigPath(rest)
    const writePath = await resolveThemeConfigPath(rest, { forWrite: true })
    const current = await loadThemeConfig(readPath)
    const saved = await saveThemeConfig(writePath, { ...current, accent })
    console.log(JSON.stringify(themePayload(saved, writePath), null, 2))
    return 0
  }

  console.error('Usage: live-plan theme <get|set> [--accent #hex] [--url <server-url>] [--config file]')
  return 1
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const command = args[0]

  // `search --version N` picks a saved plan version, so it is not the package version flag there.
  if (command !== 'search' && (hasFlag(args, '--version') || hasFlag(args, '-v'))) {
    console.log(await readPackageVersion(fileURLToPath(import.meta.url)))
    return 0
  }

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return 0
  }

  if (command === 'check') {
    const file = args[1]
    if (!file) {
      console.error('Usage: live-plan check <file.plan.md>')
      return 1
    }
    return cmdCheck(file)
  }

  if (command === 'dump') {
    const file = args[1]
    if (!file) {
      console.error('Usage: live-plan dump <file.plan.md>')
      return 1
    }
    return cmdDump(file)
  }

  if (command === 'serve') {
    const file = args[1]
    if (!file) {
      console.error('Usage: live-plan serve <file.plan.md>')
      return 1
    }
    return cmdServe(file, args.slice(2))
  }

  if (command === 'review') {
    const file = args[1]
    if (!file) {
      console.error('Usage: live-plan review <file.plan.md>')
      return 1
    }
    return cmdReview(file, args.slice(2))
  }

  if (command === 'wait') {
    const id = args[1]
    if (!id) {
      console.error('Usage: live-plan wait <id> --url <plan-url>')
      return 1
    }
    return cmdWait(id, args.slice(2))
  }

  if (command === 'events') {
    return cmdEvents(args.slice(1))
  }

  if (command === 'watch') {
    return cmdWatch(args.slice(1))
  }

  if (command === 'close') {
    return cmdClose(args.slice(1))
  }

  if (command === 'mode') {
    return cmdMode(args.slice(1))
  }

  if (command === 'reply') {
    return cmdReply(args.slice(1))
  }

  if (command === 'search') {
    return cmdSearch(args.slice(1))
  }

  if (command === 'addressing') {
    return cmdAddressing(args.slice(1))
  }

  if (command === 'address') {
    return cmdAddress(args.slice(1))
  }

  if (command === 'execution') {
    return cmdExecution(args.slice(1))
  }

  if (command === 'processes' || command === 'ps') {
    return cmdProcesses()
  }

  if (command === 'logs') {
    return cmdLogs(args.slice(1))
  }

  if (command === 'dashboard') {
    return cmdDashboard(args.slice(1))
  }

  if (command === 'tui') {
    const { runTui } = await import('./tui/runTui')
    return runTui(args.slice(1), fileURLToPath(import.meta.url))
  }

  if (command === 'registry') {
    return cmdRegistry(args.slice(1))
  }

  if (command === 'lan') {
    const { lanOff, lanOn, lanStatus } = await import('./lanCommand')
    const action = args[1]
    const entry = fileURLToPath(import.meta.url)
    if (action === 'on') return lanOn(entry)
    if (action === 'off') return lanOff(entry)
    if (action === 'status') return lanStatus()
    console.error('Usage: live-plan lan <on|off|status>')
    return 1
  }

  if (command === 'account') {
    const action = args[1]
    if (action !== 'login') {
      console.error('Usage: live-plan account login --url https://host [--headless | --token <token>]')
      return 1
    }
    const base = getFlag(args, '--url') ?? process.env.LIVE_PLAN_CLOUD_URL
    if (!base) {
      console.error('Pass --url https://host or set LIVE_PLAN_CLOUD_URL.')
      return 1
    }
    const raw = getFlag(args, '--token')
    const token = raw && (raw === '-' || !raw.startsWith('-')) ? raw : undefined
    if (args.includes('--token') && !token) {
      console.error('Pass the token after --token, or --token - to read it from stdin.')
      return 1
    }
    if (token && args.includes('--headless')) {
      console.error('--headless prints the token page. Pass --token on its own once you have one.')
      return 1
    }
    try {
      if (args.includes('--headless')) {
        const page = `${normalizeBase(base)}${CLI_TOKEN_PATH}`
        console.log(`Open this page in any browser, on any device. Sign in, or choose Sign up instead to create an account:\n${page}`)
        console.log('The page shows a command with a token. Paste it here:\n  live-plan account login --url <host> --token <token>')
        return 0
      }
      if (token) {
        const signed = await signInWithToken(base, token === '-' ? await readStdin() : token)
        console.log(`Signed in to ${signed.baseUrl} as ${signed.email}`)
        return 0
      }
      await signInToCloud(base, async (url) => {
        // Print the link too, so a person can open it when no browser launches.
        console.log(`Sign in, or choose Sign up instead to create an account:\n${url}`)
        console.log('No browser on this machine? Run live-plan account login --headless instead.')
        // Sign-in hands off to a loopback callback, so it stays in a browser tab.
        if (!hasFlag(process.argv.slice(2), '--no-open')) openInBrowser(url)
      })
      const account = await requireCloudAccount()
      console.log(`Signed in to ${account.baseUrl}`)
      return 0
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      return 1
    }
  }

  if (command === 'cloud-watch') {
    const watchUrl = getFlag(args, '--url')
    if (!watchUrl) {
      console.error('cloud-watch requires --url')
      return 1
    }
    await runCloudWatch(watchUrl)
    return 0
  }

  if (command === 'theme') {
    return cmdTheme(args.slice(1))
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  return 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
