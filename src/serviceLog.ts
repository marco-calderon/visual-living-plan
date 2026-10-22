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
  /** How many times this same message was recorded inside the dedupe window. */
  repeat: number
}

const MAX_ENTRIES = 500
const DEDUPE_MS = 15_000
const CLIENT_WINDOW_MS = 10_000
const CLIENT_BUDGET = 120
const MESSAGE_MAX = 2_000
const DETAIL_MAX = 8_000
const SOURCE_MAX = 40

const entries: ServiceLogEntry[] = []
let seq = 0
let clientPosts = 0
let clientWindowStart = Date.now()

const originals = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  log: console.log.bind(console),
}

let captureInstalled = false

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function sameEntry(entry: ServiceLogEntry, next: { level: LogLevel; message: string; source: string; planId?: string }): boolean {
  return entry.level === next.level && entry.message === next.message && entry.source === next.source && entry.planId === next.planId
}

/**
 * Remember one diagnostic line.
 * The plan page and the dashboard read these back. They are not submissions.
 */
export function recordLog(input: {
  level: LogLevel
  message: string
  detail?: string
  source?: string
  planId?: string
  echo?: boolean
}): ServiceLogEntry {
  const message = clip(input.message, MESSAGE_MAX) || 'Empty log'
  const source = clip(input.source ?? 'server', SOURCE_MAX) || 'server'
  const detail = input.detail ? clip(input.detail, DETAIL_MAX) : undefined
  const planId = input.planId
  const now = Date.now()
  const cutoff = now - DEDUPE_MS
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry || entry.at < cutoff) break
    if (!sameEntry(entry, { level: input.level, message, source, planId })) continue
    entry.at = now
    entry.repeat += 1
    if (detail) entry.detail = detail
    entries.splice(index, 1)
    entries.push(entry)
    return { ...entry }
  }

  seq += 1
  const entry: ServiceLogEntry = {
    id: `log_${seq.toString(36)}`,
    level: input.level,
    message,
    source,
    at: now,
    repeat: 1,
    ...(detail ? { detail } : {}),
    ...(planId ? { planId } : {}),
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)

  if (input.echo !== false) {
    const line = `[live-plan ${entry.level}] ${entry.message}`
    const sink = entry.level === 'log' ? originals.log : entry.level === 'warn' ? originals.warn : originals.error
    sink(line)
  }
  return { ...entry }
}

export function listLogs(options?: {
  level?: LogLevel
  planId?: string
  includeUnscoped?: boolean
  limit?: number
}): ServiceLogEntry[] {
  const limit = Math.min(MAX_ENTRIES, Math.max(1, options?.limit ?? 200))
  const matched = entries.filter((entry) => {
    if (options?.level && entry.level !== options.level) return false
    if (!options?.planId) return true
    if (entry.planId === options.planId) return true
    return Boolean(options.includeUnscoped) && entry.planId == null
  })
  return matched.slice(-limit).reverse().map((entry) => ({ ...entry }))
}

export function clearLogs(): void {
  entries.length = 0
  seq = 0
  clientPosts = 0
  clientWindowStart = Date.now()
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
      recordLog({ level, message: formatted.message, detail: formatted.detail, source: 'server', echo: false })
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

export function acceptClientLog(
  body: unknown,
  planId?: string,
  options?: { echo?: boolean },
): { status: number; body: unknown } {
  if (!body || typeof body !== 'object') return { status: 400, body: { error: 'Expected a JSON object' } }
  const raw = body as Record<string, unknown>
  if (!isLevel(raw.level)) return { status: 400, body: { error: 'level must be error, warn, or log' } }
  if (typeof raw.message !== 'string' || !raw.message.trim()) return { status: 400, body: { error: 'Missing log message' } }
  if (!allowClientLog()) return { status: 429, body: { error: 'Too many logs' } }
  const source = raw.source === 'page' || raw.source === 'browser' ? raw.source : 'browser'
  const detail = typeof raw.detail === 'string' && raw.detail.trim() ? raw.detail : undefined
  const log = recordLog({
    level: raw.level,
    message: raw.message,
    detail,
    source,
    planId,
    echo: options?.echo !== false,
  })
  return { status: 200, body: { ok: true, log } }
}

export function readLogs(request: Request, planId?: string): { status: number; body: unknown } {
  const params = new URL(request.url).searchParams
  const levelRaw = params.get('level')
  if (levelRaw && !isLevel(levelRaw)) return { status: 400, body: { error: 'level must be error, warn, or log' } }
  const limitRaw = params.get('limit')
  let limit = 200
  if (limitRaw != null && limitRaw !== '') {
    limit = Number(limitRaw)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ENTRIES) {
      return { status: 400, body: { error: 'limit must be from 1 to 500' } }
    }
  }
  return {
    status: 200,
    body: {
      logs: listLogs({
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
  recordLog({
    level: 'error',
    message,
    detail,
    source: 'server',
    planId: planIdFromRequest(request),
  })
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
