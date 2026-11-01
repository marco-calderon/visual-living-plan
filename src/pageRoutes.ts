const PLAN_PAGE = /^\/plans\/([A-Za-z0-9_-]{8,80})\/?$/
const HISTORY_PAGE = /^\/plans\/([A-Za-z0-9_-]{8,80})\/history\/?$/

const APP_PAGES = new Set([
  '/',
  '/login',
  '/signup',
  '/local',
  '/sample',
  '/review',
  '/dashboard',
  '/account',
  '/settings',
])

/** Pages TanStack Start renders. Session, writes, and downloads stay on the Worker. */
export function tanstackPage(pathname: string, method: string): 'plan' | 'app' | null {
  if (method !== 'GET' && method !== 'HEAD') return null
  if (HISTORY_PAGE.test(pathname)) return 'app'
  if (PLAN_PAGE.test(pathname)) return 'plan'
  const path = pathname === '/' ? pathname : pathname.replace(/\/+$/, '') || '/'
  if (APP_PAGES.has(path)) return 'app'
  return null
}

export function planIdFromPath(pathname: string): string | null {
  return PLAN_PAGE.exec(pathname)?.[1] ?? null
}
