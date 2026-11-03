import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatWhen } from '../../src/dashboardFormat.ts'
import { versionMenuEntries, type VersionMenuEntry } from '../../src/planVersionMenu.ts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx'

type PlanVersionsMenuProps = {
  planId: string
  label: string
  triggerClassName: string
  liveHref?: string
  prefetch?: boolean
}

type VersionRow = VersionMenuEntry & { createdAt?: number }

/** Body of GET /api/plans/:planId/versions. Kept here so the browser bundle does not import server functions. */
type HistoryPayload = { versions: Array<{ seq: number; title?: string; createdAt?: number }> }

type HistoryResult = { ok: true; history: HistoryPayload } | { ok: false }

/** Published versions for a plan this account owns. A failed or offline read is an empty list. */
async function loadHistory({ data: planId }: { data: string }): Promise<HistoryResult> {
  const response = await fetch(`/api/plans/${encodeURIComponent(planId)}/versions`, {
    cache: 'no-store',
    credentials: 'include',
  }).catch(() => null)
  if (!response?.ok) return { ok: false }
  try {
    return { ok: true, history: (await response.json()) as HistoryPayload }
  } catch {
    return { ok: false }
  }
}

export function PlanVersionsMenu({ planId, label, triggerClassName, liveHref, prefetch = false }: PlanVersionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)
  const [offline, setOffline] = useState(() => (typeof navigator === 'undefined' ? false : navigator.onLine === false))

  useEffect(() => {
    function onOnline() {
      setOffline(false)
    }
    function onOffline() {
      setOffline(true)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!prefetch && !open) return
    if (versions || offline) return
    let cancelled = false
    void loadHistory({ data: planId }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setVersions(versionMenuEntries(planId, [], liveHref))
        return
      }
      const entries = versionMenuEntries(planId, result.history.versions, liveHref)
      const dated = new Map(result.history.versions.map((version) => [version.seq, version.createdAt]))
      setVersions(entries.map((entry) => ({ ...entry, createdAt: entry.seq == null ? undefined : dated.get(entry.seq) })))
    })
    return () => {
      cancelled = true
    }
  }, [liveHref, offline, open, planId, prefetch, versions])

  const entries: VersionRow[] = versions ?? versionMenuEntries(planId, [], liveHref)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className={triggerClassName} aria-label="Plan versions">
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {entries.map((entry) => {
          const when = entry.kind === 'version' ? formatWhen(entry.createdAt) : ''
          if (entry.kind === 'version' && offline) {
            return (
              <DropdownMenuItem key={`${entry.kind}-${entry.seq}-${entry.href}`} disabled title="Needs a connection">
                <span>{entry.label}</span>
                {when ? <span className="plan-menu-meta">{when}</span> : null}
              </DropdownMenuItem>
            )
          }
          return (
            <DropdownMenuLinkItem
              key={`${entry.kind}-${entry.seq ?? 'live'}`}
              href={entry.href}
              aria-current={entry.kind === 'live' && label === 'Live' ? 'page' : undefined}
            >
              <span>{entry.label}</span>
              {when ? <span className="plan-menu-meta">{when}</span> : null}
            </DropdownMenuLinkItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Server render shows the trigger label only. The menu mounts after hydration, so
 * the dropdown's client-only ids and portal never differ between server and browser.
 */
export function PlanVersionsMenuMount(props: PlanVersionsMenuProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) {
    return (
      <span className={props.triggerClassName} aria-hidden="true">
        {props.label}
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    )
  }
  return <PlanVersionsMenu {...props} />
}
