import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { clientDistDir, loadClientAssets, type ClientAssets } from './assets.js'
import { diffSections } from './diff.js'
import { createIdleExecutionState, type ExecutionState } from './execution.js'
import { collectSectionSources, parsePlan } from './parse.js'
import { renderPlanPage } from './render.js'
import {
  configPathBesidePlan,
  loadThemeConfig,
  normalizeAccent,
  saveThemeConfig,
  themePayload,
  type ThemeConfig,
} from './theme.js'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow.js'
import type { InteractionResponse, PlanDocument, ReviewDecision, ReviewResult, SectionDiff } from './types.js'

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

type ReviewWaiter = {
  resolve: (value: ReviewResult) => void
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

export type PlanSessionSnapshot = {
  id: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
  iteration: number
  cwd: string
  configPath: string | null
  responses: Record<string, InteractionResponse>
  execution: ExecutionState
  review: ReviewResult | null
  startedAt: number
  lastSeenAt: number
}

export type PlanSessionState = {
  plan: PlanDocument
  responses: Record<string, InteractionResponse>
  pendingInteractionIds: string[]
  review?: ReviewResult
  execution: ExecutionState
  theme: ReturnType<typeof themePayload>
}

export type PlanSession = {
  id: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
  startedAt: number
  lastSeenAt: number
  browserClients: number
  agentClients: number
  touch: () => void
  snapshot: () => PlanSessionSnapshot
  setMode: (mode: 'watch' | 'review', iteration?: number) => void
  handle: (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<void>
  serveAgentEvents: (req: IncomingMessage, res: ServerResponse) => void
  serveClientAsset: (res: ServerResponse, pathname: string) => Promise<boolean>
  close: () => Promise<void>
  waitForInteraction: (id: string, timeoutMs?: number) => Promise<InteractionResponse>
  waitForReview: (timeoutMs?: number) => Promise<ReviewResult>
  getState: () => PlanSessionState
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function sendClientAsset(res: ServerResponse, pathname: string): Promise<boolean> {
  const relative = normalize(pathname.replace(/^\/client\//, ''))
  if (relative.startsWith('..') || relative.includes('\0')) {
    sendJson(res, 400, { error: 'Invalid path' })
    return true
  }
  return sendStatic(res, join(clientDistDir(), relative))
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

export async function openPlanSession(options: {
  id: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
  iteration?: number
  cwd?: string
  configPath?: string
  /** Prefix for browser API calls. Empty when this session owns the origin. */
  basePath?: string
  selfId?: string
  startedAt?: number
  lastSeenAt?: number
  responses?: Record<string, InteractionResponse>
  execution?: ExecutionState
  review?: ReviewResult | null
  onChange?: (snapshot: PlanSessionSnapshot) => void
}): Promise<PlanSession> {
  const id = options.id
  const token = options.token
  const planPath = resolve(options.planPath)
  let mode = options.mode
  let iteration = options.iteration ?? 1
  const cwd = options.cwd ?? dirname(planPath)
  const basePath = options.basePath ?? ''
  const selfId = options.selfId ?? id
  const startedAt = options.startedAt ?? Date.now()
  const themeConfigPath = resolve(options.configPath ?? configPathBesidePlan(planPath))
  const clientAssets: ClientAssets | null = await loadClientAssets()

  let source = await readFile(planPath, 'utf8')
  let plan = parsePlan(source, planPath)
  let previousSections = collectSectionSources(plan)
  let diffs: SectionDiff[] = previousSections.map((_, index) => ({
    index,
    status: 'unchanged',
  }))
  let theme = await loadThemeConfig(themeConfigPath)
  let lastSeenAt = options.lastSeenAt ?? startedAt
  let closed = false

  const responses: Record<string, InteractionResponse> = { ...(options.responses ?? {}) }
  const waiters = new Map<string, Waiter[]>()
  const browserClients = new Set<SseClient>()
  const agentClients = new Set<SseClient>()
  let execution = options.execution ? { ...options.execution } : createIdleExecutionState()
  let reviewResult: ReviewResult | undefined = options.review ?? undefined
  let reviewWaiters: ReviewWaiter[] = []

  function persist(): void {
    if (closed) return
    options.onChange?.(snapshot())
  }

  function touch(): void {
    lastSeenAt = Date.now()
  }

  function currentTheme() {
    return themePayload(theme, themeConfigPath)
  }

  function pendingInteractionIds(): string[] {
    return plan.interactionIds.filter((interactionId) => !responses[interactionId])
  }

  function executionView(): ExecutionState {
    return withPlannedWorkflow(execution, plan)
  }

  function snapshot(): PlanSessionSnapshot {
    return {
      id,
      token,
      planPath,
      mode,
      iteration,
      cwd,
      configPath: themeConfigPath,
      responses: { ...responses },
      execution: { ...execution },
      review: reviewResult ?? null,
      startedAt,
      lastSeenAt,
    }
  }

  function broadcast(event: string, data: unknown): void {
    for (const client of browserClients) client.write(event, data)
    for (const client of agentClients) client.write(event, data)
  }

  function writeSse(res: ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  async function applyTheme(next: ThemeConfig, save: boolean): Promise<ReturnType<typeof themePayload>> {
    theme = next
    if (save) theme = await saveThemeConfig(themeConfigPath, next)
    const payload = currentTheme()
    broadcast('theme', payload)
    return payload
  }

  async function reloadThemeFromDisk(): Promise<void> {
    const next = await loadThemeConfig(themeConfigPath)
    if (next.accent === theme.accent) return
    theme = next
    broadcast('theme', currentTheme())
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
    persist()
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
    broadcast('reload', { at: Date.now(), changed: diffs.filter((diff) => diff.status !== 'unchanged').length })
    broadcast('execution', executionView())
    persist()
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
    persist()
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
    persist()
  }

  function addSseClient(res: ServerResponse, bucket: Set<SseClient>, hello: unknown): SseClient {
    const client: SseClient = {
      res,
      write(event, data) {
        writeSse(res, event, data)
      },
    }
    bucket.add(client)
    writeSse(res, 'hello', hello)
    touch()
    persist()
    return client
  }

  function serveAgentEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    const client = addSseClient(res, agentClients, {
      mode,
      pendingInteractionIds: pendingInteractionIds(),
      responses,
      review: reviewResult ?? null,
      execution: executionView(),
    })
    req.on('close', () => {
      agentClients.delete(client)
      touch()
      persist()
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    touch()
    try {
      if (req.method === 'GET' && pathname.startsWith('/client/')) {
        const served = await serveClientAsset(res, pathname)
        if (!served) sendJson(res, 404, { error: 'Asset not found' })
        return
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '')) {
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
            theme: currentTheme(),
            basePath,
            selfId,
          }),
        )
        return
      }

      if (req.method === 'GET' && pathname === '/api/plan') {
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
          theme: currentTheme(),
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/theme') {
        sendJson(res, 200, currentTheme())
        return
      }

      if (req.method === 'PUT' && pathname === '/api/theme') {
        const raw = await readBody(req)
        const payload = JSON.parse(raw) as { accent?: string }
        const accent = normalizeAccent(payload.accent)
        if (!accent) {
          sendJson(res, 400, { error: 'Invalid accent color. Use a hex value like #0f766e.' })
          return
        }
        const view = await applyTheme({ accent }, true)
        sendJson(res, 200, { ok: true, theme: view })
        return
      }

      if (req.method === 'GET' && pathname === '/api/execution') {
        sendJson(res, 200, executionView())
        return
      }

      if (req.method === 'PUT' && pathname === '/api/execution') {
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

      if (req.method === 'POST' && pathname === '/api/execution/start') {
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

      if (req.method === 'POST' && pathname === '/api/execution/stop') {
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

      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        })
        const client = addSseClient(res, browserClients, {
          mode,
          pendingInteractionIds: pendingInteractionIds(),
          execution: executionView(),
          theme: currentTheme(),
        })
        req.on('close', () => {
          browserClients.delete(client)
          touch()
          persist()
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/agent-events') {
        serveAgentEvents(req, res)
        return
      }

      if (req.method === 'POST' && pathname.startsWith('/api/interactions/')) {
        const interactionId = decodeURIComponent(pathname.replace('/api/interactions/', ''))
        const raw = await readBody(req)
        const payload = JSON.parse(raw) as InteractionResponse
        if (!plan.interactionIds.includes(interactionId)) {
          sendJson(res, 404, { error: `Unknown interaction id: ${interactionId}` })
          return
        }
        if (payload.id !== interactionId) {
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
        sendJson(res, 200, {
          ok: true,
          response: payload,
          pendingInteractionIds: pendingInteractionIds(),
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/review') {
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
      if (res.headersSent) return
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  async function serveClientAsset(res: ServerResponse, pathname: string): Promise<boolean> {
    return sendClientAsset(res, pathname)
  }

  const watcher = watch(planPath, { persistent: true }, () => {
    void reloadFromDisk().catch((error) => {
      broadcast('error', {
        message: error instanceof Error ? error.message : 'Failed to reload plan',
      })
    })
  })

  const themeConfigBase = basename(themeConfigPath)
  let themeWatcher: ReturnType<typeof watch> | undefined
  try {
    themeWatcher = watch(dirname(themeConfigPath), { persistent: true }, (_event, filename) => {
      if (filename && filename !== themeConfigBase) return
      void reloadThemeFromDisk().catch((error) => {
        broadcast('error', {
          message: error instanceof Error ? error.message : 'Failed to reload theme config',
        })
      })
    })
  } catch {
    // Parent directory may be missing in odd setups; theme still works via API writes.
  }

  return {
    id,
    token,
    planPath,
    get mode() {
      return mode
    },
    startedAt,
    get lastSeenAt() {
      return lastSeenAt
    },
    get browserClients() {
      return browserClients.size
    },
    get agentClients() {
      return agentClients.size
    },
    touch,
    snapshot,
    setMode(nextMode, nextIteration) {
      mode = nextMode
      if (nextIteration !== undefined && Number.isFinite(nextIteration)) iteration = nextIteration
      persist()
    },
    handle,
    serveAgentEvents,
    serveClientAsset,
    async close() {
      if (closed) return
      closed = true
      watcher.close()
      themeWatcher?.close()
      for (const client of browserClients) client.res.end()
      for (const client of agentClients) client.res.end()
      browserClients.clear()
      agentClients.clear()
      for (const queue of waiters.values()) {
        for (const waiter of queue) {
          if (waiter.timer) clearTimeout(waiter.timer)
          waiter.reject(new Error('Plan session closed'))
        }
      }
      waiters.clear()
      for (const waiter of reviewWaiters) {
        if (waiter.timer) clearTimeout(waiter.timer)
        waiter.reject(new Error('Plan session closed'))
      }
      reviewWaiters = []
    },
    waitForInteraction(interactionId, timeoutMs = 4 * 60 * 60 * 1000) {
      if (responses[interactionId]) return Promise.resolve(responses[interactionId])
      return new Promise<InteractionResponse>((resolveWait, reject) => {
        const waiter: Waiter = { id: interactionId, resolve: resolveWait, reject }
        waiter.timer = setTimeout(() => {
          const queue = waiters.get(interactionId) ?? []
          waiters.set(
            interactionId,
            queue.filter((entry) => entry !== waiter),
          )
          reject(new Error(`Timed out waiting for interaction: ${interactionId}`))
        }, timeoutMs)
        const queue = waiters.get(interactionId) ?? []
        queue.push(waiter)
        waiters.set(interactionId, queue)
      })
    },
    waitForReview(timeoutMs = 4 * 60 * 60 * 1000) {
      if (reviewResult) return Promise.resolve(reviewResult)
      return new Promise<ReviewResult>((resolveWait, reject) => {
        const waiter: ReviewWaiter = {
          resolve: resolveWait,
          reject,
          timer: setTimeout(() => {
            reviewWaiters = reviewWaiters.filter((entry) => entry !== waiter)
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
        theme: currentTheme(),
      }
    },
  }
}
