const PLAN_PAGE = /^\/plans\/([A-Za-z0-9_-]{8,80})\/?$/

/** Pages TanStack Start renders. Everything else stays on the Worker session. */
export function tanstackPage(pathname: string, method: string): 'plan' | 'app' | null {
  if (method !== 'GET' && method !== 'HEAD') return null
  if (PLAN_PAGE.test(pathname)) return 'plan'
  if (pathname === '/login' || pathname === '/login/') return 'app'
  if (pathname === '/local' || pathname === '/local/') return 'app'
  if (pathname === '/sample' || pathname === '/sample/') return 'app'
  return null
}

export function planIdFromPath(pathname: string): string | null {
  return PLAN_PAGE.exec(pathname)?.[1] ?? null
}
