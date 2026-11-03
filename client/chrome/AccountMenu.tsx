import { useMutation } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx'
import { forgetCachedDocuments } from '../offline/forgetDocuments.ts'
import { startOfflineEngine } from '../offline/engine.ts'

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

export function AccountMenu({ label }: { label: string }) {
  const logOut = useMutation({ mutationFn: signOut })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="plan-btn plan-btn-secondary titlebar-user" aria-label="Account menu">
        {label}
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLinkItem href="/settings">Settings</DropdownMenuLinkItem>
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
