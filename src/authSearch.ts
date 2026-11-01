export type AuthSearch = { next?: string; cli?: string; error?: string }

/** Keep an in-app return path, the CLI callback, and an OAuth error code. Drop anything else. */
export function authSearch(search: Record<string, unknown>): AuthSearch {
  const next =
    typeof search.next === 'string' && search.next.startsWith('/') && !search.next.startsWith('//')
      ? search.next
      : undefined
  const cli = typeof search.cli === 'string' && search.cli ? search.cli : undefined
  const error = typeof search.error === 'string' && search.error ? search.error : undefined
  return { ...(next ? { next } : {}), ...(cli ? { cli } : {}), ...(error ? { error } : {}) }
}

export function authPath(path: '/login' | '/signup', search: AuthSearch): string {
  const params = new URLSearchParams()
  if (search.next) params.set('next', search.next)
  if (search.cli) params.set('cli', search.cli)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** Where email sign-in and GitHub OAuth land after a session exists. */
export function authReturnPath(search: AuthSearch): string {
  if (search.cli) return `/api/auth/cli-session?redirect=${encodeURIComponent(search.cli)}`
  return search.next ?? '/dashboard'
}

export function finishAuth(search: AuthSearch) {
  window.location.assign(authReturnPath(search))
}
