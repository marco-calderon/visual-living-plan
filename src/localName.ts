/**
 * Loopback address helpers.
 * The plan service is published as 127.0.0.1. These helpers format that origin
 * and recognize other loopback spellings. They do not resolve DNS or mDNS names.
 */

export function isLoopbackAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  if (value.startsWith('::ffff:127.')) return true
  const parts = value.split('.')
  if (parts.length !== 4 || parts[0] !== '127') return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || isLoopbackAddress(normalized)
}

const LOOPBACK_HTTP_PORT = 80

/** HTTP origin. Port 80 is omitted, matching what a browser shows for that port. */
export function formatHttpOrigin(host: string, port: number): string {
  const bracketed = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  if (port === LOOPBACK_HTTP_PORT) return `http://${bracketed}`
  return `http://${bracketed}:${port}`
}
