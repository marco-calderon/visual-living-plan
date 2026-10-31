import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx'

async function signOut(): Promise<void> {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  location.href = '/login'
}

export function AccountMenu({ label }: { label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="plan-btn plan-btn-secondary titlebar-user" aria-label="Account menu">
        {label}
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLinkItem href="/settings">Settings</DropdownMenuLinkItem>
        <DropdownMenuItem
          onClick={() => {
            void signOut()
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
