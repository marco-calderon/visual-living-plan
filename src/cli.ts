#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClientAssets } from './assets.js'
import { parsePlan } from './parse.js'
import { startLivingPlanServer } from './server.js'
import type { ExecutionGraph, ExecutionState } from './execution.js'
import { planToExpectedGraph } from './workflow.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function printHelp(): void {
  console.log(`live-plan — agent-authored plans humans can interact with

Usage:
  live-plan serve <file.plan.md> [--port N] [--host HOST] [--no-open]
  live-plan review <file.plan.md> [--port N] [--iteration N] [--timeout 30m] [--no-open]
  live-plan wait <id> --url <server-url> [--timeout 30m]
  live-plan execution start --url <server-url> [--step TEXT] [--detail TEXT] [--graph file.json]
  live-plan execution push --url <server-url> [--step TEXT] [--detail TEXT] [--graph file.json] [--scene file.json]
  live-plan execution stop --url <server-url>
  live-plan check <file.plan.md>
  live-plan dump <file.plan.md>

Invoke with \`npx --yes visual-living-plan <command>\` when the \`live-plan\` command is not installed. \`living-plan\` is the same binary.

Modes:
  serve       Live watch URL. The Workflow tab draws the plan diagram, then the live run.
  review      Same UI plus Approve / Deny / Iterate bar.
  wait        Block until one interaction id is answered.
  execution   Start/push/stop the live workflow canvas (locks plan forms while active).
  check       Print plan summary, including the expected workflow nodes.

The Workflow tab is filled from a \`workflow\` block, or from phases and gates when that block is omitted.
--no-open skips launching a browser.
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
  if (assets) return
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

async function cmdServe(file: string, args: string[]): Promise<number> {
  await ensureClientBuild()
  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const server = await startLivingPlanServer({
    planPath: file,
    mode: 'watch',
    port: Number.isFinite(port) ? port : 0,
    host,
  })

  console.log(`Living Plan (watch): ${server.url}`)
  console.log(`Plan file: ${resolve(file)}`)
  console.log('Tabs: Plan (status/forms) and Workflow (expected plan, then live React Flow canvas).')
  await openBrowser(server.url)

  await new Promise<void>((resolveWait) => {
    process.on('SIGINT', () => resolveWait())
    process.on('SIGTERM', () => resolveWait())
  })
  await server.close()
  return 0
}

async function cmdReview(file: string, args: string[]): Promise<number> {
  await ensureClientBuild()
  const port = Number(getFlag(args, '--port') ?? 0)
  const host = getFlag(args, '--host') ?? '127.0.0.1'
  const iteration = Number(getFlag(args, '--iteration') ?? 1)
  const timeoutMs = parseTimeout(getFlag(args, '--timeout'), 4 * 60 * 60 * 1000)

  const server = await startLivingPlanServer({
    planPath: file,
    mode: 'review',
    port: Number.isFinite(port) ? port : 0,
    host,
    iteration: Number.isFinite(iteration) ? iteration : 1,
  })

  console.log(`Living Plan (review): ${server.url}`)
  console.log(`Plan file: ${resolve(file)}`)
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
    await server.close()
    if (review.decision === 'approve') return 0
    if (review.decision === 'deny') return 1
    return 2
  } catch (error) {
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
