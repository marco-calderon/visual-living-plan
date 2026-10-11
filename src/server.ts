import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { Elysia } from 'elysia'
import { clientDistDir, loadClientAssets } from './assets.js'
import { diffSections } from './diff.js'
import { createIdleExecutionState, type ExecutionState } from './execution.js'
import { bindElysia } from './httpServer.js'
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
import type {
  InteractionResponse,
  PlanDocument,
  ReviewDecision,
  ReviewResult,
  SectionDiff,
} from './types.js'

type SseClient = {
  write: (event: string, data: unknown) => void
  close: () => void
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
  '.txt': 'text/plain; charset=utf-8',
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
    theme: ReturnType<typeof themePayload>
  }
}

async function readJson(request: Request, required: boolean): Promise<unknown> {
  const raw = await request.text()
  if (!raw.trim()) {
    if (required) return JSON.parse(raw)
    return {}
  }
  return JSON.parse(raw)
}

async function sendStatic(filePath: string): Promise<Response | null> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return null
    const body = await readFile(filePath)
    return new Response(body, {
      headers: {
        'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      },
    })
  } catch {
    return null
  }
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
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
  configPath?: string
}): Promise<LivingPlanServer> {
  const planPath = resolve(options.planPath)
  const mode = options.mode
  const host = options.host ?? '127.0.0.1'
  const iteration = options.iteration ?? 1
  const themeConfigPath = resolve(options.configPath ?? configPathBesidePlan(planPath))
  const clientAssets = await loadClientAssets()
  const staticRoot = clientDistDir()

  let source = await readFile(planPath, 'utf8')
  let plan = parsePlan(source, planPath)
  let previousSections = collectSectionSources(plan)
  let diffs: SectionDiff[] = previousSections.map((_, index) => ({
    index,
    status: 'unchanged',
  }))
  let theme = await loadThemeConfig(themeConfigPath)

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

  function currentTheme() {
    return themePayload(theme, themeConfigPath)
  }

  async function applyTheme(next: ThemeConfig, persist: boolean): Promise<ReturnType<typeof themePayload>> {
    theme = next
    if (persist) {
      theme = await saveThemeConfig(themeConfigPath, next)
    }
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

  async function sendProcessList(): Promise<{
    status: 'ok' | 'offline' | 'disabled'
    selfId: string | null
    registryUrl: string | null
    processes: unknown[]
  }> {
    if (!options.registry) {
      return { status: 'disabled', selfId: null, registryUrl: null, processes: [] }
    }
    try {
      const response = await fetch(new URL('/api/processes', options.registry.url), {
        signal: AbortSignal.timeout(1_500),
      })
      if (!response.ok) {
        return {
          status: 'offline',
          selfId: options.registry.selfId,
          registryUrl: options.registry.url,
          processes: [],
        }
      }
      const payload = (await response.json()) as { processes?: unknown }
      return {
        status: 'ok',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: Array.isArray(payload.processes) ? payload.processes : [],
      }
    } catch {
      return {
        status: 'offline',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: [],
      }
    }
  }

  const app = new Elysia()
    .onBeforeHandle(({ set }) => {
      set.headers['cache-control'] = 'no-store'
    })
    .onError(({ code, error, set }) => {
      if (code === 'NOT_FOUND') {
        set.status = 404
        return { error: 'Not found' }
      }
      set.status = 500
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    })
    .get('/client/*', async ({ params, set }) => {
      const relative = normalize(String(params['*'] ?? ''))
      if (relative.startsWith('..') || relative.startsWith('/') || relative.startsWith('\\')) {
        set.status = 400
        return { error: 'Invalid path' }
      }
      const response = await sendStatic(join(staticRoot, relative))
      if (!response) {
        set.status = 404
        return { error: 'Asset not found' }
      }
      return response
    })
    .get('/', () =>
      html(
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
        }),
      ),
    )
    .get('/api/plan', () => ({
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
    }))
    .get('/api/theme', () => currentTheme())
    .put('/api/theme', async ({ request, set }) => {
      const payload = (await readJson(request, true)) as { accent?: string }
      const accent = normalizeAccent(payload.accent)
      if (!accent) {
        set.status = 400
        return { error: 'Invalid accent color. Use a hex value like #0f766e.' }
      }
      const view = await applyTheme({ accent }, true)
      return { ok: true, theme: view }
    })
    .get('/api/execution', () => executionView())
    .put('/api/execution', async ({ request }) => {
      const payload = (await readJson(request, true)) as Partial<ExecutionState>
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
      return { ok: true, execution: view }
    })
    .post('/api/execution/start', async ({ request }) => {
      const payload = (await readJson(request, false)) as Partial<ExecutionState>
      const view = setExecution({
        active: true,
        step: payload.step ? String(payload.step) : execution.step ?? 'Executing',
        detail: payload.detail ? String(payload.detail) : execution.detail,
        graph: payload.graph ?? execution.graph,
        scene: payload.scene ?? execution.scene,
      })
      return { ok: true, execution: view }
    })
    .post('/api/execution/stop', () => {
      const view = setExecution({
        active: false,
        step: execution.step,
        detail: execution.detail,
        graph: execution.graph,
        scene: execution.scene,
      })
      return { ok: true, execution: view }
    })
    .get('/api/events', ({ request }) => {
      const encoder = new TextEncoder()
      let client: SseClient | undefined
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          client = {
            write(event, data) {
              if (closed) return
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            },
            close() {
              if (closed) return
              closed = true
              if (client) sseClients.delete(client)
              try {
                controller.close()
              } catch {
                // The client already went away.
              }
            },
          }
          sseClients.add(client)
          client.write('hello', {
            mode,
            pendingInteractionIds: pendingInteractionIds(),
            execution: executionView(),
            theme: currentTheme(),
          })
          request.signal.addEventListener('abort', () => client?.close())
        },
        cancel() {
          client?.close()
        },
      })
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        },
      })
    })
    .post('/api/interactions/:id', async ({ params, request, set }) => {
      const id = decodeURIComponent(params.id)
      const payload = (await readJson(request, true)) as InteractionResponse
      if (!plan.interactionIds.includes(id)) {
        set.status = 404
        return { error: `Unknown interaction id: ${id}` }
      }
      if (payload.id !== id) {
        set.status = 400
        return { error: 'Interaction id mismatch' }
      }
      try {
        fulfillInteraction(payload)
      } catch (error) {
        set.status = 409
        return { error: error instanceof Error ? error.message : 'Interaction locked' }
      }
      return { ok: true, response: payload, pendingInteractionIds: pendingInteractionIds() }
    })
    .get('/api/processes', () => sendProcessList())
    .post('/api/review', async ({ request, set }) => {
      if (mode !== 'review') {
        set.status = 400
        return { error: 'Server is not in review mode' }
      }
      const payload = (await readJson(request, true)) as { decision: ReviewDecision; note?: string }
      if (!['approve', 'deny', 'iterate'].includes(payload.decision)) {
        set.status = 400
        return { error: 'Invalid decision' }
      }
      try {
        fulfillReview(payload.decision, payload.note)
      } catch (error) {
        set.status = 409
        return { error: error instanceof Error ? error.message : 'Review locked' }
      }
      return { ok: true, review: reviewResult }
    })

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

  const bound = bindElysia(app, host, options.port ?? 0)
  const url = `http://${host}:${bound.port}`

  return {
    port: bound.port,
    url,
    async close() {
      watcher.close()
      themeWatcher?.close()
      for (const client of sseClients) client.close()
      sseClients.clear()
      await bound.stop()
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
        theme: currentTheme(),
      }
    },
  }
}
