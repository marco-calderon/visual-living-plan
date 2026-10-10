import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { clientDistDir, loadClientAssets } from './assets.js'
import { diffSections } from './diff.js'
import { createIdleExecutionState, type ExecutionState } from './execution.js'
import { collectSectionSources, parsePlan } from './parse.js'
import { renderPlanPage } from './render.js'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow.js'
import type {
  InteractionResponse,
  PlanDocument,
  ReviewDecision,
  ReviewResult,
  SectionDiff,
} from './types.js'

type SseClient = {
  write: (event: string, data: unknown) => void
  res: ServerResponse
}

type Waiter = {
  id: string
  resolve: (value: InteractionResponse) => void
  reject: (error: Error) => void
  timer?: NodeJS.Timeout
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

export type LivingPlanServer = {
  port: number
  url: string
  close: () => Promise<void>
  waitForInteraction: (id: string, timeoutMs?: number) => Promise<InteractionResponse>
  waitForReview: (timeoutMs?: number) => Promise<ReviewResult>
  getState: () => {
    plan: PlanDocument
    responses: Record<string, InteractionResponse>
    pendingInteractionIds: string[]
    review?: ReviewResult
    execution: ExecutionState
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body, null, 2))
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(html)
}

async function sendStatic(res: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return false
    const body = await readFile(filePath)
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    res.end(body)
    return true
  } catch {
    return false
  }
}

export async function startLivingPlanServer(options: {
  planPath: string
  mode: 'watch' | 'review'
  port?: number
  iteration?: number
  host?: string
  /** Shared registry this page proxies so the plans panel stays same-origin. */
  registry?: {
    url: string
    selfId: string
  }
}): Promise<LivingPlanServer> {
  const planPath = resolve(options.planPath)
  const mode = options.mode
  const host = options.host ?? '127.0.0.1'
  const iteration = options.iteration ?? 1
  const clientAssets = await loadClientAssets()
  const staticRoot = clientDistDir()

  let source = await readFile(planPath, 'utf8')
  let plan = parsePlan(source, planPath)
  let previousSections = collectSectionSources(plan)
  let diffs: SectionDiff[] = previousSections.map((_, index) => ({
    index,
    status: 'unchanged',
  }))

  const responses: Record<string, InteractionResponse> = {}
  const waiters = new Map<string, Waiter[]>()
  const sseClients = new Set<SseClient>()
  let execution = createIdleExecutionState()
  let reviewResult: ReviewResult | undefined
  let reviewWaiters: Array<{
    resolve: (value: ReviewResult) => void
    reject: (error: Error) => void
    timer?: NodeJS.Timeout
  }> = []

  function pendingInteractionIds(): string[] {
    return plan.interactionIds.filter((id) => !responses[id])
  }

  function broadcast(event: string, data: unknown): void {
    for (const client of sseClients) {
      client.write(event, data)
    }
  }

  function executionView(): ExecutionState {
    return withPlannedWorkflow(execution, plan)
  }

  function setExecution(next: ExecutionState): ExecutionState {
    execution = {
      active: Boolean(next.active),
      step: next.step,
      detail: next.detail,
      graph: next.graph,
      scene: next.scene,
      updatedAt: Date.now(),
    }
    const view = executionView()
    broadcast('execution', view)
    return view
  }

  async function reloadFromDisk(): Promise<void> {
    const nextSource = await readFile(planPath, 'utf8')
    if (nextSource === source) return
    const nextPlan = parsePlan(nextSource, planPath)
    const nextSections = collectSectionSources(nextPlan)
    diffs = diffSections(previousSections, nextSections)
    previousSections = nextSections
    source = nextSource
    plan = nextPlan
    broadcast('reload', { at: Date.now(), changed: diffs.filter((d) => d.status !== 'unchanged').length })
    broadcast('execution', executionView())
  }

  function fulfillInteraction(response: InteractionResponse): void {
    if (execution.active) {
      throw new Error('Plan interactions are locked while execution is live')
    }
    responses[response.id] = response
    const queue = waiters.get(response.id) ?? []
    waiters.delete(response.id)
    for (const waiter of queue) {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.resolve(response)
    }
    broadcast('interaction', response)
  }

  function fulfillReview(decision: ReviewDecision, note?: string): void {
    if (execution.active) {
      throw new Error('Review is locked while execution is live')
    }
    if (reviewResult) return
    reviewResult = {
      decision,
      note,
      comments: [],
      responses: Object.values(responses),
      iteration,
    }
    for (const waiter of reviewWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.resolve(reviewResult)
    }
    reviewWaiters = []
    broadcast('review', reviewResult)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`)

    try {
      if (req.method === 'GET' && url.pathname.startsWith('/client/')) {
        const relative = normalize(url.pathname.replace('/client/', ''))
        if (relative.startsWith('..')) {
          sendJson(res, 400, { error: 'Invalid path' })
          return
        }
        const ok = await sendStatic(res, join(staticRoot, relative))
        if (!ok) sendJson(res, 404, { error: 'Asset not found' })
        return
      }

      if (req.method === 'GET' && url.pathname === '/') {
        sendHtml(
          res,
          renderPlanPage({
            plan,
            mode,
            responses,
            diffs,
            iteration,
            pendingInteractionIds: pendingInteractionIds(),
            reviewDecision: reviewResult?.decision,
            execution,
            clientAssets,
          }),
        )
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/plan') {
        sendJson(res, 200, {
          plan: {
            title: plan.title,
            summary: plan.summary,
            agent: plan.agent,
            interactionIds: plan.interactionIds,
            sourcePath: plan.sourcePath,
          },
          mode,
          iteration,
          responses,
          pendingInteractionIds: pendingInteractionIds(),
          review: reviewResult ?? null,
          diffs,
          execution: executionView(),
          planned: planToExpectedGraph(plan) ?? null,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/execution') {
        sendJson(res, 200, executionView())
        return
      }

      if (req.method === 'PUT' && url.pathname === '/api/execution') {
        const raw = await readBody(req)
        const payload = JSON.parse(raw) as Partial<ExecutionState>
        const view = setExecution({
          active: Boolean(payload.active),
          step: payload.step ? String(payload.step) : undefined,
          detail: payload.detail ? String(payload.detail) : undefined,
          graph: payload.graph,
          scene:
            payload.scene && typeof payload.scene === 'object'
              ? (payload.scene as Record<string, unknown>)
              : undefined,
        })
        sendJson(res, 200, { ok: true, execution: view })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/execution/start') {
        const raw = await readBody(req)
        const payload = raw ? (JSON.parse(raw) as Partial<ExecutionState>) : {}
        const view = setExecution({
          active: true,
          step: payload.step ? String(payload.step) : execution.step ?? 'Executing',
          detail: payload.detail ? String(payload.detail) : execution.detail,
          graph: payload.graph ?? execution.graph,
          scene: payload.scene ?? execution.scene,
        })
        sendJson(res, 200, { ok: true, execution: view })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/execution/stop') {
        const view = setExecution({
          active: false,
          step: execution.step,
          detail: execution.detail,
          graph: execution.graph,
          scene: execution.scene,
        })
        sendJson(res, 200, { ok: true, execution: view })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        })
        const client: SseClient = {
          res,
          write(event, data) {
            res.write(`event: ${event}\n`)
            res.write(`data: ${JSON.stringify(data)}\n\n`)
          },
        }
        sseClients.add(client)
        client.write('hello', {
          mode,
          pendingInteractionIds: pendingInteractionIds(),
          execution: executionView(),
        })
        req.on('close', () => {
          sseClients.delete(client)
        })
        return
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/interactions/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/interactions/', ''))
        const raw = await readBody(req)
        const payload = JSON.parse(raw) as InteractionResponse
        if (!plan.interactionIds.includes(id)) {
          sendJson(res, 404, { error: `Unknown interaction id: ${id}` })
          return
        }
        if (payload.id !== id) {
          sendJson(res, 400, { error: 'Interaction id mismatch' })
          return
        }
        try {
          fulfillInteraction(payload)
        } catch (error) {
          sendJson(res, 409, {
            error: error instanceof Error ? error.message : 'Interaction locked',
          })
          return
        }
        sendJson(res, 200, { ok: true, response: payload, pendingInteractionIds: pendingInteractionIds() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/processes') {
        await sendProcessList(res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/review') {
        if (mode !== 'review') {
          sendJson(res, 400, { error: 'Server is not in review mode' })
          return
        }
        const raw = await readBody(req)
        const payload = JSON.parse(raw) as { decision: ReviewDecision; note?: string }
        if (!['approve', 'deny', 'iterate'].includes(payload.decision)) {
          sendJson(res, 400, { error: 'Invalid decision' })
          return
        }
        try {
          fulfillReview(payload.decision, payload.note)
        } catch (error) {
          sendJson(res, 409, {
            error: error instanceof Error ? error.message : 'Review locked',
          })
          return
        }
        sendJson(res, 200, { ok: true, review: reviewResult })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  async function sendProcessList(res: ServerResponse): Promise<void> {
    if (!options.registry) {
      sendJson(res, 200, {
        status: 'disabled',
        selfId: null,
        registryUrl: null,
        processes: [],
      })
      return
    }
    try {
      const response = await fetch(new URL('/api/processes', options.registry.url), {
        signal: AbortSignal.timeout(1_500),
      })
      if (!response.ok) {
        sendJson(res, 200, {
          status: 'offline',
          selfId: options.registry.selfId,
          registryUrl: options.registry.url,
          processes: [],
        })
        return
      }
      const payload = (await response.json()) as { processes?: unknown }
      sendJson(res, 200, {
        status: 'ok',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: Array.isArray(payload.processes) ? payload.processes : [],
      })
    } catch {
      sendJson(res, 200, {
        status: 'offline',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: [],
      })
    }
  }

  const watcher = watch(planPath, { persistent: true }, () => {
    void reloadFromDisk().catch((error) => {
      broadcast('error', {
        message: error instanceof Error ? error.message : 'Failed to reload plan',
      })
    })
  })

  const port = await new Promise<number>((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to bind living-plan server'))
        return
      }
      resolvePort(address.port)
    })
  })

  const url = `http://${host}:${port}`

  return {
    port,
    url,
    async close() {
      watcher.close()
      for (const client of sseClients) {
        client.res.end()
      }
      sseClients.clear()
      server.closeAllConnections()
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()))
      })
    },
    waitForInteraction(id, timeoutMs = 4 * 60 * 60 * 1000) {
      if (responses[id]) {
        return Promise.resolve(responses[id])
      }
      return new Promise<InteractionResponse>((resolveWait, reject) => {
        const waiter: Waiter = {
          id,
          resolve: resolveWait,
          reject,
        }
        waiter.timer = setTimeout(() => {
          const queue = waiters.get(id) ?? []
          waiters.set(
            id,
            queue.filter((entry) => entry !== waiter),
          )
          reject(new Error(`Timed out waiting for interaction: ${id}`))
        }, timeoutMs)
        const queue = waiters.get(id) ?? []
        queue.push(waiter)
        waiters.set(id, queue)
      })
    },
    waitForReview(timeoutMs = 4 * 60 * 60 * 1000) {
      if (reviewResult) {
        return Promise.resolve(reviewResult)
      }
      return new Promise<ReviewResult>((resolveWait, reject) => {
        const waiter = {
          resolve: resolveWait,
          reject,
          timer: setTimeout(() => {
            reviewWaiters = reviewWaiters.filter((entry) => entry.resolve !== resolveWait)
            reject(new Error('Timed out waiting for review decision'))
          }, timeoutMs),
        }
        reviewWaiters.push(waiter)
      })
    },
    getState() {
      return {
        plan,
        responses: { ...responses },
        pendingInteractionIds: pendingInteractionIds(),
        review: reviewResult,
        execution: executionView(),
      }
    },
  }
}
