import { isLoopbackHost } from './localName'
import { MDNS_HOST } from './mdnsPacket'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Hostname from a Host header value, without the port or IPv6 brackets. */
function hostName(host: string): string {
  const value = host.trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(1, value.indexOf(']'))
  const colon = value.lastIndexOf(':')
  return colon === -1 ? value : value.slice(0, colon)
}

/**
 * Stop other websites from driving the plan service through the person's browser.
 *
 * - A loopback peer must name this machine in Host. A DNS-rebound page connects to
 *   127.0.0.1 but still sends its own hostname, so it is refused here.
 * - A write that carries an Origin must come from the same host. Browsers send Origin
 *   on every cross-site POST, including plain-text ones that skip the CORS preflight.
 *   The CLI sends no Origin, so it is unaffected.
 */
export function guardRequest(input: {
  method: string
  host: string | null
  origin: string | null
  peer: string
  bindHost: string
}): { action: 'allow' } | { action: 'deny'; reason: string } {
  if (isLoopbackHost(input.peer)) {
    const name = input.host ? hostName(input.host) : ''
    const bindName = hostName(input.bindHost)
    const known = isLoopbackHost(name) || name === MDNS_HOST || (name !== '' && name === bindName)
    if (!known) return { action: 'deny', reason: 'Unknown host' }
  }
  if (!SAFE_METHODS.has(input.method.toUpperCase()) && input.origin !== null) {
    let originHost = ''
    try {
      originHost = new URL(input.origin).host.toLowerCase()
    } catch {
      originHost = ''
    }
    if (!originHost || originHost !== (input.host ?? '').trim().toLowerCase()) {
      return { action: 'deny', reason: 'Cross-site request' }
    }
  }
  return { action: 'allow' }
}
