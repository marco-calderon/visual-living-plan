import { nanoid } from 'nanoid'
import { watch } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientDistDir, loadClientAssets, type ClientAssets } from './assets'
import { html, HttpError, jsonBody } from './http'
import {
  inspectMutation,
  readBaseRevision,
  readUpdatedAt,
  rememberMutation,
  type IdempotencyRecord,
  type PlanSnapshot,
  type UserMutationKind,
} from './offlineSync'
import { diffSections } from './diff'
import { applyExecutionChange, createIdleExecutionState, readExecutionPatch, type ExecutionAction, type ExecutionState } from './execution'
import { collectSectionSources, parsePlan } from './parse'
import { recordLog } from './serviceLog'
import { AGENT_KEEPALIVE_MS, agentPresence, type AgentPresence } from './agentPresence'
import { loadLatestChangelog, loadPackageVersion } from './changelog'
import { defaultRegistryHome, globalThemeConfigPath } from './configHome'
import { openPlanSnapshots, type PlanSnapshotStore } from './planSnapshots'
import { SearchRequestError, searchParams, searchPlanDocuments, type SearchResponse } from './planSearch'
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
import { planNotReadyReason } from './planReady'
import { INVALID_ITERATION, readIteration, UNREAD_VERDICT } from './reviewRound'
import { approvesRun, nextRunState } from './runFollow'
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
  // The browser SQLite store compiles this with streaming only when it is served as wasm.
  '.wasm': 'application/wasm',
}

/** How often an open page hears from the stream when nothing else happens. */
export const BROWSER_KEEPALIVE_MS = 20_000
/** Pause after the last change to the plan file before it is read again. */
const RELOAD_SETTLE_MS = 120

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
  revision: number
  idempotency: IdempotencyRecord[]
  themeUpdatedAt: number
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
  /** Whether a CLI command is holding the agent stream open. */
  agentPresence: () => AgentPresence
  touch: () => void
  snapshot: () => PlanSessionSnapshot
  setMode: (mode: PlanMode, iteration?: number) => void
  /**
   * Start a review round. A verdict no agent has received yet is kept instead, so a `review` started
   * again after a drop prints it. Returns false when the verdict was kept and the mode left alone.
   */
  enterReview: (iteration?: number) => boolean
  updateMode: (body: unknown, request?: Request) => unknown
  offlineSnapshot: () => PlanSnapshot
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
  /** Save a plan edited on the page. Refused with 409 when the file changed since `base`. */
  saveMdxSource: (body: unknown) => Promise<unknown>
  /** Search the live plan, or saved versions when `version` asks for them. */
  search: (url: URL) => SearchResponse
  themeView: () => ReturnType<typeof themePayload>
  updateTheme: (body: unknown) => Promise<unknown>
  executionPayload: () => ExecutionState
  updateExecution: (body: unknown) => unknown
  startExecution: (body: unknown) => unknown
  pushExecution: (body: unknown) => unknown
  stopExecution: (body?: unknown) => unknown
  browserEvents: (request: Request) => Response
  agentEvents: (request: Request) => Response
  submitInteraction: (interactionId: string, body: unknown, request?: Request) => unknown
  submitComment: (body: unknown, request?: Request) => unknown
  addressComment: (commentId: string, body?: unknown, request?: Request) => unknown
  replyToComment: (commentId: string, body: unknown, request?: Request) => unknown
  markAddressing: (commentId: string, request?: Request) => unknown
  submitReview: (body: unknown, request?: Request) => unknown
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
  /** Logo link. Omit to use `/dashboard` under the service; null for none. */
  dashboardHref?: string | null
  selfId?: string
  startedAt?: number
  lastSeenAt?: number
  responses?: Record<string, InteractionResponse>
  execution?: ExecutionState
  review?: ReviewResult | null
  comments?: PlanComment[]
  events?: PlanSubmissionEvent[]
  revision?: number
  idempotency?: IdempotencyRecord[]
  themeUpdatedAt?: number
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
  let theme = await loadThemeConfig(themeConfigPath, globalThemeConfigPath())
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
      revision,
      snapshots: mdxStore?.list() ?? [],
      headSnapshotId: mdxStore?.head()?.headSnapshotId ?? null,
    }
  }

  function search(url: URL): SearchResponse {
    touch()
    let params: ReturnType<typeof searchParams>
    try {
      params = searchParams(url)
    } catch (error) {
      if (error instanceof SearchRequestError) throw new HttpError(error.status, error.message)
      throw error
    }
    // Saved versions are read only when the request asks for them.
    const saved =
      params.version === 'live'
        ? []
        : (mdxStore?.list() ?? []).map((row) => ({ seq: row.seq, title: row.title, source: row.body, createdAt: row.createdAt }))
    if (typeof params.version === 'number' && !saved.some((row) => row.seq === params.version)) {
      throw new HttpError(404, `Version ${params.version} is not saved for this plan.`)
    }
    return searchPlanDocuments({
      planId: id,
      ...params,
      live: { seq: 'live', title: plan.title, source, createdAt: null },
      saved,
    })
  }

  function offlineSnapshot(): PlanSnapshot {
    touch()
    return {
      revision,
      source,
      title: plan.title,
      mode,
      responses,
      comments: comments.map((comment) => ({ ...comment })),
      review: reviewResult ?? null,
      locked: Boolean(execution.active),
    }
  }

  const responses: Record<string, InteractionResponse> = { ...(options.responses ?? {}) }
  const waiters = new Map<string, Waiter[]>()
  const browserClients = new Set<SseClient>()
  const agentClients = new Set<SseClient>()
  let agentSeenAt: number | null = null
  let announcedAgents = 0
  let execution = options.execution ? { ...options.execution } : createIdleExecutionState()
  let reviewResult: ReviewResult | undefined = options.review ?? undefined
  let reviewWaiters: ReviewWaiter[] = []
  const comments: PlanComment[] = [...(options.comments ?? [])]
  const eventLog: PlanSubmissionEvent[] = (options.events ?? []).map((event) => ({
    ...event,
    data: structuredClone(event.data),
  }))
  let agentSeq = eventLog.reduce((max, event) => Math.max(max, event.seq), 0)
  let revision = options.revision ?? 0
  let idempotency: IdempotencyRecord[] = [...(options.idempotency ?? [])]
  let themeUpdatedAt = options.themeUpdatedAt ?? 0

  function guarded(
    kind: UserMutationKind,
    body: unknown,
    request: Request | undefined,
    locks: boolean,
  ): { body: unknown; replay?: unknown; key: string | null } {
    const key = request?.headers.get('idempotency-key')?.trim() || null
    const decision = inspectMutation({
      kind,
      key,
      body,
      baseRevision: readBaseRevision(body),
      currentRevision: revision,
      executionActive: locks && Boolean(execution.active),
      source,
      records: idempotency,
    })
    if (decision.action === 'replay') return { body: {}, replay: decision.result, key }
    if (decision.action === 'reject') throw new HttpError(409, decision.message)
    return { body: decision.body, key }
  }

  function note(key: string | null, body: unknown, result: unknown): void {
    if (!key) return
    idempotency = rememberMutation(idempotency, key, body, result)
    persist()
  }

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
    return withPlannedWorkflow(execution, plan, Object.keys(responses))
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
      revision,
      idempotency: idempotency.map((record) => ({ ...record })),
      themeUpdatedAt,
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

  function eventStream(
    bucket: Set<SseClient>,
    hello: unknown,
    signal: AbortSignal,
    options: { keepAliveMs?: number; onMembership?: () => void } = {},
  ): Response {
    const encoder = new TextEncoder()
    let client: SseClient | undefined
    const leave = () => {
      if (!client || !bucket.delete(client)) return
      options.onMembership?.()
    }
    let keepAlive: ReturnType<typeof setInterval> | undefined
    const stopKeepAlive = () => {
      if (keepAlive) clearInterval(keepAlive)
      keepAlive = undefined
    }
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
              stopKeepAlive()
              leave()
            }
          },
          close() {
            if (closed) return
            closed = true
            stopKeepAlive()
            leave()
            try {
              controller.close()
            } catch {
              // The client already went away.
            }
          },
        }
        bucket.add(client)
        client.write('hello', hello)
        options.onMembership?.()
        // A page tells a live stream from a dead one by these pings, and reconnects when they stop.
        if (options.keepAliveMs) keepAlive = setInterval(() => client?.write('ping', { at: Date.now() }), options.keepAliveMs)
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
    const next = await loadThemeConfig(themeConfigPath, globalThemeConfigPath())
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
    if (wasActive !== willBeActive) revision += 1
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
      ...(next.follow ? { follow: next.follow } : {}),
    }
    const view = executionView()
    broadcast('execution', { ...view, revision })
    persist()
    return view
  }

  /**
   * Start or end the run the way the plan file says (`runFollow.ts`). Every step done or one failed
   * ends it. Only a new plan source (`mayStart`) can start it, after an approval. Returns true when the
   * run changed; the change was then broadcast.
   */
  function settleRun(mayStart = false): boolean {
    const change = nextRunState(executionView(), { mayStart })
    if (!change) return false
    setExecution({ ...execution, active: change.active, step: execution.step ?? (change.active ? 'Executing' : undefined) })
    return true
  }

  let heldReason: string | undefined
  async function reloadFromDisk(): Promise<void> {
    const nextSource = await readFile(planPath, 'utf8')
    if (nextSource === source) return
    // A half-written or broken edit is not sent. The page keeps the last good plan.
    const reason = await planNotReadyReason(nextSource)
    if (nextSource !== (await readFile(planPath, 'utf8'))) return
    if (reason) {
      if (heldReason !== reason) {
        void recordLog({
          level: 'warn',
          message: `Plan edit not shown yet: ${reason}`,
          source: 'plan',
          planId: id,
        }).catch(() => undefined)
      }
      heldReason = reason
      return
    }
    heldReason = undefined
    applySource(nextSource)
  }

  /** Show a new plan source: parse it, keep a snapshot, and tell the page and the canvas. */
  function applySource(nextSource: string): void {
    revision += 1
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
    // A phase marked active, done, or failed can start or end the run.
    if (!settleRun(true)) broadcast('execution', { ...executionView(), revision })
    persist()
  }

  /**
   * Save a plan edited on the page. `base` is the source the editor started from. When the file
   * changed since then (the agent wrote it), the save is refused so neither edit is lost.
   */
  async function saveMdxSource(body: unknown): Promise<ReturnType<typeof mdxPayload>> {
    touch()
    if (execution.active) throw new HttpError(409, 'The plan cannot be edited while execution is live')
    const input = (body && typeof body === 'object' ? body : {}) as { source?: unknown; base?: unknown }
    if (typeof input.source !== 'string' || typeof input.base !== 'string') {
      throw new HttpError(400, 'source and base are required')
    }
    const onDisk = await readFile(planPath, 'utf8')
    if (input.base !== onDisk) throw new HttpError(409, 'The plan changed while you were editing. Reload to see the new version.')
    if (input.source === onDisk) return mdxPayload()
    const reason = await planNotReadyReason(input.source)
    if (reason) throw new HttpError(400, reason)
    // The watcher sees this write, finds the source unchanged, and does nothing.
    source = input.source
    await writeFile(planPath, input.source)
    applySource(input.source)
    pushEvent('edit', { at: Date.now(), title: plan.title, by: 'page' })
    return mdxPayload()
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
    // An approve gate answered yes lets the agent's next edit of the plan file start the run.
    if (approvesRun({ response })) execution = { ...execution, follow: 'armed' }
    // An answered step is done on the workflow too.
    if (!settleRun()) broadcast('execution', { ...executionView(), revision })
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
    // From here the run follows the plan file: the agent's next edit with a phase past pending starts it.
    if (approvesRun({ decision })) execution = { ...execution, follow: 'armed' }
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
        agent: currentAgentPresence(),
        basePath,
        dashboardHref: options.dashboardHref,
        selfId,
        changelog: loadLatestChangelog(fileURLToPath(import.meta.url)),
        appVersion: loadPackageVersion(fileURLToPath(import.meta.url)),
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
      planned: planToExpectedGraph(plan, Object.keys(responses)) ?? null,
      theme: currentTheme(),
    }
  }

  function themeView(): ReturnType<typeof themePayload> & { updatedAt: number } {
    touch()
    return { ...currentTheme(), updatedAt: themeUpdatedAt }
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
    const incomingAt = readUpdatedAt(payload)
    if (incomingAt != null && themeUpdatedAt > incomingAt) {
      return { ok: true, theme: themeView() }
    }
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
    themeUpdatedAt = incomingAt ?? Date.now()
    persist()
    return { ok: true, theme: { ...view, updatedAt: themeUpdatedAt } }
  }

  function executionPayload(): ExecutionState {
    touch()
    return executionView()
  }

  function updateExecution(body: unknown): unknown {
    touch()
    const payload = jsonBody(body, true) as Partial<ExecutionState>
    const stopping = execution.active && !payload.active
    const follow = stopping ? 'off' : execution.follow
    setExecution({
      active: Boolean(payload.active),
      step: payload.step ? String(payload.step) : undefined,
      detail: payload.detail ? String(payload.detail) : undefined,
      graph: payload.graph,
      scene:
        payload.scene && typeof payload.scene === 'object' ? (payload.scene as Record<string, unknown>) : undefined,
      ...(follow ? { follow } : {}),
    })
    settleRun()
    return { ok: true, execution: executionView() }
  }

  function changeExecution(action: ExecutionAction, body: unknown): unknown {
    touch()
    const patch = readExecutionPatch(jsonBody(body, false))
    setExecution(applyExecutionChange(execution, action, patch))
    // A pushed graph with every step done ends the run.
    settleRun()
    return { ok: true, execution: executionView() }
  }

  function startExecution(body: unknown): unknown {
    return changeExecution('start', body)
  }

  function pushExecution(body: unknown): unknown {
    return changeExecution('push', body)
  }

  function stopExecution(body?: unknown): unknown {
    return changeExecution('stop', body)
  }

  function browserEvents(request: Request): Response {
    touch()
    return eventStream(
      browserClients,
      {
        mode,
        pendingInteractionIds: pendingInteractionIds(),
        review: reviewResult ?? null,
        comments,
        execution: executionView(),
        theme: currentTheme(),
        agent: currentAgentPresence(),
      },
      request.signal,
      { keepAliveMs: BROWSER_KEEPALIVE_MS },
    )
  }

  function agentEvents(request: Request): Response {
    touch()
    return eventStream(
      agentClients,
      {
        mode,
        iteration,
        pendingInteractionIds: pendingInteractionIds(),
        responses,
        review: reviewResult ?? null,
        comments,
        execution: executionView(),
        pending: pendingEvents(),
      },
      request.signal,
      { keepAliveMs: AGENT_KEEPALIVE_MS, onMembership: agentsChanged },
    )
  }

  function currentAgentPresence(): AgentPresence {
    return agentPresence(agentClients.size, agentSeenAt)
  }

  /** An agent stream opened or closed. Open pages hear the new count. */
  function agentsChanged(): void {
    agentSeenAt = Date.now()
    const count = agentClients.size
    if (count === announcedAgents) return
    announcedAgents = count
    broadcastBrowsers('agent', currentAgentPresence())
  }

  function submitInteraction(interactionId: string, body: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('interaction', body, request, true)
    if (gate.replay) return gate.replay
    const payload = jsonBody(gate.body, true) as InteractionResponse
    if (!plan.interactionIds.includes(interactionId)) {
      throw new HttpError(404, `Unknown interaction id: ${interactionId}`)
    }
    if (payload.id !== interactionId) throw new HttpError(400, 'Interaction id mismatch')
    try {
      fulfillInteraction(payload)
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Interaction locked')
    }
    const result = {
      ok: true,
      response: payload,
      pendingInteractionIds: pendingInteractionIds(),
    }
    note(gate.key, gate.body, result)
    return result
  }

  function submitComment(body: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('comment', body, request, true)
    if (gate.replay) return gate.replay
    const payload = jsonBody(gate.body, true) as {
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
    const result = { ok: true, comment }
    note(gate.key, gate.body, result)
    return result
  }

  function addressComment(commentId: string, body?: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('address', body ?? {}, request, true)
    if (gate.replay) return gate.replay
    const payload = jsonBody(gate.body, false) as { outcome?: unknown }
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
    const result = { ok: true, comment }
    note(gate.key, gate.body, result)
    return result
  }

  function replyToComment(commentId: string, body: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('reply', body, request, true)
    if (gate.replay) return gate.replay
    const payload = jsonBody(gate.body, true) as { text?: unknown }
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
    const result = { ok: true, comment, reply }
    note(gate.key, gate.body, result)
    return result
  }

  /**
   * An agent's listener printed this comment. The page shows it in progress (Addressing, or Working on a
   * minibar message) without a separate `addressing` call. `reply` or `address` answers it.
   */
  function markReceived(commentId: unknown, at: number): void {
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment || comment.addressedAt || comment.addressingAt) return
    comment.addressingAt = at
    broadcast('comment', { ...comment, replies: comment.replies?.map((reply) => ({ ...reply })) })
  }

  function markAddressing(commentId: string, request?: Request): unknown {
    touch()
    const gate = guarded('addressing', {}, request, true)
    if (gate.replay) return gate.replay
    const comment = comments.find((entry) => entry.id === commentId)
    if (!comment) throw new HttpError(404, 'Unknown comment')
    if (!comment.addressedAt && !comment.addressingAt) {
      comment.addressingAt = Date.now()
      broadcast('comment', { ...comment })
      persist()
    }
    const result = { ok: true, comment }
    note(gate.key, gate.body, result)
    return result
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
      if (event.deliveredAt == null) {
        event.deliveredAt = now
        if (event.event === 'comment') markReceived((event.data as { id?: unknown } | null)?.id, now)
      }
      delivered.push(event.id)
    }
    persist()
    return { ok: true, delivered }
  }

  function submitReview(body: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('review', body, request, true)
    if (gate.replay) return gate.replay
    if (mode !== 'review') throw new HttpError(400, 'Server is not in review mode')
    const payload = jsonBody(gate.body, true) as { decision: ReviewDecision; note?: string }
    if (!['approve', 'deny', 'iterate'].includes(payload.decision)) throw new HttpError(400, 'Invalid decision')
    try {
      fulfillReview(payload.decision, payload.note)
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Review locked')
    }
    const result = { ok: true, review: reviewResult }
    note(gate.key, gate.body, result)
    return result
  }

  function setMode(nextMode: PlanMode, nextIteration?: number): void {
    mode = nextMode
    if (nextIteration !== undefined && Number.isFinite(nextIteration)) iteration = nextIteration
    if (nextMode === 'review') reviewResult = undefined
    broadcast('mode', { mode, iteration, review: reviewResult ?? null })
    persist()
  }

  /** The person sent a verdict and no agent has acked its `review` row yet. */
  function verdictUnread(): boolean {
    if (!reviewResult?.decision) return false
    return eventLog.some((event) => event.event === 'review' && event.deliveredAt == null)
  }

  function enterReview(nextIteration?: number): boolean {
    if (verdictUnread()) return false
    setMode('review', nextIteration)
    return true
  }

  function updateMode(body: unknown, request?: Request): unknown {
    touch()
    const gate = guarded('mode', body, request, false)
    if (gate.replay) return gate.replay
    const payload = jsonBody(gate.body, true) as { mode?: unknown; iteration?: unknown }
    const next = payload.mode
    if (next !== 'watch' && next !== 'comment' && next !== 'review') throw new HttpError(400, 'Invalid mode')
    const nextIteration = readIteration(payload.iteration)
    if (nextIteration === 'invalid') throw new HttpError(400, INVALID_ITERATION)
    if (next === 'review' && verdictUnread()) throw new HttpError(409, UNREAD_VERDICT)
    setMode(next, nextIteration)
    const result = { ok: true, mode, iteration }
    note(gate.key, gate.body, result)
    return result
  }

  // An editor writes a file in more than one step. Read it once the writes settle.
  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  const watcher = watch(planPath, { persistent: true }, () => {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(reloadSettled, RELOAD_SETTLE_MS)
  })
  function reloadSettled(): void {
    reloadTimer = undefined
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
  }

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
    agentPresence: currentAgentPresence,
    touch,
    snapshot,
    setMode,
    enterReview,
    updateMode,
    offlineSnapshot,
    page,
    planMdxPayload,
    restoreMdxSnapshot,
    planPayload,
    saveMdxSource,
    search,
    themeView,
    updateTheme,
    executionPayload,
    updateExecution,
    startExecution,
    pushExecution,
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
      if (reloadTimer) clearTimeout(reloadTimer)
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
