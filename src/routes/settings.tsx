import { createFileRoute, redirect } from '@tanstack/react-router'
import { settingsErrorCode } from '../settings/settingsSections.ts'

/**
 * Settings are a modal over the page you are on. This URL stays for bookmarks and the account-linking
 * callback, and opens the modal over the dashboard. A linking error opens the Account section.
 */
export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = settingsErrorCode(search.error)
    return error ? { error } : {}
  },
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/dashboard',
      search: search.error ? { settings: 'account', settingsError: search.error } : { settings: 'general' },
      replace: true,
    } as never)
  },
})
