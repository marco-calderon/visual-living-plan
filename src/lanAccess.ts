import { timingSafeEqual } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isLoopbackHost } from './localName'
import { formatHttpOrigin } from './localName'
import { MDNS_HOST } from './mdnsPacket'

const peers = new AsyncLocalStorage<string>()

export function runWithPeer<T>(peer: string, fn: () => T): T {
  return peers.run(peer, fn)
}

export function currentPeer(): string {
  return peers.getStore() ?? ''
}

export const LAN_COOKIE = 'living_plan_lan'

const YEAR_SECONDS = 60 * 60 * 24 * 365

export function secretEquals(expected: string, actual: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export function lanSetCookie(secret: string): string {
  return `${LAN_COOKIE}=${encodeURIComponent(secret)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${YEAR_SECONDS}`
}

export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

export function lanEntryUrl(port: number, secret: string): string {
  return `${formatHttpOrigin(MDNS_HOST, port)}/lan/${secret}`
}

export function safeRedirectPath(value: string | null): string {
  if (!value) return '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return '/dashboard'
  }
  return value
}

/** Plan pages, plan APIs, and the dashboard. The agent stream keeps its bearer check instead. */
export function lanProtectedRequest(method: string, pathname: string): boolean {
  if (pathname === '/lan' || pathname.startsWith('/lan/')) return false
  if (pathname === '/api/health' || pathname === '/favicon.png') return false
  if (pathname === '/api/logs' || pathname.startsWith('/client/') || pathname.startsWith('/assets/')) return false
  if (pathname === '/api/processes' || pathname === '/api/plans') return method === 'GET'
  if (pathname.startsWith('/api/processes/')) return false
  if (pathname === '/' || pathname === '/dashboard' || pathname === '/api/dashboard') return true
  if (pathname.startsWith('/archive/')) return true
  const match = /^\/plans\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match) return false
  const rest = match[2] ?? ''
  if (rest.startsWith('/api/agent-events')) return false
  if (rest.startsWith('/client/') || rest.startsWith('/assets/')) return false
  return true
}

export function authorizeLan(input: {
  enabled: boolean
  secret: string | null
  method: string
  pathname: string
  peer: string
  cookie: string | null
  querySecret: string | null
}): { action: 'allow'; setCookie: string | null } | { action: 'deny' } {
  if (!input.enabled) return { action: 'allow', setCookie: null }
  if (!lanProtectedRequest(input.method, input.pathname)) return { action: 'allow', setCookie: null }
  if (isLoopbackHost(input.peer)) return { action: 'allow', setCookie: null }
  if (input.secret && input.cookie && secretEquals(input.secret, input.cookie)) {
    return { action: 'allow', setCookie: null }
  }
  if (input.secret && input.querySecret && secretEquals(input.secret, input.querySecret)) {
    return { action: 'allow', setCookie: lanSetCookie(input.secret) }
  }
  return { action: 'deny' }
}

export function grantLanEntry(
  presented: string,
  expected: string | null,
  next: string | null,
): { action: 'deny' } | { action: 'redirect'; location: string; setCookie: string } {
  if (!expected || !secretEquals(expected, presented)) return { action: 'deny' }
  return {
    action: 'redirect',
    location: safeRedirectPath(next),
    setCookie: lanSetCookie(expected),
  }
}
