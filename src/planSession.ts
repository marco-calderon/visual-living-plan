import { nanoid } from 'nanoid'
import { watch } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientDistDir, loadClientAssets, type ClientAssets } from './assets'
import { html, HttpError, jsonBody } from './http'
import { diffSections } from './diff'
import { createIdleExecutionState, type ExecutionState } from './execution'
import { collectSectionSources, parsePlan } from './parse'
import { recordLog } from './serviceLog'
import { loadLatestChangelog } from './changelog'
import { defaultRegistryHome } from './configHome'
import { openPlanSnapshots, type PlanSnapshotStore } from './planSnapshots'
import { registryDatabasePath } from './registryLock'
import { renderPlanPage } from './render'
import {
  configPathBesidePlan,
  isKnownDiffsTheme,
  isPageWidth,
  loadThemeConfig,
  normalizeAccent,
  normalizeDiffsTheme,
  saveThemeConfig,
  themePayload,
  type PageWidth,
  type ThemeConfig,
} from './theme'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow'
import type { PlanMode } from './processRecord'
import type {
  CommentReply,
  InteractionResponse,
  PlanComment,
  PlanDocument,
  PlanSubmissionEvent,
  ReviewDecision,
  ReviewResult,
  SectionDiff,
} from './types'

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
  mode: PlanMode
  iteration: number
  cwd: string
  configPath: string | null
  responses: Record<string, InteractionResponse>
  execution: ExecutionState
  review: ReviewResult | null
  comments: PlanComment[]
  events: PlanSubmissionEvent[]
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
  mode: PlanMode
  startedAt: number
  lastSeenAt: number
  browserClients: number
  agentClients: number
  touch: () => void
  snapshot: () => PlanSessionSnapshot
  setMode: (mode: PlanMode, iteration?: number) => void
  updateMode: (body: unknown) => unknown
  page: () => Response
  planMdxPayload: () => {
    source: string
    title: string
    responses: Record<string, InteractionResponse>
    locked: boolean
    snapshots: ReturnType<PlanSnapshotStore['list']>
    headSnapshotId: string | null
  }
  restoreMdxSnapshot: (snapshotId: string) => Promise<{
    source: string
    title: string
    responses: Record<string, InteractionResponse>
    locked: boolean
    snapshots: ReturnType<PlanSnapshotStore['list']>
    headSnapshotId: string | null
  }>
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
  addressComment: (commentId: string, body?: unknown) => unknown
  replyToComment: (commentId: string, body: unknown) => unknown
  markAddressing: (commentId: string) => unknown
  submitReview: (body: unknown) => unknown
  acknowledgeEvents: (body: unknown) => { ok: true; delivered: string[] }
  close: () => Promise<void>
  waitForInteraction: (id: string, timeoutMs?: number) => Promise<InteractionResponse>
  waitForReview: (timeoutMs?: number) => Promise<ReviewResult>
  getState: () => PlanSessionState
}

export async function readClientAsset(pathname: string): Promise<Response | null> {
  // Accept /client/assets/..., assets/..., or a bare path under dist/client.
  const stripped = pathname.replace(/^\/client\//, '').replace(/^\//, '')
  const relative = normalize(stripped)
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
  mode: PlanMode
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
  events?: PlanSubmissionEvent[]
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
  let plan = parsePlan(source, planPath, id)
  let previousSections = collectSectionSources(plan)
  let diffs: SectionDiff[] = previousSections.map((_, index) => ({
    index,
    status: 'unchanged',
  }))
  let theme = await loadThemeConfig(themeConfigPath)
  let lastSeenAt = options.lastSeenAt ?? startedAt
  let closed = false
  let mdxStore: PlanSnapshotStore | null = null
  try {
    const opened = openPlanSnapshots(registryDatabasePath(defaultRegistryHome()), id)
    try {
      opened.sync(plan.title, source)
      mdxStore = opened
    } catch (error) {
      opened.close()
      throw error
    }
  } catch (error) {
    void recordLog({
      level: 'warn',
      message: 'Plan snapshots did not open',
      detail: error instanceof Error ? error.message : undefined,
      source: 'plan',
      planId: id,
    }).catch(() => undefined)
  }

  function mdxPayload() {
    return {
      source,
      title: plan.title,
      responses,
      locked: Boolean(execution.active),
      snapshots: mdxStore?.list() ?? [],
      headSnapshotId: mdxStore?.head()?.headSnapshotId ?? null,
    }
  }

  const responses: Record<string, InteractionResponse> = { ...(options.responses ?? {}) }
  const waiters = new Map<string, Waiter[]>()
  const browserClients = new Set<SseClient>()
  const agentClients = new Set<SseClient>()
  let execution = options.execution ? { ...options.execution } : createIdleExecutionState()
  let reviewResult: ReviewResult | undefined = options.review ?? undefined
  let reviewWaiters: ReviewWaiter[] = []
  const comments: PlanComment[] = [...(options.comments ?? [])]
  const eventLog: PlanSubmissionEvent[] = (options.events ?? []).map((event) => ({
    ...event,
    data: structuredClone(event.data),
  }))
  let agentSeq = eventLog.reduce((max, event) => Math.max(max, event.seq), 0)

  function eventKey(event: PlanSubmissionEvent['event'], data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const record = data as { id?: unknown; iteration?: unknown; decision?: unknown }
    if ((event === 'interaction' || event === 'comment') && typeof record.id === 'string') return `${event}:${record.id}`
    if (event === 'review' && typeof record.decision === 'string') {
      return `review:${String(record.iteration ?? '')}:${record.decision}`
    }
    return null
  }

  function remember(event: PlanSubmissionEvent['event'], data: unknown, createdAt: number): PlanSubmissionEvent {
    agentSeq += 1
    const record: PlanSubmissionEvent = {
      id: `evt_${nanoid()}`,
      seq: agentSeq,
      event,
      data: structuredClone(data),
      createdAt,
      deliveredAt: null,
    }
    eventLog.push(record)
    return record
  }

  function backfillEvents(): void {
    const keys = new Set(eventLog.flatMap((event) => {
      const key = eventKey(event.event, event.data)
      return key ? [key] : []
    }))
    for (const response of Object.values(responses)) {
      const key = eventKey('interaction', response)
      if (!key || keys.has(key)) continue
      remember('interaction', response, startedAt)
      keys.add(key)
    }
    if (reviewResult) {
      const key = eventKey('review', reviewResult)
      if (key && !keys.has(key)) {
        remember('review', reviewResult, startedAt)
        keys.add(key)
      }
    }
    for (const comment of comments) {
      if (comment.addressedAt != null || comment.addressingAt) continue
      const key = eventKey('comment', comment)
      if (!key || keys.has(key)) continue
      remember('comment', comment, comment.createdAt)
      keys.add(key)
    }
  }

  backfillEvents()

  function pendingEvents(): PlanSubmissionEvent[] {
    return eventLog
      .filter((event) => event.deliveredAt == null)
      .sort((left, right) => left.seq - right.seq)
      .map((event) => ({ ...event }))
  }

  function pushEvent(event: PlanSubmissionEvent['event'], data: unknown): void {
    const record = remember(event, data, Date.now())
    for (const client of agentClients) client.write('notice', { ...record })
  }

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
      events: eventLog.map((event) => ({ ...event })),
      startedAt,
      lastSeenAt,
    }
  }

  function broadcast(event: string, data: unknown): void {
    for (const client of browserClients) client.write(event, data)
    for (const client of agentClients) client.write(event, data)
  }

  function broadcastBrowsers(event: string, data: unknown): void {
    for (const client of browserClients) client.write(event, data)
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
    if (
      next.accent === theme.accent &&
      next.pageWidth === theme.pageWidth &&
      next.diffsTheme === theme.diffsTheme &&
      next.wrapCode === theme.wrapCode
    ) {
      return
    }
    theme = next
    broadcast('theme', currentTheme())
  }

  function setExecution(next: ExecutionState): ExecutionState {
    if (next.graph && !Array.isArray(next.graph.nodes)) {
      void recordLog({
        level: 'warn',
        message: 'Execution graph has no nodes array',
        source: 'execution',
        planId: id,
        echo: false,
      }).catch(() => undefined)
    }
    const wasActive = execution.active
    const willBeActive = Boolean(next.active)
    const action = !wasActive && willBeActive ? 'started' : wasActive && !willBeActive ? 'stopped' : wasActive ? 'updated' : undefined
    if (action) {
      const label = action === 'started' ? 'Execution started' : action === 'stopped' ? 'Execution stopped' : 'Execution updated'
      const step = next.step?.trim()
      void recordLog({
        level: 'log',
        message: step ? `${label}: ${step}` : label,
        detail: next.detail,
        source: 'execution',
        planId: id,
        echo: false,
      }).catch(() => undefined)
    }
    execution = {
      active: willBeActive,
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
    const nextPlan = parsePlan(nextSource, planPath, id)
    const nextSections = collectSectionSources(nextPlan)
    diffs = diffSections(previousSections, nextSections)
    previousSections = nextSections
    source = nextSource
    plan = nextPlan
    try {
      const applied = mdxStore?.sync(nextPlan.title, nextSource)
      if (applied?.changed) broadcastBrowsers('plan', mdxPayload())
    } catch (error) {
      void recordLog({
        level: 'warn',
        message: 'Plan snapshot was not saved',
        detail: error instanceof Error ? error.message : undefined,
        source: 'plan',
        planId: id,
      }).catch(() => undefined)
    }
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
    pushEvent('interaction', response)
    broadcast('interaction', response)
    persist()
  }

  function fulfillReview(decision: ReviewDecision, note?: string): void {
    if (execution.active) {
      throw new Error('Review is locked while execution is live')
    }
    if (reviewResult) return
    const sent = decision === 'iterate' ? comments.filter((comment) => comment.addressedAt == null) : []
    const startedAt = Date.now()
    for (const comment of sent) {
      if (!comment.addressingAt) comment.addressingAt = startedAt
    }
    reviewResult = {
      decision,
      note,
      comments: sent.map((comment) => ({
        id: comment.id,
        sectionId: comment.blockId ?? comment.partId,
        text: comment.text,
      })),
      responses: Object.values(responses),
      iteration,
    }
    for (const waiter of reviewWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.resolve(reviewResult)
    }
    reviewWaiters = []
    for (const comment of sent) broadcast('comment', { ...comment })
    pushEvent('review', reviewResult)
    broadcast('review', reviewResult)
    if (decision === 'iterate') {
      broadcast('mode', { mode, iteration, review: reviewResult })
    } else {
      mode = 'watch'
      broadcast('mode', { mode, iteration, review: reviewResult })
    }
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
        review: reviewResult ?? null,
        execution,
        comments,
        clientAssets,
        theme: currentTheme(),
        basePath,
        selfId,
        changelog: loadLatestChangelog(fileURLToPath(import.meta.url)),
        mdxSnapshots: mdxStore?.list() ?? [],
        mdxHeadSnapshotId: mdxStore?.head()?.headSnapshotId ?? null,
      }),
    )
  }

  function planMdxPayload(): ReturnType<typeof mdxPayload> {
    touch()
    return mdxPayload()
  }

  async function restoreMdxSnapshot(snapshotId: string): Promise<ReturnType<typeof mdxPayload>> {
    touch()
    if (!mdxStore) throw new HttpError(404, 'Snapshots are not available')
    let applied: ReturnType<PlanSnapshotStore['restore']>
    try {
      applied = mdxStore.restore(snapshotId)
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Snapshot not found')
    }
    if (applied.changed) {
      source = applied.plan.body
      plan = parsePlan(source, planPath, id)
      previousSections = collectSectionSources(plan)
      diffs = previousSections.map((_, index) => ({ index, status: 'unchanged' as const }))
      await writeFile(planPath, source)
      broadcastBrowsers('plan', mdxPayload())
      broadcast('reload', { at: Date.now(), changed: 1 })
      persist()
    }
    return mdxPayload()
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
    const payload = jsonBody(body, true) as {
      accent?: string
      pageWidth?: string
      fullWidth?: boolean
      diffsTheme?: string
      wrapCode?: boolean
    }
    const hasAccent = payload.accent !== undefined
    const hasPageWidth = payload.pageWidth !== undefined
    const hasFullWidth = payload.fullWidth !== undefined
    const hasDiffsTheme = payload.diffsTheme !== undefined
    const hasWrapCode = payload.wrapCode !== undefined
    if (!hasAccent && !hasPageWidth && !hasFullWidth && !hasDiffsTheme && !hasWrapCode) {
      throw new HttpError(400, 'Provide accent, pageWidth, diffsTheme, and/or wrapCode.')
    }
    let accent = theme.accent
    if (hasAccent) {
      const normalized = normalizeAccent(payload.accent)
      if (!normalized) throw new HttpError(400, 'Invalid accent color. Use a hex value like #0f766e.')
      accent = normalized
    }
    let pageWidth: PageWidth = theme.pageWidth
    if (hasPageWidth) {
      if (!isPageWidth(payload.pageWidth)) {
        throw new HttpError(400, 'Page width must be default, wide, or full.')
      }
      pageWidth = payload.pageWidth
    } else if (hasFullWidth) {
      pageWidth = payload.fullWidth ? 'wide' : 'default'
    }
    let diffsTheme = theme.diffsTheme
    if (hasDiffsTheme) {
      if (!isKnownDiffsTheme(payload.diffsTheme)) {
        throw new HttpError(400, 'Unknown Pierre diffs theme.')
      }
      diffsTheme = normalizeDiffsTheme(payload.diffsTheme)
    }
    let wrapCode = theme.wrapCode
    if (hasWrapCode) {
      if (typeof payload.wrapCode !== 'boolean') {
        throw new HttpError(400, 'wrapCode must be true or false.')
      }
      wrapCode = payload.wrapCode
    }
    const view = await applyTheme({ accent, pageWidth, diffsTheme, wrapCode }, true)
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
        pending: pendingEvents(),
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
      addressingAt: null,
      addressedAt: null,
    }
    comments.push(comment)
    pushEvent('comment', comment)
    broadcast('comment', comment)
    persist()
    return { ok: true, comment }
  }

  function addressComment(commentId: string, body?: unknown): unknown {
    touch()
    const payload = jsonBody(body, false) as { outcome?: unknown }
    const outcome = payload.outcome
    if (outcome != null && outcome !== 'implemented' && outcome !== 'errored' && outcome !== 'issues') {
      throw new HttpError(400, 'Invalid outcome')
    }
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment) throw new HttpError(404, 'Unknown comment')
    comment.outcome = outcome === 'errored' || outcome === 'issues' || outcome === 'implemented' ? outcome : 'implemented'
    if (!comment.addressedAt) comment.addressedAt = Date.now()
    comment.addressingAt = null
    broadcast('comment', { ...comment, replies: comment.replies?.map((reply) => ({ ...reply })) })
    persist()
    return { ok: true, comment }
  }

  function replyToComment(commentId: string, body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as { text?: unknown }
    const text = String(payload.text ?? '').trim()
    if (!text || text.length > 4000) throw new HttpError(400, 'Missing reply')
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment) throw new HttpError(404, 'Unknown comment')
    const reply: CommentReply = {
      id: `rpl_${nanoid()}`,
      text,
      createdAt: Date.now(),
    }
    comment.replies = [...(comment.replies ?? []), reply]
    broadcast('comment', { ...comment, replies: comment.replies.map((entry) => ({ ...entry })) })
    persist()
    return { ok: true, comment, reply }
  }

  function markAddressing(commentId: string): unknown {
    touch()
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment) throw new HttpError(404, 'Unknown comment')
    if (!comment.addressedAt && !comment.addressingAt) {
      comment.addressingAt = Date.now()
      broadcast('comment', { ...comment })
      persist()
    }
    return { ok: true, comment }
  }

  function acknowledgeEvents(body: unknown): { ok: true; delivered: string[] } {
    touch()
    const payload = jsonBody(body, true) as { ids?: unknown }
    if (!Array.isArray(payload.ids) || payload.ids.length === 0 || payload.ids.some((id) => typeof id !== 'string' || !id)) {
      throw new HttpError(400, 'Missing event ids')
    }
    const wanted = new Set(payload.ids)
    const now = Date.now()
    const delivered: string[] = []
    for (const event of eventLog) {
      if (!wanted.has(event.id)) continue
      if (event.deliveredAt == null) event.deliveredAt = now
      delivered.push(event.id)
    }
    persist()
    return { ok: true, delivered }
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

  function setMode(nextMode: PlanMode, nextIteration?: number): void {
    mode = nextMode
    if (nextIteration !== undefined && Number.isFinite(nextIteration)) iteration = nextIteration
    if (nextMode === 'review') reviewResult = undefined
    broadcast('mode', { mode, iteration, review: reviewResult ?? null })
    persist()
  }

  function updateMode(body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as { mode?: unknown }
    const next = payload.mode
    if (next !== 'watch' && next !== 'comment' && next !== 'review') throw new HttpError(400, 'Invalid mode')
    setMode(next)
    return { ok: true, mode }
  }

  const watcher = watch(planPath, { persistent: true }, () => {
    void reloadFromDisk().catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to reload plan'
      void recordLog({
        level: 'error',
        message: `Failed to reload plan: ${message}`,
        detail: error instanceof Error ? error.stack : undefined,
        source: 'plan',
        planId: id,
      }).catch(() => undefined)
      broadcast('error', { message })
    })
  })

  const themeConfigBase = basename(themeConfigPath)
  let themeWatcher: ReturnType<typeof watch> | undefined
  try {
    themeWatcher = watch(dirname(themeConfigPath), { persistent: true }, (_event, filename) => {
      if (filename && filename !== themeConfigBase) return
      void reloadThemeFromDisk().catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to reload theme config'
        void recordLog({
          level: 'warn',
          message: `Failed to reload theme: ${message}`,
          detail: error instanceof Error ? error.stack : undefined,
          source: 'plan',
          planId: id,
        }).catch(() => undefined)
        broadcast('error', { message })
      })
    })
  } catch (error) {
    void recordLog({
      level: 'warn',
      message: 'Theme config is not being watched',
      detail: error instanceof Error ? error.message : undefined,
      source: 'plan',
      planId: id,
    }).catch(() => undefined)
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
    setMode,
    updateMode,
    page,
    planMdxPayload,
    restoreMdxSnapshot,
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
    replyToComment,
    markAddressing,
    submitReview,
    acknowledgeEvents,
    async close() {
      if (closed) return
      closed = true
      watcher.close()
      themeWatcher?.close()
      mdxStore?.close()
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
