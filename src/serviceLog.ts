import { chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { defaultLogHome } from './configHome'
import { HttpError } from './http'

export type LogLevel = 'error' | 'warn' | 'log'

export type ServiceLogEntry = {
  id: string
  level: LogLevel
  message: string
  detail?: string
  source: string
  planId?: string
  at: number
  /** Present when an older reader counted duplicates. New lines are one event each. */
  repeat: number
}

const MAX_READ = 500
const CLIENT_WINDOW_MS = 10_000
const CLIENT_BUDGET = 120
const MESSAGE_MAX = 2_000
const DETAIL_MAX = 8_000
const SOURCE_MAX = 40
const PLAN_FILE_BYTES = 1_000_000
const WRITE_TIMEOUT_MS = 2_000

const originals = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  log: console.log.bind(console),
}

type PlanSink = {
  logger: winston.Logger
  file: string
}

type LogSink = {
  home: string
  registry: winston.Logger
  plans: Map<string, PlanSink>
}

let sink: LogSink | null = null
let seq = 0
let clientPosts = 0
let clientWindowStart = Date.now()
let captureInstalled = false
const pending = new Set<Promise<unknown>>()

type StoredLine = ServiceLogEntry & { seq: number }

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/** Directory that holds the log files. Tests set `LIVE_PLAN_LOG_HOME`. */
export function appLogHome(): string {
  return defaultLogHome()
}

/** Local calendar day, matching the daily file name winston writes. */
export function localLogDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function isLogDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  chmodSync(path, 0o700)
}

function watchLogger(logger: winston.Logger): void {
  logger.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Log write failed'
    originals.error(`[live-plan] ${message}`)
  })
}

function lineFormat(): winston.Logform.Format {
  return winston.format.combine(winston.format.timestamp(), winston.format.json())
}

function getSink(): LogSink {
  const home = appLogHome()
  if (sink?.home === home) return sink
  ensureDir(home)
  const registryDir = join(home, 'registry')
  const plansDir = join(home, 'plans')
  ensureDir(registryDir)
  ensureDir(plansDir)
  const registry = winston.createLogger({
    level: 'info',
    exitOnError: false,
    format: lineFormat(),
    transports: [
      new DailyRotateFile({
        dirname: registryDir,
        filename: '%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        utc: false,
        auditFile: join(registryDir, '.audit.json'),
      }),
    ],
  })
  watchLogger(registry)
  sink = { home, registry, plans: new Map() }
  return sink
}

function sanitizePlanId(planId: string): string {
  return planId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
}

function planSink(current: LogSink, planId: string): PlanSink | undefined {
  const safe = sanitizePlanId(planId)
  if (!safe) return undefined
  const existing = current.plans.get(safe)
  if (existing) return existing
  const file = join(current.home, 'plans', `${safe}.log`)
  const logger = winston.createLogger({
    level: 'info',
    exitOnError: false,
    format: lineFormat(),
    transports: [
      new winston.transports.File({
        filename: file,
        maxsize: PLAN_FILE_BYTES,
        maxFiles: 3,
        tailable: true,
      }),
    ],
  })
  watchLogger(logger)
  const created = { logger, file }
  current.plans.set(safe, created)
  return created
}

function registryPath(home: string, day: string): string {
  return join(home, 'registry', `${day}.log`)
}

function winstonLevel(level: LogLevel): 'error' | 'warn' | 'info' {
  return level === 'log' ? 'info' : level
}

function fileHas(path: string, needle: string): boolean {
  try {
    return readFileSync(path, 'utf8').includes(needle)
  } catch {
    return false
  }
}

async function waitForLine(files: string[], id: string): Promise<void> {
  const needle = `"id":"${id}"`
  const deadline = Date.now() + WRITE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (files.every((file) => fileHas(file, needle))) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Log ${id} was not written to ${files.join(', ')}`)
}

function track<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise)
  return promise.finally(() => pending.delete(promise))
}

export async function flushAppLogs(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all([...pending])
  }
}

/**
 * Append one diagnostic line.
 * Plan events go to the daily registry file and to `plans/<planId>.log`.
 * Everything else goes to the daily file only.
 */
export function recordLog(input: {
  level: LogLevel
  message: string
  detail?: string
  source?: string
  planId?: string
  echo?: boolean
}): Promise<ServiceLogEntry> {
  const message = clip(input.message, MESSAGE_MAX) || 'Empty log'
  const source = clip(input.source ?? 'server', SOURCE_MAX) || 'server'
  const detail = input.detail ? clip(input.detail, DETAIL_MAX) : undefined
  const planId = input.planId
  seq += 1
  const order = seq
  const entry: ServiceLogEntry = {
    id: `log_${order.toString(36)}`,
    level: input.level,
    message,
    source,
    at: Date.now(),
    repeat: 1,
    ...(detail ? { detail } : {}),
    ...(planId ? { planId } : {}),
  }
  if (input.echo !== false) {
    const line = `[live-plan ${entry.level}] ${entry.message}`
    const sinkConsole = entry.level === 'log' ? originals.log : entry.level === 'warn' ? originals.warn : originals.error
    sinkConsole(line)
  }

  const current = getSink()
  const meta = {
    id: entry.id,
    seq: order,
    source: entry.source,
    at: entry.at,
    levelName: entry.level,
    ...(entry.detail ? { detail: entry.detail } : {}),
    ...(entry.planId ? { planId: entry.planId } : {}),
  }
  const files = [registryPath(current.home, localLogDay())]
  current.registry.log(winstonLevel(entry.level), entry.message, { ...meta })
  if (entry.planId) {
    const plan = planSink(current, entry.planId)
    if (plan) {
      plan.logger.log(winstonLevel(entry.level), entry.message, { ...meta })
      files.push(plan.file)
    }
  }
  return track(waitForLine(files, entry.id).then(() => entry))
}

function closeLogger(logger: winston.Logger): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1_000)
    logger.once('finish', () => {
      clearTimeout(timer)
      resolve()
    })
    logger.end()
  })
}

export async function clearLogs(): Promise<void> {
  await flushAppLogs()
  const current = sink
  sink = null
  if (current) {
    await closeLogger(current.registry)
    await Promise.all([...current.plans.values()].map((plan) => closeLogger(plan.logger)))
  }
  clientPosts = 0
  clientWindowStart = Date.now()
  seq = 0
  const home = process.env.LIVE_PLAN_LOG_HOME?.trim()
  if (home) rmSync(home, { recursive: true, force: true })
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message || value.name
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatConsole(args: unknown[]): { message: string; detail?: string } {
  const message = args.map(formatConsoleArg).join(' ').trim() || 'Empty log'
  const detail = args
    .filter((value): value is Error => value instanceof Error && Boolean(value.stack))
    .map((value) => value.stack as string)
    .join('\n')
  return { message, ...(detail ? { detail } : {}) }
}

/** Copy `console.error`, `console.warn`, and `console.log` into the service log. */
export function installServiceLogCapture(): void {
  if (captureInstalled) return
  captureInstalled = true
  const levels: LogLevel[] = ['error', 'warn', 'log']
  for (const level of levels) {
    console[level] = (...args: unknown[]) => {
      originals[level](...args)
      const formatted = formatConsole(args)
      void recordLog({ level, message: formatted.message, detail: formatted.detail, source: 'server', echo: false }).catch(
        () => undefined,
      )
    }
  }
}

function allowClientLog(): boolean {
  const now = Date.now()
  if (now - clientWindowStart > CLIENT_WINDOW_MS) {
    clientWindowStart = now
    clientPosts = 0
  }
  clientPosts += 1
  return clientPosts <= CLIENT_BUDGET
}

function isLevel(value: unknown): value is LogLevel {
  return value === 'error' || value === 'warn' || value === 'log'
}

export async function acceptClientLog(
  body: unknown,
  planId?: string,
  options?: { echo?: boolean },
): Promise<{ status: number; body: unknown }> {
  if (!body || typeof body !== 'object') return { status: 400, body: { error: 'Expected a JSON object' } }
  const raw = body as Record<string, unknown>
  if (!isLevel(raw.level)) return { status: 400, body: { error: 'level must be error, warn, or log' } }
  if (typeof raw.message !== 'string' || !raw.message.trim()) return { status: 400, body: { error: 'Missing log message' } }
  if (!allowClientLog()) return { status: 429, body: { error: 'Too many logs' } }
  const source = raw.source === 'page' || raw.source === 'browser' ? raw.source : 'browser'
  const detail = typeof raw.detail === 'string' && raw.detail.trim() ? raw.detail : undefined
  const log = await recordLog({
    level: raw.level,
    message: raw.message,
    detail,
    source,
    planId,
    echo: options?.echo !== false,
  })
  return { status: 200, body: { ok: true, log } }
}

function levelFromLine(row: Record<string, unknown>): LogLevel | undefined {
  if (row.levelName === 'error' || row.levelName === 'warn' || row.levelName === 'log') return row.levelName
  if (row.level === 'error' || row.level === 'warn') return row.level
  if (row.level === 'info') return 'log'
  return undefined
}

function fromLine(raw: unknown): StoredLine | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const row = raw as Record<string, unknown>
  const level = levelFromLine(row)
  if (!level || typeof row.message !== 'string' || !row.message) return undefined
  const at = typeof row.at === 'number' ? row.at : typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : Number.NaN
  if (!Number.isFinite(at)) return undefined
  const source = typeof row.source === 'string' && row.source ? row.source : 'server'
  const id = typeof row.id === 'string' && row.id ? row.id : `log_${Math.trunc(at).toString(36)}`
  const detail = typeof row.detail === 'string' && row.detail ? row.detail : undefined
  const planId = typeof row.planId === 'string' && row.planId ? row.planId : undefined
  const repeat = typeof row.repeat === 'number' && row.repeat > 0 ? row.repeat : 1
  const order = typeof row.seq === 'number' && Number.isFinite(row.seq) ? row.seq : 0
  return {
    id,
    level,
    message: row.message,
    source,
    at,
    repeat,
    seq: order,
    ...(detail ? { detail } : {}),
    ...(planId ? { planId } : {}),
  }
}

function readLogFile(path: string): StoredLine[] {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const entries: StoredLine[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = fromLine(JSON.parse(trimmed))
      if (parsed) entries.push(parsed)
    } catch {
      // A torn or non-JSON line is skipped. The audit file is not read here.
    }
  }
  return entries
}

function readPlanFile(home: string, planId: string): StoredLine[] {
  const safe = sanitizePlanId(planId)
  if (!safe) return []
  const dir = join(home, 'plans')
  const paths = [2, 1].map((index) => join(dir, `${safe}${index}.log`))
  paths.push(join(dir, `${safe}.log`))
  const byId = new Map<string, StoredLine>()
  for (const path of paths) {
    for (const entry of readLogFile(path)) byId.set(entry.id, entry)
  }
  return [...byId.values()]
}

function publish(entries: StoredLine[]): ServiceLogEntry[] {
  return entries.map(({ seq: _seq, ...entry }) => entry)
}

export async function listLogs(options?: {
  level?: LogLevel
  planId?: string
  includeUnscoped?: boolean
  limit?: number
  day?: string
}): Promise<ServiceLogEntry[]> {
  await flushAppLogs()
  const limit = Math.min(MAX_READ, Math.max(1, options?.limit ?? 200))
  const home = appLogHome()
  const day = options?.day && isLogDay(options.day) ? options.day : localLogDay()
  let stored: StoredLine[]
  if (!options?.planId) {
    stored = readLogFile(registryPath(home, day))
  } else if (options.includeUnscoped) {
    const scoped = readPlanFile(home, options.planId).filter((entry) => entry.planId === options.planId)
    const unscoped = readLogFile(registryPath(home, localLogDay())).filter((entry) => entry.planId == null)
    const byId = new Map<string, StoredLine>()
    for (const entry of [...scoped, ...unscoped]) byId.set(entry.id, entry)
    stored = [...byId.values()]
  } else {
    stored = readPlanFile(home, options.planId).filter((entry) => entry.planId === options.planId)
  }
  stored.sort((left, right) => left.at - right.at || left.seq - right.seq)
  const matched = stored.filter((entry) => !options?.level || entry.level === options.level)
  return publish(matched.slice(-limit).reverse())
}

export async function readLogs(request: Request, planId?: string): Promise<{ status: number; body: unknown }> {
  const params = new URL(request.url).searchParams
  const levelRaw = params.get('level')
  if (levelRaw && !isLevel(levelRaw)) return { status: 400, body: { error: 'level must be error, warn, or log' } }
  const limitRaw = params.get('limit')
  let limit = 200
  if (limitRaw != null && limitRaw !== '') {
    limit = Number(limitRaw)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ) {
      return { status: 400, body: { error: 'limit must be from 1 to 500' } }
    }
  }
  return {
    status: 200,
    body: {
      logs: await listLogs({
        level: isLevel(levelRaw) ? levelRaw : undefined,
        planId,
        includeUnscoped: Boolean(planId),
        limit,
      }),
    },
  }
}

export function planIdFromRequest(request: Request | undefined): string | undefined {
  if (!request) return undefined
  try {
    const match = new URL(request.url).pathname.match(/^\/plans\/([A-Za-z0-9_-]{8,80})(?:\/|$)/)
    return match?.[1]
  } catch {
    return undefined
  }
}

/** Record a failure the route handler turned into HTTP 500. Validation responses stay quiet. */
export function recordUnexpectedError(error: unknown, request?: Request): void {
  if (error instanceof HttpError && error.status < 500) return
  const message = error instanceof Error && error.message ? error.message : 'Unknown error'
  const detail = error instanceof Error ? error.stack : undefined
  void recordLog({
    level: 'error',
    message,
    detail,
    source: 'server',
    planId: planIdFromRequest(request),
  }).catch(() => undefined)
}

export function formatServiceLogLines(logs: ServiceLogEntry[]): string {
  if (logs.length === 0) return 'No logs.'
  return logs
    .map((entry) => {
      const plan = entry.planId ? ` plan=${entry.planId}` : ''
      const repeat = entry.repeat > 1 ? ` ×${entry.repeat}` : ''
      const head = `${new Date(entry.at).toISOString()} ${entry.level} ${entry.source}${plan}${repeat} ${entry.message}`
      return entry.detail ? `${head}\n${entry.detail}` : head
    })
    .join('\n')
}
