import { nanoid } from 'nanoid'
import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { clientDistDir, loadClientAssets, type ClientAssets } from './assets.js'
import { html, HttpError, jsonBody } from './http.js'
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
import type {
  InteractionResponse,
  PlanComment,
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
  comments: PlanComment[]
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
  page: () => Response
  planPayload: () => unknown
  themeView: () => ReturnType<typeof themePayload>
  updateTheme: (body: unknown) => Promise<unknown>
  executionPayload: () => ExecutionState
  updateExecution: (body: unknown) => unknown
  startExecution: (body: unknown) => unknown
  stopExecution: () => unknown
  browserEvents: (request: Request) => Response
  agentEvents: (request: Request) => Response
  submitInteraction: (interactionId: string, body: unknown) => unknown
  submitComment: (body: unknown) => unknown
  addressComment: (commentId: string) => unknown
  submitReview: (body: unknown) => unknown
  close: () => Promise<void>
  waitForInteraction: (id: string, timeoutMs?: number) => Promise<InteractionResponse>
  waitForReview: (timeoutMs?: number) => Promise<ReviewResult>
  getState: () => PlanSessionState
}

export async function readClientAsset(pathname: string): Promise<Response | null> {
  const relative = normalize(pathname.replace(/^\/client\//, ''))
  if (relative.startsWith('..') || relative.includes('\0')) throw new HttpError(400, 'Invalid path')
  try {
    const filePath = join(clientDistDir(), relative)
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
  comments?: PlanComment[]
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
  const comments: PlanComment[] = [...(options.comments ?? [])]

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
      comments: comments.map((comment) => ({ ...comment })),
      startedAt,
      lastSeenAt,
    }
  }

  function broadcast(event: string, data: unknown): void {
    for (const client of browserClients) client.write(event, data)
    for (const client of agentClients) client.write(event, data)
  }

  function eventStream(bucket: Set<SseClient>, hello: unknown, signal: AbortSignal): Response {
    const encoder = new TextEncoder()
    let client: SseClient | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        client = {
          write(event, data) {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            } catch {
              closed = true
              if (client) bucket.delete(client)
            }
          },
          close() {
            if (closed) return
            closed = true
            if (client) bucket.delete(client)
            try {
              controller.close()
            } catch {
              // The client already went away.
            }
          },
        }
        bucket.add(client)
        client.write('hello', hello)
        touch()
        persist()
        signal.addEventListener(
          'abort',
          () => {
            client?.close()
            touch()
            persist()
          },
          { once: true },
        )
      },
      cancel() {
        client?.close()
        touch()
        persist()
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    })
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

  function page(): Response {
    touch()
    return html(
      renderPlanPage({
        plan,
        mode,
        responses,
        diffs,
        iteration,
        pendingInteractionIds: pendingInteractionIds(),
        reviewDecision: reviewResult?.decision,
        execution,
        comments,
        clientAssets,
        theme: currentTheme(),
        basePath,
        selfId,
      }),
    )
  }

  function planPayload(): unknown {
    touch()
    return {
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
      comments,
      diffs,
      execution: executionView(),
      planned: planToExpectedGraph(plan) ?? null,
      theme: currentTheme(),
    }
  }

  function themeView(): ReturnType<typeof themePayload> {
    touch()
    return currentTheme()
  }

  async function updateTheme(body: unknown): Promise<unknown> {
    touch()
    const payload = jsonBody(body, true) as { accent?: string }
    const accent = normalizeAccent(payload.accent)
    if (!accent) throw new HttpError(400, 'Invalid accent color. Use a hex value like #0f766e.')
    const view = await applyTheme({ accent }, true)
    return { ok: true, theme: view }
  }

  function executionPayload(): ExecutionState {
    touch()
    return executionView()
  }

  function updateExecution(body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as Partial<ExecutionState>
    const view = setExecution({
      active: Boolean(payload.active),
      step: payload.step ? String(payload.step) : undefined,
      detail: payload.detail ? String(payload.detail) : undefined,
      graph: payload.graph,
      scene:
        payload.scene && typeof payload.scene === 'object' ? (payload.scene as Record<string, unknown>) : undefined,
    })
    return { ok: true, execution: view }
  }

  function startExecution(body: unknown): unknown {
    touch()
    const payload = jsonBody(body, false) as Partial<ExecutionState>
    const view = setExecution({
      active: true,
      step: payload.step ? String(payload.step) : execution.step ?? 'Executing',
      detail: payload.detail ? String(payload.detail) : execution.detail,
      graph: payload.graph ?? execution.graph,
      scene: payload.scene ?? execution.scene,
    })
    return { ok: true, execution: view }
  }

  function stopExecution(): unknown {
    touch()
    const view = setExecution({
      active: false,
      step: execution.step,
      detail: execution.detail,
      graph: execution.graph,
      scene: execution.scene,
    })
    return { ok: true, execution: view }
  }

  function browserEvents(request: Request): Response {
    touch()
    return eventStream(
      browserClients,
      {
        mode,
        pendingInteractionIds: pendingInteractionIds(),
        comments,
        execution: executionView(),
        theme: currentTheme(),
      },
      request.signal,
    )
  }

  function agentEvents(request: Request): Response {
    touch()
    return eventStream(
      agentClients,
      {
        mode,
        pendingInteractionIds: pendingInteractionIds(),
        responses,
        review: reviewResult ?? null,
        comments,
        execution: executionView(),
      },
      request.signal,
    )
  }

  function submitInteraction(interactionId: string, body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as InteractionResponse
    if (!plan.interactionIds.includes(interactionId)) {
      throw new HttpError(404, `Unknown interaction id: ${interactionId}`)
    }
    if (payload.id !== interactionId) throw new HttpError(400, 'Interaction id mismatch')
    try {
      fulfillInteraction(payload)
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Interaction locked')
    }
    return {
      ok: true,
      response: payload,
      pendingInteractionIds: pendingInteractionIds(),
    }
  }

  function submitComment(body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as {
      partId?: unknown
      kind?: unknown
      blockId?: unknown
      excerpt?: unknown
      text?: unknown
    }
    const partId = String(payload.partId ?? '').trim()
    const text = String(payload.text ?? '').trim()
    if (!/^[A-Za-z0-9_.:/-]{1,200}$/.test(partId)) throw new HttpError(400, 'Missing plan part')
    if (!text || text.length > 4000) throw new HttpError(400, 'Missing comment')
    const blockId = String(payload.blockId ?? '').trim().slice(0, 80)
    const kind = String(payload.kind ?? '').trim().slice(0, 40)
    const comment: PlanComment = {
      id: `cmt_${nanoid()}`,
      partId,
      kind: kind || 'part',
      ...(blockId ? { blockId } : {}),
      excerpt: String(payload.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
      text,
      createdAt: Date.now(),
      addressedAt: null,
    }
    comments.push(comment)
    broadcast('comment', comment)
    persist()
    return { ok: true, comment }
  }

  function addressComment(commentId: string): unknown {
    touch()
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment) throw new HttpError(404, 'Unknown comment')
    if (!comment.addressedAt) {
      comment.addressedAt = Date.now()
      broadcast('comment', { ...comment })
      persist()
    }
    return { ok: true, comment }
  }

  function submitReview(body: unknown): unknown {
    touch()
    if (mode !== 'review') throw new HttpError(400, 'Server is not in review mode')
    const payload = jsonBody(body, true) as { decision: ReviewDecision; note?: string }
    if (!['approve', 'deny', 'iterate'].includes(payload.decision)) throw new HttpError(400, 'Invalid decision')
    try {
      fulfillReview(payload.decision, payload.note)
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Review locked')
    }
    return { ok: true, review: reviewResult }
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
    page,
    planPayload,
    themeView,
    updateTheme,
    executionPayload,
    updateExecution,
    startExecution,
    stopExecution,
    browserEvents,
    agentEvents,
    submitInteraction,
    submitComment,
    addressComment,
    submitReview,
    async close() {
      if (closed) return
      closed = true
      watcher.close()
      themeWatcher?.close()
      for (const client of [...browserClients, ...agentClients]) client.close()
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
