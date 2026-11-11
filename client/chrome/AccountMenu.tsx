import { useMutation } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx'
import { forgetCachedDocuments } from '../offline/forgetDocuments.ts'
import { startOfflineEngine } from '../offline/engine.ts'
import { openSettings } from '../../src/settings/settingsSections.ts'
import { DesktopModeIcon } from '../../src/DesktopModeSwitch.tsx'
import { DESKTOP_MODE_SIDES, type PlanHost } from '../../src/hostToolbar.ts'

async function signOut(): Promise<void> {
  const engine = await startOfflineEngine()
  const pending = engine?.pendingCount() ?? 0
  if (pending > 0) {
    const noun = pending === 1 ? '1 change has' : `${pending} changes have`
    if (!window.confirm(`${noun} not been sent. Sign out anyway?`)) return
  }
  // The auth route answers 415 to a POST with no JSON body.
  const response = await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) return
  if (engine) await engine.clearDevice({ force: true })
  else forgetCachedDocuments()
  location.href = '/login'
}

/** desktop/bridge.js marks the root before page scripts run, so this is settled by the time the menu mounts. */
function inDesktopApp(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.desktop !== undefined
}

/**
 * The Local and Cloud switch, inside the desktop app only, under a heading that says what it picks. The
 * current side is shown checked; the other
 * is a `living-plan://switch/<mode>` link, which the app follows ([ADR 0038]).
 *
 * [ADR 0038]: ../../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 */
function DesktopModeItems({ host }: { host: PlanHost }) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuGroupLabel>Environment</DropdownMenuGroupLabel>
        {DESKTOP_MODE_SIDES.map((side) => {
          const label = (
            <span className="plan-menu-label">
              <DesktopModeIcon side={side} />
              {side.label}
            </span>
          )
          return side.mode === host ? (
            <DropdownMenuItem key={side.mode} aria-current="true">
              {label}
              <Check size={16} aria-label="Current" />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuLinkItem key={side.mode} href={`living-plan://switch/${side.mode}`}>
              {label}
            </DropdownMenuLinkItem>
          )
        })}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  )
}

export function AccountMenu({ label, host = 'cloud' }: { label: string; host?: PlanHost }) {
  const logOut = useMutation({ mutationFn: signOut })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="plan-btn plan-btn-secondary titlebar-user" aria-label="Account menu">
        {label}
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {inDesktopApp() ? <DesktopModeItems host={host} /> : null}
        <DropdownMenuLinkItem href="/dashboard">Dashboard</DropdownMenuLinkItem>
        <DropdownMenuLinkItem
          href="/settings"
          onClick={(event) => {
            // A plain click opens the modal over this page. Modified clicks keep the link.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            if (openSettings()) event.preventDefault()
          }}
        >
          Settings
        </DropdownMenuLinkItem>
        <DropdownMenuItem
          disabled={logOut.isPending}
          onClick={() => {
            logOut.mutate()
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
