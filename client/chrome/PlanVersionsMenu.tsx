import { useQuery } from '@tanstack/react-query'
import { ChevronDown, History } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { formatWhen } from '../../src/dashboardFormat.ts'
import { versionMenuEntries, type VersionMenuEntry } from '../../src/planVersionMenu.ts'
import { Button } from '../ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx'

type PlanVersionsMenuProps = {
  planId: string
  label: string
  triggerClassName: string
  liveHref?: string
  prefetch?: boolean
  /** Icon and chevron only. The label is the tooltip and the accessible name. */
  iconOnly?: boolean
}

type VersionRow = VersionMenuEntry & { createdAt?: number }

/** Body of GET /api/plans/:planId/versions. Kept here so the browser bundle does not import server functions. */
type HistoryPayload = { versions: Array<{ seq: number; title?: string; createdAt?: number }> }

type HistoryResult = { ok: true; history: HistoryPayload } | { ok: false }

/** Published versions for a plan this account owns. A failed or offline read is an empty list. */
async function loadHistory(planId: string): Promise<HistoryResult> {
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

function versionRows(planId: string, result: HistoryResult | undefined, liveHref: string | undefined): VersionRow[] {
  if (!result?.ok) return versionMenuEntries(planId, [], liveHref)
  const entries = versionMenuEntries(planId, result.history.versions, liveHref)
  const dated = new Map(result.history.versions.map((version) => [version.seq, version.createdAt]))
  return entries.map((entry) => ({ ...entry, createdAt: entry.seq == null ? undefined : dated.get(entry.seq) }))
}

export function PlanVersionsMenu({ planId, label, triggerClassName, liveHref, prefetch = false, iconOnly = false }: PlanVersionsMenuProps) {
  const [open, setOpen] = useState(false)
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

  // Read when the menu opens (or right away with prefetch), then reused for 30 s across menus.
  const history = useQuery({
    queryKey: ['plan-versions', planId],
    queryFn: () => loadHistory(planId),
    enabled: (prefetch || open) && !offline,
    staleTime: 30_000,
  })

  const entries: VersionRow[] = versionRows(planId, history.data, liveHref)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {iconOnly ? (
        <Tooltip disabled={open}>
          <VersionsIconTrigger label={label} className={triggerClassName} menu />
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger className={triggerClassName} aria-label="Plan versions">
          {label}
          <ChevronDown size={14} aria-hidden="true" />
        </DropdownMenuTrigger>
      )}
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
 * Server render shows the trigger only. The menu mounts after hydration, so
 * the dropdown's client-only ids and portal never differ between server and browser.
 */
export function PlanVersionsMenuMount(props: PlanVersionsMenuProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) {
    if (!props.iconOnly) {
      return (
        <span className={props.triggerClassName} aria-hidden="true">
          {props.label}
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      )
    }
    return (
      <Tooltip>
        <VersionsIconTrigger label={props.label} className={props.triggerClassName} />
        <TooltipContent>{props.label}</TooltipContent>
      </Tooltip>
    )
  }
  return <PlanVersionsMenu {...props} />
}

function VersionsIconTrigger({ label, className, menu = false }: { label: string; className?: string; menu?: boolean }) {
  const classes = ['plan-action', 'plan-action-menu', className].filter(Boolean).join(' ')
  const face: ReactNode = (
    <>
      <History size={16} aria-hidden="true" />
      <ChevronDown size={16} aria-hidden="true" />
    </>
  )
  if (menu) {
    return (
      <TooltipTrigger
        render={
          <DropdownMenuTrigger aria-label={label} render={<Button variant="ghost" className={classes} />} />
        }
      >
        {face}
      </TooltipTrigger>
    )
  }
  return (
    <TooltipTrigger
      render={<Button type="button" variant="ghost" className={classes} aria-label={label} aria-haspopup="menu" aria-expanded={false} />}
    >
      {face}
    </TooltipTrigger>
  )
}
