#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClientAssets } from './assets.js'
import { parsePlan } from './parse.js'
import { startLivingPlanServer, type LivingPlanServer } from './server.js'
import type { ExecutionGraph, ExecutionState } from './execution.js'
import {
  configPathBesidePlan,
  DEFAULT_ACCENT,
  DEFAULT_CONFIG_FILENAME,
  loadThemeConfig,
  normalizeAccent,
  saveThemeConfig,
  themePayload,
} from './theme.js'
import { planToExpectedGraph } from './workflow.js'
import {
  defaultRegistryHome,
  ensureRegistry,
  listProcesses,
  readRegistryLock,
  registryHealthy,
  watchRegisteredPlan,
} from './registryClient.js'
import { isPidAlive } from './pid.js'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT } from './registryConstants.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function printHelp(): void {
  console.log(`live-plan — agent-authored plans humans can interact with

Usage:
  live-plan serve <file.plan.md> [--port N] [--host HOST] [--config file] [--no-open]
  live-plan review <file.plan.md> [--port N] [--iteration N] [--timeout 30m] [--config file] [--no-open]
  live-plan wait <id> --url <server-url> [--timeout 30m]
  live-plan execution start --url <server-url> [--step TEXT] [--detail TEXT] [--graph file.json]
  live-plan execution push --url <server-url> [--step TEXT] [--detail TEXT] [--graph file.json] [--scene file.json]
  live-plan execution stop --url <server-url>
  live-plan theme get [--url <server-url>] [--config file] [--plan file.plan.md]
  live-plan theme set --accent #hex [--url <server-url>] [--config file] [--plan file.plan.md]
  live-plan check <file.plan.md>
  live-plan dump <file.plan.md>
  live-plan processes
  live-plan registry [--port N] [--host HOST]

Invoke with \`npx --yes visual-living-plan <command>\` when the \`live-plan\` command is not installed. \`living-plan\` is the same binary.

Modes:
  serve       Live watch URL. The Workflow tab draws the plan diagram, then the live run.
  review      Same UI plus Approve / Deny / Iterate bar.
  wait        Block until one interaction id is answered.
  execution   Start/push/stop the live workflow canvas (locks plan forms while active).
  theme       Read or write the accent color in live-plan.config.json (or via a running server).
  check       Print plan summary, including the expected workflow nodes.
  processes   List plans currently registered by serve and review. \`ps\` is the same command.
  registry    Run the shared registry in the foreground. serve and review start it on their own.

The Workflow tab is filled from a \`workflow\` block, or from phases and gates when that block is omitted.
Accent color is saved in live-plan.config.json beside the plan (override with --config).
--no-open skips launching a browser.
--no-registry skips registering this serve or review process.
--registry-port and --registry-host choose the shared registry (default ${DEFAULT_REGISTRY_HOST}:${DEFAULT_REGISTRY_PORT}).
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
  if (assets?.mermaidHref) return
  console.log('Building execution client (vite)...')
  await new Promise<void>((resolveBuild, reject) => {
    const child = spawn('npx', ['vite', 'build'], {
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

async function putExecution(url: string, body: ExecutionState): Promise<ExecutionState> {
  const response = await fetch(new URL('/api/execution', url), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const payload = (await response.json()) as { execution: ExecutionState }
  return payload.execution
}

async function cmdCheck(file: string): Promise<number> {
  const source = await readFile(resolve(file), 'utf8')
  const plan = parsePlan(source, file)
  const workflow = planToExpectedGraph(plan)
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
      },
      null,
      2,
    ),
  )
  return 0
}

async function cmdDump(file: string): Promise<number> {
  const source = await readFile(resolve(file), 'utf8')
  const plan = parsePlan(source, file)
  console.log(JSON.stringify(plan, null, 2))
  return 0
}

type PlanTracker = {
  registryUrl: string
  stop: () => Promise<void>
}

async function openRegistry(args: string[]): Promise<{ url: string; token: string } | null> {
  if (hasFlag(args, '--no-registry')) return null
  const portFlag = getFlag(args, '--registry-port')
  const port = portFlag ? Number(portFlag) : undefined
  const host = getFlag(args, '--registry-host')
  try {
    return await ensureRegistry({
      entryFile: fileURLToPath(import.meta.url),
      port: port !== undefined && Number.isFinite(port) ? port : undefined,
      host,
    })
  } catch (error) {
    console.error(`Registry unavailable: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function trackPlan(
  server: LivingPlanServer,
  registry: { url: string; token: string },
  selfId: string,
  plan: {
    mode: 'watch' | 'review'
    planPath: string
    host: string
  },
): Promise<PlanTracker | null> {
  const state = server.getState()
  try {
    const session = await watchRegisteredPlan({
      registryUrl: registry.url,
      token: registry.token,
      record: {
        id: selfId,
        pid: process.pid,
        title: state.plan.title,
        summary: state.plan.summary,
        agent: state.plan.agent,
        mode: plan.mode,
        planPath: plan.planPath,
        directory: dirname(plan.planPath),
        cwd: process.cwd(),
        url: server.url,
        host: plan.host,
        port: server.port,
        pendingCount: state.pendingInteractionIds.length,
        executionActive: Boolean(state.execution.active),
        executionStep: state.execution.step ?? null,
      },
      describe: () => {
        const current = server.getState()
        return {
          title: current.plan.title,
          summary: current.plan.summary ?? null,
          agent: current.plan.agent ?? null,
          pendingCount: current.pendingInteractionIds.length,
          executionActive: Boolean(current.execution.active),
          executionStep: current.execution.step ?? null,
        }
      },
    })
    return { registryUrl: registry.url, stop: session.stop }
  } catch (error) {
    console.error(`Registry unavailable: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function cmdServe(file: string, args: string[]): Promise<number> {
  await ensureClientBuild()
  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const planPath = resolve(file)
  const registry = await openRegistry(args)
  const selfId = randomUUID()
  const configPath = getFlag(args, '--config')
  const server = await startLivingPlanServer({
    planPath,
    mode: 'watch',
    port: Number.isFinite(port) ? port : 0,
    host,
    registry: registry ? { url: registry.url, selfId } : undefined,
    configPath,
  })
  const tracker = registry
    ? await trackPlan(server, registry, selfId, { mode: 'watch', planPath, host })
    : null

  console.log(`Living Plan (watch): ${server.url}`)
  console.log(`Plan file: ${planPath}`)
  if (tracker) console.log(`Registry: ${tracker.registryUrl}`)
  console.log(`Theme config: ${server.getState().theme.configPath}`)
  console.log('Tabs: Plan (status/forms), Workflow (expected plan, then live React Flow canvas), and Settings (accent).')
  await openBrowser(server.url)

  await new Promise<void>((resolveWait) => {
    process.on('SIGINT', () => resolveWait())
    process.on('SIGTERM', () => resolveWait())
  })
  await tracker?.stop()
  await server.close()
  return 0
}

async function cmdReview(file: string, args: string[]): Promise<number> {
  await ensureClientBuild()
  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const iteration = Number(getFlag(args, '--iteration') ?? 1)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const planPath = resolve(file)
  const registry = await openRegistry(args)
  const selfId = randomUUID()
  const configPath = getFlag(args, '--config')

  const server = await startLivingPlanServer({
    planPath,
    mode: 'review',
    port: Number.isFinite(port) ? port : 0,
    host,
    iteration: Number.isFinite(iteration) ? iteration : 1,
    registry: registry ? { url: registry.url, selfId } : undefined,
    configPath,
  })
  const tracker = registry
    ? await trackPlan(server, registry, selfId, { mode: 'review', planPath, host })
    : null

  console.log(`Living Plan (review): ${server.url}`)
  console.log(`Plan file: ${planPath}`)
  if (tracker) console.log(`Registry: ${tracker.registryUrl}`)
  console.log(`Theme config: ${server.getState().theme.configPath}`)
  await openBrowser(server.url)

  try {
    const review = await server.waitForReview(timeoutMs)
    const outPath = getFlag(args, '--out')
    const payload = JSON.stringify(review, null, 2)
    if (outPath) {
      const absolute = resolve(outPath)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, `${payload}\n`, 'utf8')
    }
    console.log(payload)
    await tracker?.stop()
    await server.close()
    if (review.decision === 'approve') return 0
    if (review.decision === 'deny') return 1
    return 2
  } catch (error) {
    await tracker?.stop()
    await server.close()
    console.error(error instanceof Error ? error.message : error)
    return 3
  }
}

async function cmdWait(id: string, args: string[]): Promise<number> {
  const url = getFlag(args, '--url')
  if (!url) {
    console.error('live-plan wait requires --url <server-url>')
    return 1
  }
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(new URL('/api/plan', url))
    if (!response.ok) {
      throw new Error(`Failed to read plan state from ${url}`)
    }
    const state = (await response.json()) as {
      responses: Record<string, unknown>
    }
    if (state.responses[id]) {
      console.log(JSON.stringify(state.responses[id], null, 2))
      return 0
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }

  console.error(`Timed out waiting for interaction: ${id}`)
  return 3
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
  const url = getFlag(rest, '--url')
  if (!url) {
    console.error('live-plan execution requires --url <server-url>')
    return 1
  }

  if (action === 'start') {
    const execution = await putExecution(url, await buildExecutionPayload(rest, true))
    console.log(JSON.stringify(execution, null, 2))
    return 0
  }

  if (action === 'push') {
    const currentResponse = await fetch(new URL('/api/execution', url))
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
    const currentResponse = await fetch(new URL('/api/execution', url))
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
  if (!lock || !isPidAlive(lock.pid) || !(await registryHealthy(lock.url))) {
    console.log('No living-plan registry is running.')
    return 0
  }
  const processes = await listProcesses(lock.url)
  const noun = processes.length === 1 ? 'plan' : 'plans'
  console.log(`${processes.length} running ${noun} · ${lock.url}`)
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

async function cmdRegistry(args: string[]): Promise<number> {
  const { startRegistryServer } = await import('./registryService.js')
  const home = process.env.LIVE_PLAN_HOME ?? defaultRegistryHome()
  const portFlag = getFlag(args, '--port')
  const port = portFlag ? Number(portFlag) : DEFAULT_REGISTRY_PORT
  const host = getFlag(args, '--host') ?? DEFAULT_REGISTRY_HOST
  const existing = await readRegistryLock(home)
  if (existing && isPidAlive(existing.pid) && (await registryHealthy(existing.url))) {
    console.log(`Living Plan registry already running: ${existing.url}`)
    return 0
  }
  const server = await startRegistryServer({
    home,
    host,
    port: Number.isFinite(port) ? port : DEFAULT_REGISTRY_PORT,
  })
  console.log(`Living Plan registry: ${server.url}`)
  await new Promise<void>((resolveWait) => {
    const stop = () => resolveWait()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  await server.close()
  return 0
}

function resolveThemeConfigPath(args: string[]): string {
  const explicit = getFlag(args, '--config')
  if (explicit) return resolve(explicit)
  const plan = getFlag(args, '--plan')
  if (plan) return configPathBesidePlan(plan)
  return resolve(DEFAULT_CONFIG_FILENAME)
}

async function cmdTheme(args: string[]): Promise<number> {
  const action = args[0]
  const rest = args.slice(1)
  const url = getFlag(rest, '--url')

  if (action === 'get') {
    if (url) {
      const response = await fetch(new URL('/api/theme', url))
      if (!response.ok) {
        console.error(await response.text())
        return 1
      }
      console.log(JSON.stringify(await response.json(), null, 2))
      return 0
    }
    const configPath = resolveThemeConfigPath(rest)
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
      const response = await fetch(new URL('/api/theme', url), {
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

    const configPath = resolveThemeConfigPath(rest)
    const saved = await saveThemeConfig(configPath, { accent })
    console.log(JSON.stringify(themePayload(saved, configPath), null, 2))
    return 0
  }

  console.error('Usage: live-plan theme <get|set> [--accent #hex] [--url <server-url>] [--config file]')
  return 1
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const command = args[0]

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
      console.error('Usage: live-plan wait <id> --url <server-url>')
      return 1
    }
    return cmdWait(id, args.slice(2))
  }

  if (command === 'execution') {
    return cmdExecution(args.slice(1))
  }

  if (command === 'processes' || command === 'ps') {
    return cmdProcesses()
  }

  if (command === 'registry') {
    return cmdRegistry(args.slice(1))
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
