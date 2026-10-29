import { useEffect, useState } from 'react'
import { containerFolderName } from '../../src/processesPanel.ts'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover.tsx'

type PlanProcess = {
  id?: string
  title?: string
  mode?: string
  url?: string
  directory?: string
  startedAt?: number
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: {
    summary?: string
    changedPaths?: string[]
  }
}

type PlansPayload = {
  status?: string
  processes?: PlanProcess[]
  selfId?: string | null
  registryUrl?: string | null
}

function lucide(body: string) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

const ICON_WATCH = lucide(
  '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
)
const ICON_REVIEW = lucide(
  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
)
const ICON_COMMENT = lucide(
  '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
)
const ICON_COPY = lucide(
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
)
const ICON_CHECK = lucide('<path d="M20 6 9 17l-5-5"/>')
const ICON_CLOCK = lucide('<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>')
const ICON_FOLDER = lucide(
  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
)
const ICON_BRANCH = lucide(
  '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
)

function safeUrl(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.href
  } catch {
    return ''
  }
}

function age(startedAt: number) {
  const seconds = Math.max(0, Math.round((Date.now() - Number(startedAt)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function modeStatus(mode: string | undefined) {
  if (mode === 'review') return { id: 'review', label: 'Review', icon: ICON_REVIEW }
  if (mode === 'comment') return { id: 'comment', label: 'Comment', icon: ICON_COMMENT }
  return { id: 'watch', label: 'Watch', icon: ICON_WATCH }
}

function statusCopy(payload: PlansPayload, count: number) {
  if (!payload.status) return 'Loading…'
  if (payload.status === 'disabled') return 'Started without the shared registry.'
  if (payload.status === 'offline') return 'Registry is not responding.'
  if (count === 0) return 'No plans are running.'
  if (count === 1) return '1 plan linked to a directory.'
  return `${count} plans linked to directories.`
}

function CopyPath({ directory }: { directory: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [state])

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy path'
  const icon = state === 'copied' ? ICON_CHECK : ICON_COPY

  return (
    <button
      type="button"
      className={`process-icon-btn${state === 'copied' ? ' is-copied' : ''}${state === 'failed' ? ' is-failed' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(directory).then(
          () => setState('copied'),
          () => setState('failed'),
        )
      }}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  )
}

function ProcessCard({ record, selfId }: { record: PlanProcess; selfId: string | null }) {
  const current = Boolean(selfId) && record.id === selfId
  const site = safeUrl(record.url || '')
  const mode = modeStatus(record.mode)
  const directory = typeof record.directory === 'string' ? record.directory : ''
  const git = record.git ?? {}
  const paths = Array.isArray(git.changedPaths) ? git.changedPaths.slice(0, 4) : []
  const title = record.title || 'Untitled plan'

  return (
    <li className={current ? 'process-card is-current' : 'process-card'}>
      <div className="process-title-row">
        {site ? (
          <a className="process-title" href={site} target="_blank" rel="noopener noreferrer">
            {title}
          </a>
        ) : (
          <span className="process-title">{title}</span>
        )}
        <span
          className="process-mode"
          data-mode={mode.id}
          role="img"
          aria-label={mode.label}
          title={mode.label}
          dangerouslySetInnerHTML={{ __html: mode.icon }}
        />
      </div>
      {current ? <span className="process-meta">This page</span> : null}
      {directory ? (
        <div className="process-path-row">
          <span className="process-folder-icon" dangerouslySetInnerHTML={{ __html: ICON_FOLDER }} />
          <code className="process-path" title={directory}>
            {containerFolderName(directory)}
          </code>
          <CopyPath directory={directory} />
        </div>
      ) : null}
      {git.summary || paths.length ? (
        <div className="process-git-row">
          <span className="process-git-icon" dangerouslySetInnerHTML={{ __html: ICON_BRANCH }} />
          {git.summary ? <span className="process-git">{git.summary}</span> : null}
        </div>
      ) : null}
      {paths.length ? (
        <ul className="process-paths">
          {paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      ) : null}
      {record.startedAt || (typeof record.pendingCount === 'number' && record.pendingCount > 0) ? (
        <div className="process-pills">
          {record.startedAt ? (
            <span className="process-pill" title="Uptime">
              <span dangerouslySetInnerHTML={{ __html: ICON_CLOCK }} />
              {age(record.startedAt)}
            </span>
          ) : null}
          {typeof record.pendingCount === 'number' && record.pendingCount > 0 ? (
            <span className="process-pill is-pending">{record.pendingCount} pending</span>
          ) : null}
        </div>
      ) : null}
      {record.executionActive ? (
        <span className="process-meta">
          {record.executionStep ? `live · ${record.executionStep}` : 'execution live'}
        </span>
      ) : null}
    </li>
  )
}

export function PlansMenu({ selfId }: { selfId: string | null }) {
  const [payload, setPayload] = useState<PlansPayload>({ processes: [] })

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const response = await fetch('/api/processes', { cache: 'no-store' })
        if (!response.ok) throw new Error('Request failed')
        const next = (await response.json()) as PlansPayload
        if (!cancelled) setPayload(next)
      } catch {
        if (!cancelled) setPayload({ status: 'offline', processes: [], selfId: null, registryUrl: null })
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const processes = Array.isArray(payload.processes) ? payload.processes : []
  const registryUrl = safeUrl(payload.registryUrl || '')
  const dashboardUrl = registryUrl ? safeUrl(new URL('/dashboard', registryUrl).href) : ''
  const pageSelfId = payload.selfId || selfId

  return (
    <Popover modal={false}>
      <PopoverTrigger className="processes-toggle" data-processes-toggle="">
        <span className="live-dot" aria-hidden="true" />
        Plans
        <span className="processes-count" data-processes-count="">
          {processes.length}
        </span>
      </PopoverTrigger>
      <PopoverContent
        id="processes-panel"
        className="processes-panel"
        side="bottom"
        align="end"
        sideOffset={9}
        collisionPadding={12}
        positionMethod="fixed"
        data-processes-panel=""
      >
        <div className="processes-head">
          <strong>Running plans</strong>
          <span className="processes-links">
            <a className="processes-registry" href={dashboardUrl || undefined} hidden={!dashboardUrl}>
              Dashboard
            </a>
            <a className="processes-registry" href={registryUrl || undefined} hidden={!registryUrl}>
              Registry
            </a>
          </span>
        </div>
        <p className="processes-status" data-processes-status="">
          {statusCopy(payload, processes.length)}
        </p>
        <ul className="processes-list" data-processes-list="">
          {processes.map((record, index) => (
            <ProcessCard key={record.id || index} record={record} selfId={pageSelfId} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
