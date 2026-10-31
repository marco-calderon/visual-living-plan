#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { writeSync } from 'node:fs'
import { access, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClientAssets } from './assets'
import { parsePlan } from './parse'
import {
  ackPlanEvents,
  pendingFromHello,
  planApiUrl,
  planIdFromPlanUrl,
  readAgentEvents,
  submissionEvent,
} from './agentEvents'
import type { PlanSubmissionEvent } from './types'
import { startLivingPlanServer } from './server'
import type { ExecutionGraph, ExecutionState } from './execution'
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
  rewriteToBindUrl,
  type RegistryLock,
} from './registryClient'
import { isPidAlive } from './pid'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT } from './registryConstants'
import { formatServiceLogLines, isLogDay, listLogs, recordLog, type LogLevel } from './serviceLog'
import { closeCloudPlan, hostedViewUrl } from './cloudClient'
import {
  cloudFlagConflict,
  prepareCloudPlan,
  requireCloudAccount,
  runCloudWatch,
  signInToCloud,
  spawnCloudWatch,
  stopCloudWatch,
  syncCloudUrl,
} from './cloudCommand'
import { cloudCredential, planRecordForUrl, readCloudFile, writeCloudFile } from './cloudStore'

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

Usage:
  live-plan serve <file.plan.md> [--port N] [--host HOST] [--config file] [--no-open] [--detach]
  live-plan review <file.plan.md> [--port N] [--iteration N] [--timeout 30m] [--config file] [--no-open]
  live-plan wait <id> --url <plan-url> [--token TOKEN] [--timeout 30m]
  live-plan events --url <plan-url> [--token TOKEN]
  live-plan watch --url <plan-url> [--token TOKEN]
  live-plan close --url <plan-url> [--token TOKEN]
  live-plan mode <watch|comment|review> --url <plan-url>
  live-plan reply <comment-id> --url <plan-url> --text "..."
  live-plan addressing <comment-id> --url <plan-url>
  live-plan address <comment-id> --url <plan-url> [--outcome implemented|errored|issues]
  live-plan execution start --url <plan-url> [--step TEXT] [--detail TEXT] [--graph file.json]
  live-plan execution push --url <plan-url> [--step TEXT] [--detail TEXT] [--graph file.json] [--scene file.json]
  live-plan execution stop --url <plan-url>
  live-plan theme get [--url <plan-url>] [--config file] [--plan file.plan.md]
  live-plan theme set --accent #hex [--url <plan-url>] [--config file] [--plan file.plan.md]
  live-plan check <file.plan.md>
  live-plan dump <file.plan.md>
  live-plan processes
  live-plan logs [--level error|warn|log] [--url <plan-url>] [--day YYYY-MM-DD] [--limit N]
  live-plan dashboard
  live-plan tui [--period day|week|month] [--registry-port N] [--registry-host HOST]
  live-plan registry [--port N] [--host HOST]
  live-plan lan on|off|status
  live-plan --version

Requires Bun (https://bun.sh). Invoke with \`bunx visual-living-plan <command>\` when the \`live-plan\` command is not installed. \`living-plan\` is the same binary.

Modes:
  serve       Register the plan on the machine service and print submissions for that plan.
  review      Same page, plus Approve / Deny / Iterate. Blocks until a decision.
  wait        Block until one interaction id is answered.
  events      Print undelivered submissions as JSON, then exit. Start it again to see if more are pending.
  watch       Switch to watch mode and stay running while the plan executes. Prints submissions without exiting.
  close       Drop a plan from the machine service.
  mode        Switch the open session between watch, comment, and review. The open tab follows.
  reply       Answer one plan comment. The page shows the text on that comment's minibar or part thread.
  addressing  Mark one comment as being reviewed. The page shows Addressing or Working.
  address     Mark one comment answered. The page shows Addressed, or the outcome on a minibar message.
  execution   Start/push/stop the live workflow canvas (locks plan forms while active).
  account     Sign in to the hosted service. \`account login --url https://host\`.
  theme       Read or write the accent color in live-plan.config.json (or via a running server).
  check       Print plan summary. Exits 1 when the required workflow block is missing.
  processes   List plans hosted by the service. \`ps\` is the same command.
  logs        Print the development log saved under ~/.config/living-plan/logs. Not shown on the page. --day reads one registry day (today when omitted). --url reads one plan.
  dashboard   Open the control dashboard (running and executed plans, by day, week, or month).
  tui         The registry in the terminal: running plans, and the day, week, and month dashboard. Starts the plan service when it is not already running. Quitting leaves that service up. Active plans are listed first. Click a control, or use Tab, arrows, p, d, and the number keys.
  registry    Run the plan service in the foreground. serve and review start it on their own.
  lan         Publish this machine's plan service on the local network. Off until \`lan on\`.

Every plan includes a \`workflow\` block. That block is the execution path the Workflow tab draws.
Per-plan accent color is saved in live-plan.config.json beside the plan (override with --config).
Without --plan or --config, theme get/set uses ~/.config/living-plan/live-plan.config.json.
Service state and diagnostic logs live under ~/.config/living-plan (LIVE_PLAN_HOME / LIVE_PLAN_LOG_HOME override).
--no-open skips launching a browser.
--version prints the package version and exits. -v is the short flag.
--detach registers the plan and returns. Without it, serve prints the next undelivered submissions and exits. The page stays up on the service.
events does the same on a URL you already have. A submission that arrived while it was stopped is printed immediately, then the process exits. Start events again after every comment, denial, or approval so a pending event is not left on the server.
watch switches that session to watch mode and stays running. Use it after an approval, while execution is in progress. Stop it when execution is finished.
The machine service keeps running after serve, events, wait, review, dashboard, and tui exit.
--no-registry serves this plan in its own process instead of the machine service.
--port sets that private process port. With the service, --port is used only when the service is not already running.
--registry-port and --registry-host choose the service (default ${DEFAULT_REGISTRY_HOST}:${DEFAULT_REGISTRY_PORT}).
The printed URL uses that address. On loopback it is http://127.0.0.1:${DEFAULT_REGISTRY_PORT}/plans/<id>/. --host other than loopback is the address a cloud agent shares.
LAN publishing is off on a fresh install. \`lan on\` listens on all interfaces, advertises living-plan.local, and prints a LAN URL for other devices. \`serve\` and \`review\` still print the loopback plan URL. The CLI dials 127.0.0.1 and does not resolve *.local.
--token authorizes the agent event stream. Omitted, the local service token is used.
--cloud hosts the plan on the signed-in service. It does not start the local registry, and it does not fall back to loopback.
account login stores the session in ~/.config/living-plan/cloud.json. LIVE_PLAN_CLOUD_URL sets the host when --url is omitted.
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

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

async function openBrowser(url: string): Promise<void> {
  if (hasFlag(process.argv.slice(2), '--no-open')) return
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const commandArgs = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, commandArgs, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    // A missing opener must not take down the server.
  })
  child.unref()
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Write one JSON line to stdout without waiting for a block buffer. Agents read this pipe live. */
function printJsonLine(value: unknown): void {
  writeSync(1, `${JSON.stringify(value)}\n`)
}

/** Record that the CLI printed these submissions. A failed ack leaves them pending for the next start. */
async function acknowledgeSubmissions(url: string, token: string | undefined, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  try {
    await ackPlanEvents(url, token, ids)
    return true
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Print submissions the server has not marked delivered.
 * With `once`, a waiting batch is printed immediately and the process exits; otherwise this waits for the next one and then exits.
 * Without `once`, each batch is printed and the process stays up until it is stopped.
 */
async function listenForSubmissions(url: string, token?: string, once = true): Promise<number> {
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const delivered = new Set<string>()
  let failed: unknown
  let ackFailed = false
  let ackChain = Promise.resolve()

  const take = (incoming: PlanSubmissionEvent[]) => {
    const fresh = incoming
      .filter((submission) => submission.deliveredAt == null && !delivered.has(submission.id))
      .sort((left, right) => left.seq - right.seq)
    if (fresh.length === 0) return
    for (const submission of fresh) {
      delivered.add(submission.id)
      printJsonLine({ event: submission.event, id: submission.id, seq: submission.seq, data: submission.data })
    }
    const ids = fresh.map((submission) => submission.id)
    ackChain = ackChain.then(async () => {
      const acked = await acknowledgeSubmissions(url, token, ids)
      if (!acked) ackFailed = true
    })
    if (once) controller.abort()
  }

  try {
    await readAgentEvents(
      url,
      token,
      (event) => {
        if (event.event === 'hello') {
          take(pendingFromHello(event.data))
          return
        }
        if (event.event !== 'notice') return
        const submission = submissionEvent(event.data)
        if (!submission) return
        take([submission])
      },
      controller.signal,
    )
  } catch (error) {
    if (!isAbortError(error)) failed = error
  }
  await ackChain
  if (failed && delivered.size === 0) {
    console.error(failed instanceof Error ? failed.message : failed)
    return 1
  }
  if (once && ackFailed) return 1
  return 0
}

/** Print the next undelivered submissions for one hosted plan, then exit. The page stays up. */
async function followPlan(url: string, token: string): Promise<number> {
  console.log('Listening for submissions. This command prints them and exits. The page stays up.')
  return listenForSubmissions(url, token)
}

async function cloudRequestHeaders(url: string, args: string[]): Promise<Record<string, string>> {
  const credential = cloudCredential(await readCloudFile(), url)
  if (!credential) return {}
  const token = await resolveAgentToken(args, url)
  if (!token) throw new Error('No plan token for that hosted URL. Pass --token, or serve the plan from this machine.')
  return { authorization: `Bearer ${token}` }
}

async function putExecution(url: string, body: ExecutionState): Promise<ExecutionState> {
  const planId = planIdFromPlanUrl(url) ?? undefined
  let response: Response
  try {
    const headers = {
      'content-type': 'application/json',
      ...(await cloudRequestHeaders(url, process.argv.slice(2))),
    }
    response = await fetch(planApiUrl(url, '/api/execution'), {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
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
  if (!response.ok) {
    const text = await response.text()
    await recordLog({
      level: 'error',
      message: `Execution request failed: ${text || response.status}`,
      source: 'execution',
      planId,
      echo: false,
    }).catch(() => undefined)
    throw new Error(text || `Execution request failed (${response.status})`)
  }
  const payload = (await response.json()) as { execution: ExecutionState }
  return payload.execution
}

async function cmdCheck(file: string): Promise<number> {
  const source = await readFile(resolve(file), 'utf8')
  const plan = parsePlan(source, file)
  const workflowError = workflowRequirementError(plan)
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

async function openRegistry(args: string[]): Promise<RegistryLock | null> {
  if (hasFlag(args, '--no-registry')) return null
  const portFlag = getFlag(args, '--registry-port') ?? getFlag(args, '--port')
  const port = portFlag ? Number(portFlag) : undefined
  const host = getFlag(args, '--registry-host') ?? getFlag(args, '--host')
  try {
    return await ensureRegistry({
      entryFile: fileURLToPath(import.meta.url),
      port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
      host,
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
    const record = await prepareCloudPlan({ planPath: resolve(file), mode })
    console.log(`Living Plan (${mode}): ${record.url}`)
    console.log(`Plan file: ${resolve(file)}`)
    console.log('Hosted plan. The local registry was not started.')
    const account = await requireCloudAccount()
    await openBrowser((await hostedViewUrl(record.url, account.token)) ?? record.url)
    if (mode === 'watch' && hasFlag(args, '--detach')) {
      const pid = spawnCloudWatch(fileURLToPath(import.meta.url), record)
      const stored = await readCloudFile()
      const current = stored.plans[record.id]
      if (current) {
        stored.plans[record.id] = { ...current, watchPid: pid }
        await writeCloudFile(stored)
      }
      console.log(`Events: live-plan events --url ${record.url}`)
      return 0
    }
    const stop = await syncCloudUrl(record.url)
    try {
      if (mode === 'review') {
        const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
        const held = await readReviewEvent(record.url, record.token, timeoutMs)
        await writeReviewOutput(args, held.review)
        await acknowledgeSubmissions(record.url, record.token, held.eventIds)
        return reviewExitCode(held.review.decision)
      }
      return await followPlan(record.url, record.token)
    } finally {
      stop()
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
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
    await openBrowser(hosted.url)
    if (hasFlag(args, '--detach')) {
      console.log(`Events: live-plan events --url ${hosted.url}`)
      return 0
    }
    return followPlan(rewriteToBindUrl(registry, hosted.url), hosted.token)
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
  await openBrowser(server.url)
  console.log('Listening for the next submission. This command exits when one arrives.')
  const code = await listenForSubmissions(server.url)
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

async function readReviewEvent(
  url: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<{ review: ReviewPayload; eventIds: string[] }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let review: ReviewPayload | undefined
  let eventIds: string[] = []
  try {
    await readAgentEvents(
      url,
      token,
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
    )
  } catch (error) {
    if (!review && !isAbortError(error)) throw error
  } finally {
    clearTimeout(timer)
  }
  if (!review) throw new Error('Timed out waiting for review decision')
  return { review, eventIds }
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
    await openBrowser(url)
    const held = await readReviewEvent(url, undefined, timeoutMs)
    await writeReviewOutput(args, held.review)
    await acknowledgeSubmissions(url, undefined, held.eventIds)
    return reviewExitCode(held.review.decision)
  } catch (error) {
    if (child.exitCode == null && !child.killed) child.kill()
    console.error(error instanceof Error ? error.message : error)
    return 3
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
    await openBrowser(hosted.url)
    try {
      const apiUrl = rewriteToBindUrl(registry, hosted.url)
      const held = await readReviewEvent(apiUrl, hosted.token, timeoutMs)
      await writeReviewOutput(args, held.review)
      await acknowledgeSubmissions(apiUrl, hosted.token, held.eventIds)
      return reviewExitCode(held.review.decision)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      return 3
    }
  }

  return privateReview(file, args)
}

async function cmdWait(id: string, args: string[]): Promise<number> {
  const published = getFlag(args, '--url')
  if (!published) {
    console.error('live-plan wait requires --url <plan-url>')
    return 1
  }
  const url = await localServiceUrl(published)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const token = await resolveAgentToken(args, url)
  const stop = await syncCloudUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let printed = false
  let eventIds: string[] = []
  try {
    await readAgentEvents(
      url,
      token,
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
    )
  } catch (error) {
    if (!printed && !isAbortError(error)) throw error
  } finally {
    clearTimeout(timer)
    stop()
  }
  if (!printed) {
    console.error(`Timed out waiting for interaction: ${id}`)
    return 3
  }
  await acknowledgeSubmissions(url, token, eventIds)
  return 0
}

async function cmdEvents(args: string[]): Promise<number> {
  const published = getFlag(args, '--url')
  if (!published) {
    console.error('live-plan events requires --url <plan-url>')
    return 1
  }
  const url = await localServiceUrl(published)
  const token = await resolveAgentToken(args, url)
  console.error('Listening for the next submission.')
  const stop = await syncCloudUrl(url)
  try {
    return await listenForSubmissions(url, token, true)
  } finally {
    stop()
  }
}

async function cmdWatch(args: string[]): Promise<number> {
  const published = getFlag(args, '--url')
  if (!published) {
    console.error('live-plan watch requires --url <plan-url>')
    return 1
  }
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
    return await listenForSubmissions(url, token, false)
  } finally {
    stop()
  }
}

async function cmdMode(args: string[]): Promise<number> {
  const mode = args[0]
  if (mode !== 'watch' && mode !== 'comment' && mode !== 'review') {
    console.error('Usage: live-plan mode <watch|comment|review> --url <plan-url>')
    return 1
  }
  const published = getFlag(args, '--url')
  if (!published) {
    console.error('live-plan mode requires --url <plan-url>')
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
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) {
    console.error(await response.text())
    return 1
  }
  console.log(JSON.stringify(await response.json(), null, 2))
  return 0
}

async function postPlan(published: string, apiPath: string, body?: unknown): Promise<number> {
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
  console.log(JSON.stringify(await response.json(), null, 2))
  return 0
}

function commentIdFrom(args: string[]): string | undefined {
  const commentId = args[0]
  if (!commentId || commentId.startsWith('--')) return undefined
  return commentId
}

async function cmdReply(args: string[]): Promise<number> {
  const commentId = commentIdFrom(args)
  const published = getFlag(args, '--url')
  const text = getFlag(args, '--text')
  if (!commentId || !published || text == null) {
    console.error('Usage: live-plan reply <comment-id> --url <plan-url> --text "..."')
    return 1
  }
  return postPlan(published, `/api/comments/${encodeURIComponent(commentId)}/reply`, { text })
}

async function cmdAddressing(args: string[]): Promise<number> {
  const commentId = commentIdFrom(args)
  const published = getFlag(args, '--url')
  if (!commentId || !published) {
    console.error('Usage: live-plan addressing <comment-id> --url <plan-url>')
    return 1
  }
  return postPlan(published, `/api/comments/${encodeURIComponent(commentId)}/addressing`)
}

async function cmdAddress(args: string[]): Promise<number> {
  const usage = 'Usage: live-plan address <comment-id> --url <plan-url> [--outcome implemented|errored|issues]'
  const commentId = commentIdFrom(args)
  const published = getFlag(args, '--url')
  const outcome = getFlag(args, '--outcome')
  if (!commentId || !published) {
    console.error(usage)
    return 1
  }
  if (hasFlag(args, '--outcome') && outcome !== 'implemented' && outcome !== 'errored' && outcome !== 'issues') {
    console.error(usage)
    return 1
  }
  return postPlan(
    published,
    `/api/comments/${encodeURIComponent(commentId)}/address`,
    outcome ? { outcome } : undefined,
  )
}

async function cmdClose(args: string[]): Promise<number> {
  const url = getFlag(args, '--url')
  if (!url) {
    console.error('live-plan close requires --url <plan-url>')
    return 1
  }
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

async function buildExecutionPayload(
  args: string[],
  active: boolean,
): Promise<ExecutionState> {
  const graphPath = getFlag(args, '--graph')
  const scenePath = getFlag(args, '--scene')
  const graph = graphPath ? await readJsonFile<ExecutionGraph>(graphPath) : undefined
  const scene = scenePath ? await readJsonFile<Record<string, unknown>>(scenePath) : undefined
  return {
    active,
    step: getFlag(args, '--step'),
    detail: getFlag(args, '--detail'),
    graph,
    scene,
  }
}

async function cmdExecution(args: string[]): Promise<number> {
  const action = args[0]
  const rest = args.slice(1)
  const published = getFlag(rest, '--url')
  if (!published) {
    console.error('live-plan execution requires --url <server-url>')
    return 1
  }
  const url = await localServiceUrl(published)

  if (action === 'start') {
    const execution = await putExecution(url, await buildExecutionPayload(rest, true))
    console.log(JSON.stringify(execution, null, 2))
    return 0
  }

  if (action === 'push') {
    const currentResponse = await fetch(planApiUrl(url, '/api/execution'))
    const current = (await currentResponse.json()) as ExecutionState
    const next = await buildExecutionPayload(rest, current.active ?? true)
    const execution = await putExecution(url, {
      active: next.active,
      step: next.step ?? current.step,
      detail: next.detail ?? current.detail,
      graph: next.graph ?? current.graph,
      scene: next.scene ?? current.scene,
    })
    console.log(JSON.stringify(execution, null, 2))
    return 0
  }

  if (action === 'stop') {
    const currentResponse = await fetch(planApiUrl(url, '/api/execution'))
    const current = (await currentResponse.json()) as ExecutionState
    const execution = await putExecution(url, {
      ...current,
      active: false,
    })
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
    console.log('No living-plan registry is running.')
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
  const registry = await openRegistry(args)
  if (!registry) {
    console.error('Registry unavailable.')
    return 1
  }
  const url = new URL('/dashboard', registry.url).href
  console.log(`Plan dashboard: ${url}`)
  await openBrowser(url)
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

  if (hasFlag(args, '--version') || hasFlag(args, '-v')) {
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
      console.error('Usage: live-plan account login --url https://host')
      return 1
    }
    const base = getFlag(args, '--url') ?? process.env.LIVE_PLAN_CLOUD_URL
    if (!base) {
      console.error('Pass --url https://host or set LIVE_PLAN_CLOUD_URL.')
      return 1
    }
    try {
      await signInToCloud(base, openBrowser)
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
